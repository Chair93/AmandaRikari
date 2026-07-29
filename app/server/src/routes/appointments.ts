import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { assertOwned } from '../ownership.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().gt(0).optional(),
  note: z.string().optional().nullable(),
});

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minToTime(m: number): string {
  const h = Math.floor(m / 60)
    .toString()
    .padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}

/** List appointments in a date range (inclusive), for the month/week calendar view. */
router.get('/', async (req: AuthedRequest, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const rows = await prisma.appointment.findMany({
    where: {
      businessId: req.businessId,
      status: 'confirmed',
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    include: { client: { select: { id: true, name: true, phone: true } }, service: { select: { id: true, name: true } }, tx: { select: { id: true, amount: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  res.json(rows);
});

/** Single day: booked appointments + the list of still-open slots given business hours in Settings. */
router.get('/day', async (req: AuthedRequest, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });

  const [settings, appointments] = await Promise.all([
    prisma.settings.upsert({ where: { businessId: req.businessId }, update: {}, create: { businessId: req.businessId! } }),
    prisma.appointment.findMany({
      where: { businessId: req.businessId, date, status: 'confirmed' },
      include: { client: { select: { id: true, name: true, phone: true } }, service: { select: { id: true, name: true } }, tx: { select: { id: true, amount: true } } },
      orderBy: { time: 'asc' },
    }),
  ]);

  const startMin = settings.agendaStartHour * 60;
  const endMin = settings.agendaEndHour * 60;
  const slotMin = settings.agendaSlotMin;

  const busyRanges = appointments.map((a) => ({ start: timeToMin(a.time), end: timeToMin(a.time) + a.durationMin }));
  const slots: string[] = [];
  for (let t = startMin; t + slotMin <= endMin; t += slotMin) {
    const overlaps = busyRanges.some((r) => t < r.end && t + slotMin > r.start);
    if (!overlaps) slots.push(minToTime(t));
  }

  res.json({ date, appointments, availableSlots: slots });
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  await assertOwned(req.businessId!, { clientIds: [parsed.data.clientId], serviceIds: [parsed.data.serviceId] });
  const row = await prisma.appointment.create({
    data: { businessId: req.businessId!, durationMin: 60, ...parsed.data, status: 'confirmed' },
    include: { client: { select: { id: true, name: true, phone: true } }, service: { select: { id: true, name: true } }, tx: { select: { id: true, amount: true } } },
  });
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await assertOwned(req.businessId!, { clientIds: [parsed.data.clientId], serviceIds: [parsed.data.serviceId] });
  const row = await prisma.appointment.update({
    where: { id: existing.id },
    data: parsed.data,
    include: { client: { select: { id: true, name: true, phone: true } }, service: { select: { id: true, name: true } }, tx: { select: { id: true, amount: true } } },
  });
  res.json(row);
});

/** Toggle "cliente confirmou presença" — separate from booking status. */
router.post('/:id/confirmou', async (req: AuthedRequest, res) => {
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const row = await prisma.appointment.update({
    where: { id: existing.id },
    data: { confirmou: !existing.confirmou },
    include: { client: { select: { id: true, name: true, phone: true } }, service: { select: { id: true, name: true } }, tx: { select: { id: true, amount: true } } },
  });
  res.json(row);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.appointment.update({ where: { id: existing.id }, data: { status: 'cancelled' } });
  res.status(204).end();
});

export default router;
