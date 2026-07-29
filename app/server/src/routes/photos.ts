import { Router, json } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { savePhoto, readPhoto, deletePhotoFile } from '../photoStore.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // post-compression photos are ~300KB; 5MB is generous

/** Upload como JSON base64 (data URL). The web client compresses on-device
 *  before sending — which also strips EXIF/GPS from the original. */
const uploadSchema = z.object({
  data: z.string().min(50).max(8_000_000),
  tipo: z.enum(['anamnese', 'antes', 'depois', 'outra']).optional(),
  /** Atendimento the photo documents — must belong to this business+client. */
  txId: z.string().optional().nullable(),
});

router.get('/client/:clientId', async (req: AuthedRequest, res) => {
  const client = await prisma.client.findFirst({ where: { id: req.params.clientId, businessId: req.businessId } });
  if (!client) return res.status(404).json({ error: 'not_found' });
  const rows = await prisma.clientPhoto.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});

router.post('/client/:clientId', json({ limit: '8mb' }), async (req: AuthedRequest, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Arquivo inválido' });
  const client = await prisma.client.findFirst({ where: { id: req.params.clientId, businessId: req.businessId } });
  if (!client) return res.status(404).json({ error: 'not_found' });

  const m = parsed.data.data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'Envie uma imagem (JPEG, PNG ou WebP).' });
  const mime = m[1];
  if (!ALLOWED.has(mime)) return res.status(400).json({ error: 'Formato não suportado.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > MAX_BYTES) return res.status(400).json({ error: 'Imagem muito grande (máx. 5MB).' });

  let txId: string | null = null;
  if (parsed.data.txId) {
    const tx = await prisma.transaction.findFirst({ where: { id: parsed.data.txId, businessId: req.businessId, clientId: client.id } });
    txId = tx ? tx.id : null; // foreign/forged id silently unlinks instead of failing the upload
  }

  const row = await prisma.clientPhoto.create({ data: { businessId: req.businessId!, clientId: client.id, tipo: parsed.data.tipo || 'anamnese', txId, mime, size: buf.length } });
  try {
    savePhoto(req.businessId!, row.id, buf);
  } catch (e) {
    await prisma.clientPhoto.delete({ where: { id: row.id } });
    throw e;
  }
  res.status(201).json(row);
});

router.get('/:id/file', async (req: AuthedRequest, res) => {
  const row = await prisma.clientPhoto.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!row) return res.status(404).json({ error: 'not_found' });
  const data = readPhoto(req.businessId!, row.id);
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', 'inline');
  res.send(data);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const row = await prisma.clientPhoto.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!row) return res.status(404).json({ error: 'not_found' });
  await prisma.clientPhoto.delete({ where: { id: row.id } });
  deletePhotoFile(req.businessId!, row.id);
  res.status(204).end();
});

export default router;
