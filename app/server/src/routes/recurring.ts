import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { numOr0, todayStr } from '../util.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

/** Generates this month's "conta a pagar" for each recurring bill that hasn't produced one yet. */
export async function ensureRecurringGenerated(businessId: string) {
  const mk = todayStr().slice(0, 7);
  const recs = await prisma.recurring.findMany({ where: { businessId } });
  for (const r of recs) {
    const geradas: string[] = JSON.parse(r.geradas || '[]');
    if (geradas.includes(mk)) continue;
    const dia = Math.min(28, Math.max(1, numOr0(r.dueDay) || 5));
    await prisma.$transaction([
      prisma.bill.create({
        data: {
          businessId,
          kind: 'pagar',
          desc: r.desc,
          amount: r.amount,
          due: `${mk}-${String(dia).padStart(2, '0')}`,
          categoryId: r.categoryId,
          note: 'Despesa fixa',
          recId: r.id,
        },
      }),
      prisma.recurring.update({ where: { id: r.id }, data: { geradas: JSON.stringify([...geradas, mk]) } }),
    ]);
  }
}

const bodySchema = z.object({
  desc: z.string().min(1),
  amount: z.number().gt(0),
  dueDay: z.number().min(1).max(28),
  categoryId: z.string().optional().nullable(),
});

router.get('/', async (req: AuthedRequest, res) => {
  await ensureRecurringGenerated(req.businessId!);
  const rows = await prisma.recurring.findMany({ where: { businessId: req.businessId }, orderBy: { desc: 'asc' } });
  const mk = todayStr().slice(0, 7);
  res.json(rows.map((r) => ({ ...r, geradas: JSON.parse(r.geradas || '[]'), jaGerouEsteMes: JSON.parse(r.geradas || '[]').includes(mk) })));
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const row = await prisma.recurring.create({ data: { businessId: req.businessId!, ...parsed.data } });
  await ensureRecurringGenerated(req.businessId!);
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.recurring.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const row = await prisma.recurring.update({ where: { id: existing.id }, data: parsed.data });
  res.json(row);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.recurring.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.recurring.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
