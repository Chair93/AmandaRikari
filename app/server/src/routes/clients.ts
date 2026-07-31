import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { deletePhotoFile } from '../photoStore.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  birthday: z.string().optional().nullable(), // 'YYYY-MM-DD'
  notes: z.string().optional().nullable(),
  /** Referral link: id of the client who brought this one in. */
  indicadoPorId: z.string().optional().nullable(),
});

/** A referral must point at another client of the same business — a foreign
 *  or self id silently becomes null instead of an error. */
async function safeIndicadoPor(businessId: string, id: string | null | undefined, selfId?: string) {
  if (!id || id === selfId) return null;
  const ok = await prisma.client.findFirst({ where: { id, businessId }, select: { id: true } });
  return ok ? id : null;
}

router.get('/', async (req: AuthedRequest, res) => {
  const rows = await prisma.client.findMany({
    where: { businessId: req.businessId },
    orderBy: { name: 'asc' },
    include: { indicadoPor: { select: { id: true, name: true } }, _count: { select: { indicados: true } } },
  });
  res.json(rows.map(({ _count, ...r }) => ({ ...r, indicadosCount: _count.indicados })));
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { indicadoPorId, ...data } = parsed.data;
  const row = await prisma.client.create({
    data: { businessId: req.businessId!, ...data, indicadoPorId: await safeIndicadoPor(req.businessId!, indicadoPorId) },
  });
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.client.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { indicadoPorId, ...data } = parsed.data;
  const row = await prisma.client.update({
    where: { id: existing.id },
    data: { ...data, indicadoPorId: await safeIndicadoPor(req.businessId!, indicadoPorId, existing.id) },
  });
  res.json(row);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.client.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  // Photo rows cascade with the client; the encrypted files on disk don't,
  // so collect them first and remove after the delete commits.
  const photos = await prisma.clientPhoto.findMany({ where: { clientId: existing.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.transaction.updateMany({ where: { clientId: existing.id }, data: { clientId: null } }),
    prisma.client.delete({ where: { id: existing.id } }),
  ]);
  for (const p of photos) deletePhotoFile(req.businessId!, p.id);
  res.status(204).end();
});

export default router;
