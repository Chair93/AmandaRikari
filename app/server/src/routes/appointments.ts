import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { assertOwned } from '../ownership.js';
import { feePctFor } from '../calc.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

/** Every read carries the combined services list — a booking can hold more
 *  than one procedure; `service` stays as the primary/first for legacy UI. */
const APT_INCLUDE = {
  client: { select: { id: true, name: true, phone: true } },
  service: { select: { id: true, name: true } },
  services: { include: { service: { select: { id: true, name: true, price: true } } } },
  tx: { select: { id: true, amount: true } },
  sinalTx: { select: { id: true, amount: true } },
} as const;

const bodySchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().optional().nullable(),
  /** Multiple procedures in one visit — serviceId doubles as the first one. */
  serviceIds: z.array(z.string().min(1)).max(10).optional(),
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
    include: APT_INCLUDE,
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  res.json(rows);
});

/** Single day: booked appointments + the list of still-open slots given business hours in Settings. */
router.get('/day', async (req: AuthedRequest, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });

  const [settings, appointments, blocks] = await Promise.all([
    prisma.settings.upsert({ where: { businessId: req.businessId }, update: {}, create: { businessId: req.businessId! } }),
    prisma.appointment.findMany({
      where: { businessId: req.businessId, date, status: 'confirmed' },
      include: APT_INCLUDE,
      orderBy: { time: 'asc' },
    }),
    prisma.agendaBlock.findMany({ where: { businessId: req.businessId, date }, orderBy: { time: 'asc' } }),
  ]);

  const startMin = settings.agendaStartHour * 60;
  const endMin = settings.agendaEndHour * 60;
  const slotMin = settings.agendaSlotMin;

  // Blocked time counts as busy: an all-day block swallows everything, a
  // timed one behaves like an appointment without a client.
  const busyRanges = [
    ...appointments.map((a) => ({ start: timeToMin(a.time), end: timeToMin(a.time) + a.durationMin })),
    ...blocks.map((b) => (b.allDay ? { start: 0, end: 24 * 60 } : { start: timeToMin(b.time), end: timeToMin(b.time) + b.durationMin })),
  ];
  const slots: string[] = [];
  for (let t = startMin; t + slotMin <= endMin; t += slotMin) {
    const overlaps = busyRanges.some((r) => t < r.end && t + slotMin > r.start);
    if (!overlaps) slots.push(minToTime(t));
  }

  res.json({ date, appointments, blocks, availableSlots: slots });
});

/** Blocked time — lunch, errands, vacation days. */
const blockSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMin: z.number().int().gt(0).max(24 * 60).optional(),
  allDay: z.boolean().optional(),
  motivo: z.string().max(80).optional(),
});
router.post('/blocks', async (req: AuthedRequest, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  if (!d.allDay && !d.time) return res.status(400).json({ error: 'Informe o horário ou marque o dia inteiro.' });
  const row = await prisma.agendaBlock.create({
    data: { businessId: req.businessId!, date: d.date, time: d.time || '00:00', durationMin: d.durationMin || 60, allDay: !!d.allDay, motivo: d.motivo?.trim() || '' },
  });
  res.status(201).json(row);
});
router.delete('/blocks/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.agendaBlock.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.agendaBlock.delete({ where: { id: existing.id } });
  res.status(204).end();
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { serviceIds, serviceId, ...rest } = parsed.data;
  const ids = [...new Set((serviceIds?.length ? serviceIds : serviceId ? [serviceId] : []).filter(Boolean))] as string[];
  await assertOwned(req.businessId!, { clientIds: [rest.clientId], serviceIds: ids });
  const row = await prisma.appointment.create({
    data: {
      businessId: req.businessId!,
      durationMin: 60,
      ...rest,
      serviceId: ids[0] || null,
      services: { create: ids.map((sid) => ({ serviceId: sid })) },
      status: 'confirmed',
    },
    include: APT_INCLUDE,
  });
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { serviceIds, serviceId, ...rest } = parsed.data;
  const ids = [...new Set((serviceIds?.length ? serviceIds : serviceId ? [serviceId] : []).filter(Boolean))] as string[];
  await assertOwned(req.businessId!, { clientIds: [rest.clientId], serviceIds: ids });
  const row = await prisma.appointment.update({
    where: { id: existing.id },
    data: { ...rest, serviceId: ids[0] || null, services: { deleteMany: {}, create: ids.map((sid) => ({ serviceId: sid })) } },
    include: APT_INCLUDE,
  });
  res.json(row);
});

/** Reservation deposit: money in today (normal receita, card fee applies),
 *  linked to the booking so registering the atendimento can net it out. */
const sinalSchema = z.object({
  valor: z.number().gt(0),
  payment: z.enum(['dinheiro', 'pix', 'debito', 'credito']).default('pix'),
  parcelas: z.number().int().min(1).max(24).optional(),
});
router.post('/:id/sinal', async (req: AuthedRequest, res) => {
  const parsed = sinalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const apt = await prisma.appointment.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { client: { select: { name: true } } } });
  if (!apt) return res.status(404).json({ error: 'not_found' });
  if (apt.sinalTxId) return res.status(400).json({ error: 'Este agendamento já tem sinal registrado.' });
  if (apt.txId) return res.status(400).json({ error: 'Atendimento já registrado — sinal não faz mais sentido aqui.' });
  const d = parsed.data;
  const businessId = req.businessId!;
  const [settings] = await Promise.all([prisma.settings.upsert({ where: { businessId }, update: {}, create: { businessId } })]);
  const parcelas = d.payment === 'credito' ? d.parcelas || 1 : null;
  const feePct = feePctFor(d.payment, settings, parcelas);
  const fee = Math.round(d.valor * feePct) / 100;
  const row = await prisma.$transaction(async (tx) => {
    let cat = await tx.category.findFirst({ where: { businessId, type: 'receita', name: 'Sinal de agendamento' } });
    if (!cat) cat = await tx.category.create({ data: { businessId, name: 'Sinal de agendamento', type: 'receita' } });
    const t = await tx.transaction.create({
      data: {
        businessId,
        type: 'receita',
        amount: d.valor,
        categoryId: cat.id,
        clientId: apt.clientId,
        date: new Date().toISOString().slice(0, 10),
        payment: d.payment,
        parcelas,
        note: `Sinal — ${apt.client.name} (${apt.date.slice(8, 10)}/${apt.date.slice(5, 7)} ${apt.time})`,
      },
    });
    if (fee > 0) {
      let fcat = await tx.category.findFirst({ where: { businessId, type: 'despesa', name: 'Taxas de maquininha' } });
      if (!fcat) fcat = await tx.category.create({ data: { businessId, name: 'Taxas de maquininha', type: 'despesa' } });
      await tx.transaction.create({ data: { businessId, type: 'despesa', amount: fee, categoryId: fcat.id, date: t.date, feeOf: t.id, note: `Taxa ${d.payment}` } });
    }
    return tx.appointment.update({ where: { id: apt.id }, data: { sinalTxId: t.id }, include: APT_INCLUDE });
  });
  res.json(row);
});

/** Toggle no-show: the client didn't come. Leaves the day view (only
 *  'confirmed' bookings show) but stays counted on the client's ficha. */
router.post('/:id/faltou', async (req: AuthedRequest, res) => {
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.txId) return res.status(400).json({ error: 'Este agendamento já virou atendimento.' });
  const row = await prisma.appointment.update({
    where: { id: existing.id },
    data: { status: existing.status === 'faltou' ? 'confirmed' : 'faltou' },
    include: APT_INCLUDE,
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
    include: APT_INCLUDE,
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
