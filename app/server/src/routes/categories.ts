import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['receita', 'despesa']),
  investment: z.boolean().optional(),
});

router.get('/', async (req: AuthedRequest, res) => {
  const rows = await prisma.category.findMany({ where: { businessId: req.businessId }, orderBy: { name: 'asc' } });
  res.json(rows);
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { name, type, investment } = parsed.data;
  const row = await prisma.category.create({
    data: { businessId: req.businessId!, name, type, investment: type === 'despesa' ? !!investment : false },
  });
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.category.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { name, type, investment } = parsed.data;
  const row = await prisma.category.update({
    where: { id: existing.id },
    data: { name, type, investment: type === 'despesa' ? !!investment : false },
  });
  res.json(row);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.category.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.category.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
