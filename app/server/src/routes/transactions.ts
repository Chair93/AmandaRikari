import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { computeServiceCost, feePctFor } from '../calc.js';
import { assertOwned } from '../ownership.js';
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
  res.json(rows);
});

router.get('/:id', async (req: AuthedRequest, res) => {
  const row = await prisma.transaction.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: TX_INCLUDE });
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
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
  const feePct = d.type === 'receita' ? feePctFor(payMethod, ctx.settings) : 0;
  const feeAmount = round2((d.amount * feePct) / 100);

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
        payment: payMethod,
        items: { create: items.map((it) => ({ kind: it.kind, productId: it.kind === 'product' ? it.refId : null, equipmentId: it.kind === 'equipment' ? it.refId : null, qty: it.qty })) },
        sales: { create: salesData },
      },
      include: TX_INCLUDE,
    });
    if (salesData.length) {
      for (const sl of salesData) {
        await tx.product.update({ where: { id: sl.productId }, data: { stock: { decrement: sl.qty } } });
      }
    }
    if (feeAmount > 0) {
      const fcat = await findOrCreateCategory(businessId, 'Taxas de maquininha', 'despesa');
      await tx.transaction.create({
        data: { businessId, type: 'despesa', amount: feeAmount, categoryId: fcat.id, date: d.date, feeOf: created.id, note: `Taxa ${PAY_LABEL[payMethod!]}` },
      });
    }
    return created;
  });
  res.status(201).json(result);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const businessId = req.businessId!;
  const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, businessId }, include: { sales: true } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const d = parsed.data;

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
  const feePct = d.type === 'receita' ? feePctFor(payMethod, ctx.settings) : 0;
  const feeAmount = round2((d.amount * feePct) / 100);

  const result = await prisma.$transaction(async (tx) => {
    // restock according to the delta between previous and next sales
    const delta: Record<string, number> = {};
    existing.sales.forEach((sl) => (delta[sl.productId] = (delta[sl.productId] || 0) + sl.qty));
    salesData.forEach((sl) => (delta[sl.productId] = (delta[sl.productId] || 0) - sl.qty));
    for (const [productId, qtyDelta] of Object.entries(delta)) {
      if (qtyDelta !== 0) await tx.product.update({ where: { id: productId }, data: { stock: { increment: qtyDelta } } });
    }

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
        capital: null,
        socio: null,
        items: { create: items.map((it) => ({ kind: it.kind, productId: it.kind === 'product' ? it.refId : null, equipmentId: it.kind === 'equipment' ? it.refId : null, qty: it.qty })) },
        sales: { create: salesData },
      },
      include: TX_INCLUDE,
    });

    // Replace any machine-fee expense tied to this transaction.
    await tx.transaction.deleteMany({ where: { feeOf: existing.id } });
    if (feeAmount > 0) {
      const fcat = await findOrCreateCategory(businessId, 'Taxas de maquininha', 'despesa');
      await tx.transaction.create({
        data: { businessId, type: 'despesa', amount: feeAmount, categoryId: fcat.id, date: d.date, feeOf: existing.id, note: `Taxa ${PAY_LABEL[payMethod!]}` },
      });
    }
    return updated;
  });
  res.json(result);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { sales: true } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.$transaction(async (tx) => {
    for (const sl of existing.sales) {
      await tx.product.update({ where: { id: sl.productId }, data: { stock: { increment: sl.qty } } });
    }
    await tx.transaction.deleteMany({ where: { OR: [{ id: existing.id }, { feeOf: existing.id }] } });
  });
  res.status(204).end();
});

/** Pró-labore withdrawal — posts a despesa flagged `prolabore: true`. */
const sacarSchema = z.object({ amount: z.number().gt(0) });
router.post('/sacar-prolabore', async (req: AuthedRequest, res) => {
  const parsed = sacarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const businessId = req.businessId!;
  const cat = await findOrCreateCategory(businessId, 'Pró-labore', 'despesa');
  const row = await prisma.transaction.create({
    data: { businessId, type: 'despesa', amount: parsed.data.amount, categoryId: cat.id, date: todayStr(), prolabore: true, note: 'Pró-labore' },
    include: TX_INCLUDE,
  });
  res.status(201).json(row);
});

export default router;
