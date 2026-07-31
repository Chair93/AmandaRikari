import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['receita', 'despesa', 'servico']),
  investment: z.boolean().optional(),
});

/** Starter set of service categories — becomes editable rows on first load
 *  (they used to be hardcoded suggestions in the service form). */
const SERVICO_DEFAULTS = [
  'Limpeza de pele',
  'Peeling',
  'Microagulhamento',
  'Drenagem linfática',
  'Radiofrequência estética',
  'Criolipólise',
  'Depilação a laser',
  'Toxina botulínica',
  'Preenchimento facial',
  'Bioestimulador de colágeno',
  'Laser facial',
  'Massagem estética',
  'Harmonização facial',
];

router.get('/', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  // One-time self-seed: service categories become manageable rows, including
  // any names already typed into existing services.
  const hasServico = await prisma.category.findFirst({ where: { businessId, type: 'servico' }, select: { id: true } });
  if (!hasServico) {
    const usados = await prisma.service.findMany({ where: { businessId, category: { not: null } }, select: { category: true } });
    const nomes = [...new Set([...SERVICO_DEFAULTS, ...usados.map((s) => s.category!.trim()).filter(Boolean)])];
    await prisma.category.createMany({ data: nomes.map((name) => ({ businessId, name, type: 'servico' })) });
  }
  const rows = await prisma.category.findMany({ where: { businessId }, orderBy: { name: 'asc' } });
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
  // Services store the category by name — a rename follows through so they
  // don't get orphaned under the old label.
  if (existing.type === 'servico' && existing.name !== name) {
    await prisma.service.updateMany({ where: { businessId: req.businessId!, category: existing.name }, data: { category: name } });
  }
  res.json(row);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.category.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.category.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
