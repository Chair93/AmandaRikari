import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  energyPricePerKwh: z.number().min(0).optional(),
  costPerKm: z.number().min(0).optional(),
  prolaboreMode: z.enum(['pct', 'fixo']).optional(),
  prolaborePct: z.number().min(0).max(100).optional(),
  prolaboreFixo: z.number().min(0).optional(),
  metaMensal: z.number().min(0).optional(),
  taxaCredito: z.number().min(0).max(100).optional(),
  taxaDebito: z.number().min(0).max(100).optional(),
  taxaPix: z.number().min(0).max(100).optional(),
  emailDigestEnabled: z.boolean().optional(),
  emailBackupEnabled: z.boolean().optional(),
  receiptDoc: z.string().max(60).optional(),
  receiptPhone: z.string().max(40).optional(),
  receiptAddress: z.string().max(160).optional(),
  receiptCity: z.string().max(80).optional(),
  agendaStartHour: z.number().int().min(0).max(23).optional(),
  agendaEndHour: z.number().int().min(1).max(24).optional(),
  agendaSlotMin: z.number().int().min(5).max(240).optional(),
});

router.get('/', async (req: AuthedRequest, res) => {
  const row = await prisma.settings.upsert({
    where: { businessId: req.businessId },
    update: {},
    create: { businessId: req.businessId! },
  });
  res.json(row);
});

router.put('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const row = await prisma.settings.upsert({
    where: { businessId: req.businessId },
    update: parsed.data,
    create: { businessId: req.businessId!, ...parsed.data },
  });
  res.json(row);
});

export default router;
