import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { computeServiceCost, feePctFor } from '../calc.js';
import { assertOwned } from '../ownership.js';
import { applyProductConsumption } from '../consumption.js';
import { adjustSalaBill } from '../sala.js';
import { round2, todayStr } from '../util.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const itemSchema = z.object({ kind: z.enum(['product', 'equipment']), refId: z.string().min(1), qty: z.number().gt(0) });
const saleSchema = z.object({ productId: z.string().min(1), qty: z.number().gt(0) });

const bodySchema = z.object({
  type: z.enum(['receita', 'despesa']),
  amount: z.number().gt(0),
  categoryId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  date: z.string().min(1),
  note: z.string().optional().nullable(),
  items: z.array(itemSchema).optional(),
  sales: z.array(saleSchema).optional(),
  distanciaKm: z.number().optional().nullable(),
  payment: z.enum(['dinheiro', 'pix', 'debito', 'credito']).optional().nullable(),
  parcelas: z.number().int().min(1).max(24).optional().nullable(),
  /** Fiado: 'agora' (default) = paid in full today; 'parte' = only
   *  valorRecebido enters the caixa now, the rest becomes a receivable;
   *  'depois' = nothing today, everything becomes a receivable. */
  recebimento: z.enum(['agora', 'depois', 'parte']).optional(),
  valorRecebido: z.number().min(0).optional().nullable(),
  fiadoVenc: z.string().optional().nullable(),
  /** Split payment (misto): second leg — valor2 paid via payment2. */
  payment2: z.enum(['dinheiro', 'pix', 'debito', 'credito']).optional().nullable(),
  valor2: z.number().gt(0).optional().nullable(),
  parcelas2: z.number().int().min(1).max(24).optional().nullable(),
  /** Room rental is opt-in per atendimento — only charged when flagged.
   *  Mode and value come with the entry (editable on the spot); when absent
   *  the remembered defaults in Settings are used. */
  usarSala: z.boolean().optional(),
  salaModo: z.enum(['fixo', 'pct']).optional().nullable(),
  salaValor: z.number().min(0).optional().nullable(),
  /** Agenda appointment this atendimento fulfills — linked after creation. */
  appointmentId: z.string().optional().nullable(),
  // sócio (partner) fields — when `capital` is set this is a contribution/payout, not a normal tx
  capital: z.enum(['aporte', 'pagamento']).optional().nullable(),
  capitalKind: z.enum(['capital', 'emprestimo']).optional().nullable(),
  socio: z.string().optional().nullable(),
});

const TX_INCLUDE = {
  items: true,
  // The sold product's name rides along so the list can say what was sold.
  sales: { include: { product: { select: { name: true } } } },
  category: { select: { name: true, type: true } },
  client: { select: { name: true } },
  service: { select: { name: true } },
  // Purchase entries point at what they bought; the list shows it by name.
  product: { select: { name: true } },
  equipment: { select: { name: true } },
} as const;

router.get('/', async (req: AuthedRequest, res) => {
  const { from, to, type } = req.query as { from?: string; to?: string; type?: string };
  const rows = await prisma.transaction.findMany({
    where: {
      businessId: req.businessId,
      ...(from || to ? { date: { gte: from || undefined, lte: to || undefined } } : {}),
      ...(type && type !== 'all' ? { type } : {}),
    },
    include: TX_INCLUDE,
    orderBy: { date: 'desc' },
  });
  // A sala fee is the accrualOnly child expense — surface its amount so the
  // edit modal can tell whether this atendimento was flagged as room use.
  const salaFees = await prisma.transaction.findMany({
    where: { businessId: req.businessId, accrualOnly: true, feeOf: { in: rows.map((r) => r.id) } },
    select: { feeOf: true, amount: true, note: true },
  });
  const salaByParent = new Map(salaFees.map((f) => [f.feeOf!, f]));
  res.json(rows.map((r) => ({ ...r, salaFee: salaByParent.get(r.id)?.amount ?? null, salaFeeNote: salaByParent.get(r.id)?.note ?? null })));
});

router.get('/:id', async (req: AuthedRequest, res) => {
  const row = await prisma.transaction.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: TX_INCLUDE });
  if (!row) return res.status(404).json({ error: 'not_found' });
  const salaFee = await prisma.transaction.findFirst({ where: { businessId: req.businessId, accrualOnly: true, feeOf: row.id }, select: { amount: true, note: true } });
  res.json({ ...row, salaFee: salaFee?.amount ?? null, salaFeeNote: salaFee?.note ?? null });
});

async function loadCostCtx(businessId: string) {
  const [products, equipment, settings] = await Promise.all([
    prisma.product.findMany({ where: { businessId } }),
    prisma.equipment.findMany({ where: { businessId } }),
    prisma.settings.findUnique({ where: { businessId } }),
  ]);
  return { products, equipment, settings: settings! };
}

async function findOrCreateCategory(businessId: string, name: string, type: string, investment = false) {
  let cat = await prisma.category.findFirst({ where: { businessId, type, name } });
  if (!cat) cat = await prisma.category.create({ data: { businessId, name, type, investment } });
  return cat;
}

const PAY_LABEL: Record<string, string> = { dinheiro: 'dinheiro', pix: 'Pix', debito: 'débito', credito: 'crédito' };

/** Room fee for one atendimento: mode/value ride with the entry (editable on
 *  the spot); Settings only carries the remembered defaults. Returns the fee
 *  plus a note that encodes the mode so an edit can prefill it later. */
function salaFeeFor(d: { amount: number; usarSala?: boolean; salaModo?: 'fixo' | 'pct' | null; salaValor?: number | null }, settings: { salaMode: string; salaFixo: number; salaPct: number }) {
  if (!d.usarSala) return { amount: 0, note: '', modo: null as 'fixo' | 'pct' | null, valor: 0 };
  const modo = d.salaModo || (settings.salaMode === 'pct' ? 'pct' : 'fixo');
  const valor = d.salaValor ?? (modo === 'pct' ? settings.salaPct : settings.salaFixo);
  const amount = modo === 'pct' ? round2((d.amount * valor) / 100) : round2(valor);
  return { amount, note: modo === 'pct' ? `Uso da sala — ${valor}%` : 'Uso da sala', modo, valor };
}

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const businessId = req.businessId!;

  // Sócio: aporte / pagamento — separate accounting path (excluded from DRE).
  if (d.capital) {
    if (!d.socio?.trim()) return res.status(400).json({ error: 'Informe o nome do sócio' });
    const isAporte = d.capital === 'aporte';
    const catType = isAporte ? 'receita' : 'despesa';
    const cat = await findOrCreateCategory(businessId, isAporte ? 'Aporte de sócio' : 'Pagamento a sócio', catType);
    const row = await prisma.transaction.create({
      data: {
        businessId,
        type: catType,
        amount: d.amount,
        categoryId: cat.id,
        date: d.date,
        note: d.note || null,
        capital: d.capital,
        capitalKind: d.capitalKind || 'capital',
        socio: d.socio.trim(),
      },
      include: TX_INCLUDE,
    });
    return res.status(201).json(row);
  }

  // A pure product sale (VendaModal) doesn't ask for a category — it always
  // files under "Venda de produtos".
  if (!d.categoryId && d.type === 'receita' && (d.sales || []).length > 0) {
    d.categoryId = (await findOrCreateCategory(businessId, 'Venda de produtos', 'receita')).id;
  }
  if (!d.categoryId) return res.status(400).json({ error: 'Categoria é obrigatória' });
  const ctx = await loadCostCtx(businessId);
  const items = d.type === 'receita' ? d.items || [] : [];
  const sales = d.type === 'receita' ? d.sales || [] : [];
  await assertOwned(businessId, {
    categoryIds: [d.categoryId],
    clientIds: [d.clientId],
    serviceIds: [d.serviceId],
    productIds: [...items.filter((it) => it.kind === 'product').map((it) => it.refId), ...sales.map((sl) => sl.productId)],
    equipmentIds: items.filter((it) => it.kind === 'equipment').map((it) => it.refId),
  });
  const distanciaKm = d.type === 'receita' ? d.distanciaKm || 0 : 0;
  const travelCost = distanciaKm * (ctx.settings.costPerKm || 0);
  const itemsCost = items.length ? computeServiceCost(items, ctx.products, ctx.equipment, ctx.settings) : 0;
  const variableCost = items.length || distanciaKm > 0 ? itemsCost + travelCost : null;

  const salesData = sales.map((sl) => {
    const p = ctx.products.find((x) => x.id === sl.productId);
    return { productId: sl.productId, qty: sl.qty, unitPrice: p ? p.salePrice : 0, unitCost: p ? p.avgCost || p.packageCost : 0 };
  });
  const payMethod = d.type === 'receita' ? d.payment || 'pix' : null;
  const parcelas = d.type === 'receita' && payMethod === 'credito' ? d.parcelas || 1 : null;
  // Fiado: revenue is earned today (accrual), cash arrives with the bill.
  const receb = d.type === 'receita' ? d.recebimento || 'agora' : 'agora';
  const cashNow = receb === 'parte' ? Math.min(round2(d.valorRecebido || 0), d.amount) : receb === 'depois' ? 0 : d.amount;
  const fiadoResto = round2(d.amount - cashNow);
  const fiado = d.type === 'receita' && receb !== 'agora' && fiadoResto > 0.005;
  // Split payment (misto): leg 2 pays valor2 via payment2, leg 1 the rest.
  const misto = d.type === 'receita' && !fiado && !!d.payment2 && (d.valor2 || 0) > 0.005 && (d.valor2 || 0) < d.amount - 0.005;
  const parcelas2 = misto && d.payment2 === 'credito' ? d.parcelas2 || 1 : null;
  // Card fees, one per money leg actually received today.
  const feePlan: { amount: number; note: string }[] = [];
  const feeNoteFor = (m: string, n: number | null) => `Taxa ${PAY_LABEL[m]}${n && n > 1 ? ` ${n}x` : ''}`;
  if (d.type === 'receita') {
    if (misto) {
      const v2 = round2(d.valor2!);
      const v1 = round2(d.amount - v2);
      const f1 = round2((v1 * feePctFor(payMethod, ctx.settings, parcelas)) / 100);
      const f2 = round2((v2 * feePctFor(d.payment2!, ctx.settings, parcelas2)) / 100);
      if (f1 > 0) feePlan.push({ amount: f1, note: feeNoteFor(payMethod!, parcelas) + ' (parte 1)' });
      if (f2 > 0) feePlan.push({ amount: f2, note: feeNoteFor(d.payment2!, parcelas2) + ' (parte 2)' });
    } else if (!fiado || cashNow > 0.005) {
      const f = round2(((fiado ? cashNow : d.amount) * feePctFor(payMethod, ctx.settings, parcelas)) / 100);
      if (f > 0) feePlan.push({ amount: f, note: feeNoteFor(payMethod!, parcelas) });
    }
  }
  // Room rental is opt-in per atendimento: only when the entry is a receita
  // tied to a service AND the user flagged that the rented room was used.
  const sala = d.type === 'receita' && d.serviceId ? salaFeeFor(d, ctx.settings) : { amount: 0, note: '', modo: null, valor: 0 };
  const salaAmount = sala.amount;

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        businessId,
        type: d.type,
        amount: d.amount,
        categoryId: d.categoryId!,
        clientId: d.clientId || null,
        serviceId: d.type === 'receita' ? d.serviceId || null : null,
        distanciaKm: distanciaKm || null,
        variableCost,
        date: d.date,
        note: d.note || null,
        // Fiado main entry earns revenue without moving cash; the cash legs
        // and the receivable below carry the money side.
        accrualOnly: fiado,
        payment: fiado ? null : payMethod,
        parcelas: fiado ? null : parcelas,
        payment2: misto ? d.payment2 : null,
        valor2: misto ? round2(d.valor2!) : null,
        parcelas2: misto ? parcelas2 : null,
        consumoBaixado: true,
        items: { create: items.map((it) => ({ kind: it.kind, productId: it.kind === 'product' ? it.refId : null, equipmentId: it.kind === 'equipment' ? it.refId : null, qty: it.qty })) },
        sales: { create: salesData },
      },
      include: TX_INCLUDE,
    });
    if (fiado) {
      // Part paid on the spot enters as a cash-only child; the rest becomes
      // a receivable that dies with the atendimento (fiadoOf cascade).
      if (cashNow > 0.005) {
        await tx.transaction.create({
          data: { businessId, type: 'receita', amount: cashNow, categoryId: d.categoryId!, clientId: d.clientId || null, date: d.date, cashOnly: true, feeOf: created.id, payment: payMethod, parcelas, note: 'Parte paga na hora' },
        });
      }
      const cliente = d.clientId ? ctx.settings && (await tx.client.findFirst({ where: { id: d.clientId }, select: { name: true } })) : null;
      const svcName = d.serviceId ? (await tx.service.findFirst({ where: { id: d.serviceId }, select: { name: true } }))?.name : null;
      const due = d.fiadoVenc || new Date(new Date(d.date + 'T00:00:00').getTime() + 14 * 86400000).toISOString().slice(0, 10);
      await tx.bill.create({
        data: { businessId, kind: 'receber', desc: `Fiado — ${cliente?.name || 'cliente'}${svcName ? ' · ' + svcName : ''}`, amount: fiadoResto, due, clientId: d.clientId || null, fiadoOf: created.id },
      });
    }
    if (salesData.length) {
      for (const sl of salesData) {
        await tx.product.update({ where: { id: sl.productId }, data: { stock: { decrement: sl.qty } } });
      }
    }
    // Ficha-técnica usage takes its fraction of each pot/package off the
    // shelf, so Estoque reflects what's physically left.
    await applyProductConsumption(
      tx,
      items.filter((it) => it.kind === 'product').map((it) => ({ productId: it.refId, qty: it.qty })),
      ctx.products,
      'consume'
    );
    for (const f of feePlan) {
      const fcat = await findOrCreateCategory(businessId, 'Taxas de maquininha', 'despesa');
      await tx.transaction.create({
        data: { businessId, type: 'despesa', amount: f.amount, categoryId: fcat.id, date: d.date, feeOf: created.id, note: f.note },
      });
    }
    if (salaAmount > 0) {
      const scat = await findOrCreateCategory(businessId, 'Uso de sala', 'despesa');
      // accrualOnly: the fee is owed the moment the atendimento happens (it
      // counts against this month's result), but no cash leaves until the
      // accumulated monthly bill to the room owner is settled in Contas.
      await tx.transaction.create({
        data: { businessId, type: 'despesa', amount: salaAmount, categoryId: scat.id, date: d.date, feeOf: created.id, accrualOnly: true, note: sala.note },
      });
      await adjustSalaBill(tx, businessId, d.date, salaAmount, ctx.settings.salaOwner || '');
      // Remember this atendimento's choice as the default for the next one.
      if (sala.modo) {
        await tx.settings.update({ where: { businessId }, data: { salaMode: sala.modo, ...(sala.modo === 'pct' ? { salaPct: sala.valor } : { salaFixo: sala.valor }) } });
      }
    }
    if (d.appointmentId) {
      // updateMany so a forged/foreign id silently no-ops instead of linking
      // across businesses.
      await tx.appointment.updateMany({ where: { id: d.appointmentId, businessId }, data: { txId: created.id } });
    }
    return created;
  });
  res.status(201).json(result);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const businessId = req.businessId!;
  const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, businessId }, include: { sales: true, items: true } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const d = parsed.data;
  // Generated/linked entries can't be edited in place — each one has a
  // counterpart (stock, average cost, asset, bill) that a raw edit would
  // silently desync. The message always points at the right lever.
  if (existing.feeOf) return res.status(400).json({ error: 'Taxas e uso de sala são automáticos — edite o atendimento que os gerou.' });
  if (existing.accrualOnly && existing.productId) return res.status(400).json({ error: 'Ajustes de inventário e brindes nascem na tela de Estoque — use a Contagem pra corrigir o estoque.' });
  if (existing.accrualOnly && existing.equipmentId) return res.status(400).json({ error: 'Depreciação é automática — pra mudar, edite a vida útil do bem ou dê baixa nele.' });
  if (existing.estoque || existing.ativo) return res.status(400).json({ error: 'Compras de estoque/bens não podem ser editadas (o custo médio já foi calculado) — exclua e refaça a entrada.' });
  if (existing.packageId) return res.status(400).json({ error: 'Lançamentos de pacote são automáticos — mexa no pacote pela ficha do cliente.' });
  // A fiado atendimento is a small web (accrual entry + cash leg + open
  // receivable) — editing it in place would silently desync the three.
  const fiadoArtifacts = await prisma.bill.findFirst({ where: { fiadoOf: existing.id }, select: { id: true } });
  if (fiadoArtifacts || (existing.accrualOnly && existing.type === 'receita' && !existing.packageId && !existing.feeOf)) {
    const legs = await prisma.transaction.findFirst({ where: { feeOf: existing.id, type: 'receita', cashOnly: true }, select: { id: true } });
    if (fiadoArtifacts || legs) return res.status(400).json({ error: 'Este lançamento tem fiado (valor a receber). Pra alterar, exclua e registre de novo — a conta a receber sai junto.' });
  }

  if (d.capital) {
    if (!d.socio?.trim()) return res.status(400).json({ error: 'Informe o nome do sócio' });
    const isAporte = d.capital === 'aporte';
    const catType = isAporte ? 'receita' : 'despesa';
    const cat = await findOrCreateCategory(businessId, isAporte ? 'Aporte de sócio' : 'Pagamento a sócio', catType);
    const row = await prisma.transaction.update({
      where: { id: existing.id },
      data: { type: catType, amount: d.amount, categoryId: cat.id, date: d.date, note: d.note || null, capital: d.capital, capitalKind: d.capitalKind || 'capital', socio: d.socio.trim() },
      include: TX_INCLUDE,
    });
    return res.json(row);
  }

  // A pure product sale (VendaModal) doesn't ask for a category — it always
  // files under "Venda de produtos".
  if (!d.categoryId && d.type === 'receita' && (d.sales || []).length > 0) {
    d.categoryId = (await findOrCreateCategory(businessId, 'Venda de produtos', 'receita')).id;
  }
  if (!d.categoryId) return res.status(400).json({ error: 'Categoria é obrigatória' });
  const ctx = await loadCostCtx(businessId);
  const items = d.type === 'receita' ? d.items || [] : [];
  const sales = d.type === 'receita' ? d.sales || [] : [];
  await assertOwned(businessId, {
    categoryIds: [d.categoryId],
    clientIds: [d.clientId],
    serviceIds: [d.serviceId],
    productIds: [...items.filter((it) => it.kind === 'product').map((it) => it.refId), ...sales.map((sl) => sl.productId)],
    equipmentIds: items.filter((it) => it.kind === 'equipment').map((it) => it.refId),
  });
  const distanciaKm = d.type === 'receita' ? d.distanciaKm || 0 : 0;
  const travelCost = distanciaKm * (ctx.settings.costPerKm || 0);
  const itemsCost = items.length ? computeServiceCost(items, ctx.products, ctx.equipment, ctx.settings) : 0;
  const variableCost = items.length || distanciaKm > 0 ? itemsCost + travelCost : null;
  const salesData = sales.map((sl) => {
    const p = ctx.products.find((x) => x.id === sl.productId);
    return { productId: sl.productId, qty: sl.qty, unitPrice: p ? p.salePrice : 0, unitCost: p ? p.avgCost || p.packageCost : 0 };
  });
  const payMethod = d.type === 'receita' ? d.payment || 'pix' : null;
  const parcelas = d.type === 'receita' && payMethod === 'credito' ? d.parcelas || 1 : null;
  const misto = d.type === 'receita' && !!d.payment2 && (d.valor2 || 0) > 0.005 && (d.valor2 || 0) < d.amount - 0.005;
  const parcelas2 = misto && d.payment2 === 'credito' ? d.parcelas2 || 1 : null;
  const feePlan: { amount: number; note: string }[] = [];
  const feeNoteFor = (m: string, n: number | null) => `Taxa ${PAY_LABEL[m]}${n && n > 1 ? ` ${n}x` : ''}`;
  if (d.type === 'receita') {
    if (misto) {
      const v2 = round2(d.valor2!);
      const v1 = round2(d.amount - v2);
      const f1 = round2((v1 * feePctFor(payMethod, ctx.settings, parcelas)) / 100);
      const f2 = round2((v2 * feePctFor(d.payment2!, ctx.settings, parcelas2)) / 100);
      if (f1 > 0) feePlan.push({ amount: f1, note: feeNoteFor(payMethod!, parcelas) + ' (parte 1)' });
      if (f2 > 0) feePlan.push({ amount: f2, note: feeNoteFor(d.payment2!, parcelas2) + ' (parte 2)' });
    } else {
      const f = round2((d.amount * feePctFor(payMethod, ctx.settings, parcelas)) / 100);
      if (f > 0) feePlan.push({ amount: f, note: feeNoteFor(payMethod!, parcelas) });
    }
  }
  const sala = d.type === 'receita' && d.serviceId ? salaFeeFor(d, ctx.settings) : { amount: 0, note: '', modo: null, valor: 0 };
  const salaAmount = sala.amount;

  const result = await prisma.$transaction(async (tx) => {
    // restock according to the delta between previous and next sales
    const delta: Record<string, number> = {};
    existing.sales.forEach((sl) => (delta[sl.productId] = (delta[sl.productId] || 0) + sl.qty));
    salesData.forEach((sl) => (delta[sl.productId] = (delta[sl.productId] || 0) - sl.qty));
    for (const [productId, qtyDelta] of Object.entries(delta)) {
      if (qtyDelta !== 0) await tx.product.update({ where: { id: productId }, data: { stock: { increment: qtyDelta } } });
    }

    // Fractional consumption: give back what the old version took (only if it
    // ever took it — pre-feature entries never consumed), then take the new.
    if (existing.consumoBaixado) {
      await applyProductConsumption(
        tx,
        existing.items.filter((it) => it.kind === 'product' && it.productId).map((it) => ({ productId: it.productId!, qty: it.qty })),
        ctx.products,
        'restore'
      );
    }
    await applyProductConsumption(
      tx,
      items.filter((it) => it.kind === 'product').map((it) => ({ productId: it.refId, qty: it.qty })),
      ctx.products,
      'consume'
    );

    await tx.transactionItem.deleteMany({ where: { transactionId: existing.id } });
    await tx.transactionSale.deleteMany({ where: { transactionId: existing.id } });
    const updated = await tx.transaction.update({
      where: { id: existing.id },
      data: {
        type: d.type,
        amount: d.amount,
        categoryId: d.categoryId!,
        clientId: d.clientId || null,
        serviceId: d.type === 'receita' ? d.serviceId || null : null,
        distanciaKm: distanciaKm || null,
        variableCost,
        date: d.date,
        note: d.note || null,
        payment: payMethod,
        parcelas,
        payment2: misto ? d.payment2 : null,
        valor2: misto ? round2(d.valor2!) : null,
        parcelas2: misto ? parcelas2 : null,
        consumoBaixado: true,
        capital: null,
        socio: null,
        items: { create: items.map((it) => ({ kind: it.kind, productId: it.kind === 'product' ? it.refId : null, equipmentId: it.kind === 'equipment' ? it.refId : null, qty: it.qty })) },
        sales: { create: salesData },
      },
      include: TX_INCLUDE,
    });

    // Replace the machine-fee and room-fee expenses tied to this transaction.
    // The room fee is the accrualOnly one — its old amount also has to come
    // back out of the month's accumulated bill to the room owner.
    const oldSalaFee = await tx.transaction.findFirst({ where: { feeOf: existing.id, accrualOnly: true } });
    await tx.transaction.deleteMany({ where: { feeOf: existing.id } });
    if (oldSalaFee) await adjustSalaBill(tx, businessId, oldSalaFee.date, -oldSalaFee.amount, ctx.settings.salaOwner || '');
    for (const f of feePlan) {
      const fcat = await findOrCreateCategory(businessId, 'Taxas de maquininha', 'despesa');
      await tx.transaction.create({
        data: { businessId, type: 'despesa', amount: f.amount, categoryId: fcat.id, date: d.date, feeOf: existing.id, note: f.note },
      });
    }
    if (salaAmount > 0) {
      const scat = await findOrCreateCategory(businessId, 'Uso de sala', 'despesa');
      await tx.transaction.create({
        data: { businessId, type: 'despesa', amount: salaAmount, categoryId: scat.id, date: d.date, feeOf: existing.id, accrualOnly: true, note: sala.note },
      });
      await adjustSalaBill(tx, businessId, d.date, salaAmount, ctx.settings.salaOwner || '');
      if (sala.modo) {
        await tx.settings.update({ where: { businessId }, data: { salaMode: sala.modo, ...(sala.modo === 'pct' ? { salaPct: sala.valor } : { salaFixo: sala.valor }) } });
      }
    }
    return updated;
  });
  res.json(result);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { sales: true, items: true } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  // Same protection as PUT: children and stock-linked accruals only make
  // sense next to their counterpart.
  if (existing.feeOf) return res.status(400).json({ error: 'Taxas e uso de sala são automáticos — exclua (ou edite) o atendimento que os gerou.' });
  if (existing.accrualOnly && existing.productId) return res.status(400).json({ error: 'Pra desfazer um ajuste de inventário ou brinde, faça uma nova Contagem no Estoque — ela acerta estoque e resultado juntos.' });
  if (existing.accrualOnly && existing.equipmentId) return res.status(400).json({ error: 'Depreciação é automática e acompanha o bem — pra parar, dê baixa no bem.' });
  if (existing.packageId && existing.cashOnly) return res.status(400).json({ error: 'Essa é a venda do pacote — pra desfazer, exclua o pacote na ficha do cliente.' });
  if (existing.estoque && existing.productId && (existing.note || '').startsWith('Diferença de custo')) {
    return res.status(400).json({ error: 'Essa diferença já foi rateada no custo médio — excluir deixaria o custo errado. Se lançou errado, compense com nova Dif. de custo ou Contagem.' });
  }
  await prisma.$transaction(async (tx) => {
    for (const sl of existing.sales) {
      await tx.product.update({ where: { id: sl.productId }, data: { stock: { increment: sl.qty } } });
    }
    // Deleting a stock/asset purchase really undoes it: the units leave the
    // shelf and the weighted-average cost rolls back (qty rides in the note).
    const qtyNote = (existing.note || '').match(/x([\d.]+)\s*$/);
    if (existing.estoque && existing.productId && qtyNote) {
      const qty = Number(qtyNote[1]);
      const p = await tx.product.findFirst({ where: { id: existing.productId } });
      if (p && qty > 0) {
        const unitCost = existing.amount / qty;
        const prevStock = round2(p.stock - qty);
        let prevAvg = p.avgCost;
        if (prevStock > 0.005) {
          const calc = (p.avgCost * p.stock - unitCost * qty) / prevStock;
          if (isFinite(calc) && calc >= 0) prevAvg = calc;
        }
        await tx.product.update({ where: { id: p.id }, data: { stock: prevStock, avgCost: prevAvg } });
      }
    }
    if (existing.ativo && existing.equipmentId && qtyNote) {
      const qty = Number(qtyNote[1]);
      if (qty > 0) await tx.equipment.updateMany({ where: { id: existing.equipmentId }, data: { qty: { decrement: qty } } });
    }
    // Undoing a package session gives the session back to the package.
    if (existing.packageId && existing.accrualOnly && existing.type === 'receita') {
      await tx.package.updateMany({ where: { id: existing.packageId, used: { gt: 0 } }, data: { used: { decrement: 1 } } });
    }
    // A settled fiado bill dies with the atendimento (FK cascade) — its
    // settlement cash entry has to go too, or the caixa keeps money whose
    // story was erased.
    const fiadoSettled = await tx.bill.findMany({ where: { fiadoOf: existing.id, txId: { not: null } }, select: { txId: true } });
    if (fiadoSettled.length) {
      await tx.transaction.deleteMany({ where: { id: { in: fiadoSettled.map((b) => b.txId!) } } });
    }
    if (existing.consumoBaixado) {
      const prods = await tx.product.findMany({ where: { businessId: req.businessId! }, select: { id: true, packageQty: true } });
      await applyProductConsumption(
        tx,
        existing.items.filter((it) => it.kind === 'product' && it.productId).map((it) => ({ productId: it.productId!, qty: it.qty })),
        prods,
        'restore'
      );
    }
    // Room fee going away → its share leaves the month's bill too (negative
    // delta never creates a bill, so the owner name doesn't matter here).
    const salaFee = await tx.transaction.findFirst({ where: { feeOf: existing.id, accrualOnly: true } });
    if (salaFee) await adjustSalaBill(tx, req.businessId!, salaFee.date, -salaFee.amount, '');
    await tx.transaction.deleteMany({ where: { OR: [{ id: existing.id }, { feeOf: existing.id }] } });
  });
  res.status(204).end();
});

/** Pró-labore withdrawal — posts a despesa flagged `prolabore: true`. */
/** Refund without rewriting history: books a 'Devoluções' expense tied to
 *  the client, keeps the original atendimento (and its already-paid card
 *  fee) untouched. Partial refunds welcome. */
const devolverSchema = z.object({ valor: z.number().gt(0) });
router.post('/:id/devolver', async (req: AuthedRequest, res) => {
  const parsed = devolverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { client: { select: { name: true } }, service: { select: { name: true } } } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.type !== 'receita') return res.status(400).json({ error: 'Só receitas podem ser devolvidas.' });
  const cat = await findOrCreateCategory(req.businessId!, 'Devoluções', 'despesa');
  const origem = existing.service?.name || existing.note || 'atendimento';
  const row = await prisma.transaction.create({
    data: {
      businessId: req.businessId!,
      type: 'despesa',
      amount: parsed.data.valor,
      categoryId: cat.id,
      clientId: existing.clientId,
      date: new Date().toISOString().slice(0, 10),
      note: `Devolução — ${origem}${existing.client ? ' (' + existing.client.name + ')' : ''} de ${existing.date.slice(8, 10)}/${existing.date.slice(5, 7)}`,
    },
    include: TX_INCLUDE,
  });
  res.status(201).json(row);
});

const sacarSchema = z.object({ amount: z.number().gt(0), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
router.post('/sacar-prolabore', async (req: AuthedRequest, res) => {
  const parsed = sacarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const businessId = req.businessId!;
  const cat = await findOrCreateCategory(businessId, 'Pró-labore', 'despesa');
  const row = await prisma.transaction.create({
    data: { businessId, type: 'despesa', amount: parsed.data.amount, categoryId: cat.id, date: parsed.data.date || todayStr(), prolabore: true, note: 'Pró-labore' },
    include: TX_INCLUDE,
  });
  res.status(201).json(row);
});

export default router;
