import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { ensureRecurringGenerated } from './recurring.js';
import { todayStr, addMonthsToDate } from '../util.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  kind: z.enum(['pagar', 'receber']),
  desc: z.string().min(1),
  amount: z.number().gt(0),
  due: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  recorrente: z.boolean().optional(),
});

router.get('/', async (req: AuthedRequest, res) => {
  await ensureRecurringGenerated(req.businessId!);
  const rows = await prisma.bill.findMany({ where: { businessId: req.businessId }, orderBy: { due: 'asc' } });
  res.json(rows);
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const row = await prisma.bill.create({ data: { businessId: req.businessId!, ...parsed.data } });
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.bill.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const row = await prisma.bill.update({ where: { id: existing.id }, data: parsed.data });
  res.json(row);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.bill.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.bill.delete({ where: { id: existing.id } });
  res.status(204).end();
});

/** Settle ("dar baixa" / "recebi") — posts the actual cash transaction and marks the bill settled. */
const settleSchema = z.object({ amount: z.number().gt(0) });
router.post('/:id/settle', async (req: AuthedRequest, res) => {
  const parsed = settleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const b = await prisma.bill.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!b) return res.status(404).json({ error: 'not_found' });
  const { amount } = parsed.data;
  const type = b.kind === 'pagar' ? 'despesa' : 'receita';

  const result = await prisma.$transaction(async (tx) => {
    let categoryId = b.categoryId;
    if (!categoryId) {
      const nome = b.kind === 'pagar' ? 'Contas a pagar' : 'Contas a receber';
      let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type, name: nome } });
      if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: nome, type } });
      categoryId = cat.id;
    }
    const t = await tx.transaction.create({
      data: {
        businessId: req.businessId!,
        type,
        amount,
        categoryId,
        clientId: b.clientId,
        date: todayStr(),
        // A package installment payoff moves cash but was already "sold" —
        // its revenue gets recognized per-session (see packages.ts), not here.
        variableCost: type === 'receita' && !b.packageId ? 0 : null,
        cashOnly: !!b.packageId,
        packageId: b.packageId,
        note: b.desc,
      },
    });
    const updatedBill = await tx.bill.update({
      where: { id: b.id },
      data: { settled: true, settledAt: todayStr(), txId: t.id },
    });
    let nextBill = null;
    if (b.recorrente) {
      nextBill = await tx.bill.create({
        data: {
          businessId: req.businessId!,
          kind: b.kind,
          desc: b.desc,
          amount: b.amount,
          due: addMonthsToDate(b.due, 1),
          categoryId: b.categoryId,
          clientId: b.clientId,
          note: b.note,
          recorrente: true,
        },
      });
    }
    return { bill: updatedBill, transaction: t, nextBill };
  });
  res.json(result);
});

router.post('/:id/reopen', async (req: AuthedRequest, res) => {
  const existing = await prisma.bill.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const row = await prisma.bill.update({ where: { id: existing.id }, data: { settled: false, settledAt: null } });
  res.json(row);
});

export default router;
