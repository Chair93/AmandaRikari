import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { computeServiceCost } from '../calc.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const itemSchema = z.object({
  kind: z.enum(['product', 'equipment']),
  refId: z.string().min(1),
  qty: z.number().gt(0),
});
const bodySchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0),
  category: z.string().optional().nullable(),
  items: z.array(itemSchema),
});

function toServiceItemData(items: z.infer<typeof itemSchema>[]) {
  return items.map((it) => ({
    kind: it.kind,
    qty: it.qty,
    productId: it.kind === 'product' ? it.refId : null,
    equipmentId: it.kind === 'equipment' ? it.refId : null,
  }));
}

async function costContext(businessId: string) {
  const [products, equipment, settings] = await Promise.all([
    prisma.product.findMany({ where: { businessId } }),
    prisma.equipment.findMany({ where: { businessId } }),
    prisma.settings.findUnique({ where: { businessId } }),
  ]);
  return { products, equipment, settings: settings! };
}

function serviceWithCost(sv: { items: { kind: string; productId: string | null; equipmentId: string | null; qty: number }[] } & Record<string, unknown>, ctx: Awaited<ReturnType<typeof costContext>>) {
  const items = sv.items.map((it) => ({ kind: it.kind, refId: (it.productId || it.equipmentId)!, qty: it.qty }));
  const cost = computeServiceCost(items, ctx.products, ctx.equipment, ctx.settings);
  return { ...sv, cost };
}

router.get('/', async (req: AuthedRequest, res) => {
  const [rows, ctx] = await Promise.all([
    prisma.service.findMany({ where: { businessId: req.businessId }, include: { items: true }, orderBy: { name: 'asc' } }),
    costContext(req.businessId!),
  ]);
  res.json(rows.map((sv) => serviceWithCost(sv, ctx)));
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const row = await prisma.service.create({
    data: { businessId: req.businessId!, name: d.name, price: d.price, category: d.category || null, items: { create: toServiceItemData(d.items) } },
    include: { items: true },
  });
  res.status(201).json(serviceWithCost(row, await costContext(req.businessId!)));
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.service.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const d = parsed.data;
  const row = await prisma.$transaction(async (tx) => {
    await tx.serviceItem.deleteMany({ where: { serviceId: existing.id } });
    return tx.service.update({
      where: { id: existing.id },
      data: { name: d.name, price: d.price, category: d.category || null, items: { create: toServiceItemData(d.items) } },
      include: { items: true },
    });
  });
  res.json(serviceWithCost(row, await costContext(req.businessId!)));
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.service.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.service.delete({ where: { id: existing.id } });
  res.status(204).end();
});

/** Clones a service (and its item list) so the owner can quickly make a variant
 *  ("Limpeza básica" -> duplicate -> rename to "Limpeza básica + peeling"). */
router.post('/:id/duplicate', async (req: AuthedRequest, res) => {
  const existing = await prisma.service.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { items: true } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const row = await prisma.service.create({
    data: {
      businessId: req.businessId!,
      name: `${existing.name} (cópia)`,
      price: existing.price,
      category: existing.category,
      items: { create: existing.items.map((it) => ({ kind: it.kind, qty: it.qty, productId: it.productId, equipmentId: it.equipmentId })) },
    },
    include: { items: true },
  });
  res.status(201).json(serviceWithCost(row, await costContext(req.businessId!)));
});

export default router;
