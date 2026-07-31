import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { feePctFor, computeServiceCost, packageSessionAmount, salaFeeAmount } from '../calc.js';
import { assertOwned } from '../ownership.js';
import { applyProductConsumption } from '../consumption.js';
import { adjustSalaBill } from '../sala.js';
import { todayStr, addMonthsToDate, round2 } from '../util.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

router.get('/', async (req: AuthedRequest, res) => {
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
  const rows = await prisma.package.findMany({
    where: { businessId: req.businessId, ...(clientId ? { clientId } : {}) },
    orderBy: { date: 'desc' },
  });
  res.json(rows);
});

const createSchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().optional().nullable(),
  /** Combo package: every session delivers all of these procedures. */
  serviceIds: z.array(z.string().min(1)).max(10).optional(),
  sessions: z.number().int().gt(0),
  amount: z.number().gt(0),
  payment: z.enum(['dinheiro', 'pix', 'debito', 'credito']),
  mode: z.enum(['avista', 'prazo']),
  parcelas: z.number().int().gt(0).optional(),
  /** Credit-card installments for an à-vista sale (machine fee per count). */
  parcelasCartao: z.number().int().min(1).max(24).optional(),
  primeiroVenc: z.string().optional(),
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const svcIds = [...new Set((d.serviceIds?.length ? d.serviceIds : d.serviceId ? [d.serviceId] : []).filter(Boolean))] as string[];
  await assertOwned(req.businessId!, { clientIds: [d.clientId], serviceIds: svcIds });
  const svs = svcIds.length ? await prisma.service.findMany({ where: { id: { in: svcIds }, businessId: req.businessId } }) : [];
  // Human label for descriptions: "Limpeza + Peeling".
  const svLabel = svcIds.map((id) => svs.find((x) => x.id === id)?.name).filter(Boolean).join(' + ');

  if (d.mode === 'prazo') {
    const n = Math.max(1, d.parcelas || 1);
    const base = Math.floor((d.amount / n) * 100) / 100;
    const result = await prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({
        data: {
          businessId: req.businessId!,
          clientId: d.clientId,
          serviceId: svcIds[0] || null,
          services: { create: svcIds.map((sid) => ({ serviceId: sid })) },
          sessions: d.sessions,
          amount: d.amount,
          date: todayStr(),
          aprazo: true,
          parcelas: n,
        },
      });
      const first = d.primeiroVenc || todayStr();
      for (let i = 0; i < n; i++) {
        const val = i === n - 1 ? round2(d.amount - base * (n - 1)) : base;
        await tx.bill.create({
          data: {
            businessId: req.businessId!,
            kind: 'receber',
            desc: `Pacote ${d.sessions}x${svLabel ? ' ' + svLabel : ''} — parcela ${i + 1}/${n}`,
            amount: val,
            due: addMonthsToDate(first, i),
            clientId: d.clientId,
            packageId: pkg.id,
          },
        });
      }
      return pkg;
    });
    return res.status(201).json(result);
  }

  const settings = (await prisma.settings.findUnique({ where: { businessId: req.businessId } }))!;
  const parcelasCartao = d.payment === 'credito' ? d.parcelasCartao || 1 : null;
  const feePct = feePctFor(d.payment, settings, parcelasCartao);
  const fee = round2((d.amount * feePct) / 100);

  const result = await prisma.$transaction(async (tx) => {
    let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'receita', name: 'Pacote pré-pago' } });
    if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Pacote pré-pago', type: 'receita' } });
    const t = await tx.transaction.create({
      data: {
        businessId: req.businessId!,
        type: 'receita',
        amount: d.amount,
        categoryId: cat.id,
        clientId: d.clientId,
        payment: d.payment,
        parcelas: parcelasCartao,
        date: todayStr(),
        cashOnly: true, // money's in, but the sessions aren't delivered yet — see use-session
        note: `Pacote ${d.sessions}x${svLabel ? ' ' + svLabel : ''}`,
      },
    });
    if (fee > 0) {
      let fcat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'despesa', name: 'Taxas de maquininha' } });
      if (!fcat) fcat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Taxas de maquininha', type: 'despesa' } });
      await tx.transaction.create({
        data: {
          businessId: req.businessId!,
          type: 'despesa',
          amount: fee,
          categoryId: fcat.id,
          date: todayStr(),
          feeOf: t.id,
          note: `Taxa ${d.payment}`,
        },
      });
    }
    const pkg = await tx.package.create({
      data: {
        businessId: req.businessId!,
        clientId: d.clientId,
        serviceId: svcIds[0] || null,
        services: { create: svcIds.map((sid) => ({ serviceId: sid })) },
        sessions: d.sessions,
        amount: d.amount,
        date: todayStr(),
        transactions: { connect: { id: t.id } },
      },
    });
    return pkg;
  });
  res.status(201).json(result);
});

router.post('/:id/use-session', async (req: AuthedRequest, res) => {
  const pkg = await prisma.package.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { services: true } });
  if (!pkg) return res.status(404).json({ error: 'not_found' });
  if (pkg.used >= pkg.sessions) return res.status(400).json({ error: 'Pacote já totalmente utilizado' });
  // Combo package: a session delivers every linked procedure, so fichas
  // merge. Falls back to the legacy single serviceId.
  const svcIds = pkg.services.length ? pkg.services.map((x) => x.serviceId) : pkg.serviceId ? [pkg.serviceId] : [];
  const svsAll = svcIds.length ? await prisma.service.findMany({ where: { id: { in: svcIds } }, include: { items: true } }) : [];
  const svs = svcIds.map((id) => svsAll.find((x) => x.id === id)).filter((x): x is (typeof svsAll)[number] => !!x);
  const svLabel = svs.map((x) => x.name).join(' + ');
  const [products, equipment, settings] = await Promise.all([
    prisma.product.findMany({ where: { businessId: req.businessId } }),
    prisma.equipment.findMany({ where: { businessId: req.businessId } }),
    prisma.settings.findUnique({ where: { businessId: req.businessId } }),
  ]);
  const items = svs.flatMap((s) => s.items.map((it) => ({ kind: it.kind, refId: (it.productId || it.equipmentId)!, qty: it.qty })));
  const variableCost = items.length ? computeServiceCost(items, products, equipment, settings!) : 0;
  // Recognize this session's proportional share of the package price now —
  // the cash already came in at sale/installment time, so this earns
  // revenue without moving new cash (accrualOnly, see cashDelta in calc.ts).
  const recognizedAmount = packageSessionAmount(pkg, pkg.used + 1);

  const result = await prisma.$transaction(async (tx) => {
    let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'receita', name: 'Sessão de pacote' } });
    if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Sessão de pacote', type: 'receita' } });
    const t = await tx.transaction.create({
      data: {
        businessId: req.businessId!,
        type: 'receita',
        amount: recognizedAmount,
        categoryId: cat.id,
        clientId: pkg.clientId,
        serviceId: pkg.serviceId,
        variableCost,
        accrualOnly: true,
        packageId: pkg.id,
        date: todayStr(),
        consumoBaixado: true,
        note: `Sessão do pacote${svLabel ? ' — ' + svLabel : ''}`,
        items: { create: items.map((it) => ({ kind: it.kind, productId: it.kind === 'product' ? it.refId : null, equipmentId: it.kind === 'equipment' ? it.refId : null, qty: it.qty })) },
      },
    });
    await applyProductConsumption(
      tx,
      items.filter((it) => it.kind === 'product').map((it) => ({ productId: it.refId, qty: it.qty })),
      products,
      'consume'
    );
    // A package session in the rented room owes the room fee like any
    // atendimento — but only when the caller flags it (room use is opt-in
    // per session). % mode charges over this session's share of the package
    // price. accrualOnly: the debt accumulates in the month's bill to the
    // room owner; cash only moves when that's settled.
    const usarSala = req.body?.usarSala === true;
    const salaAmount = usarSala ? round2(salaFeeAmount(recognizedAmount, settings!)) : 0;
    if (salaAmount > 0) {
      let scat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'despesa', name: 'Uso de sala' } });
      if (!scat) scat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Uso de sala', type: 'despesa' } });
      await tx.transaction.create({
        data: { businessId: req.businessId!, type: 'despesa', amount: salaAmount, categoryId: scat.id, date: todayStr(), feeOf: t.id, accrualOnly: true, note: 'Uso da sala' },
      });
      await adjustSalaBill(tx, req.businessId!, todayStr(), salaAmount, settings!.salaOwner || '');
    }
    const updated = await tx.package.update({ where: { id: pkg.id }, data: { used: pkg.used + 1 } });
    return { transaction: t, package: updated };
  });
  res.json(result);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.package.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.package.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
