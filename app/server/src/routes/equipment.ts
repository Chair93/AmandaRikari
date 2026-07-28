import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { equipmentUsageCounts, equipmentDepreciation } from '../calc.js';
import { todayStr } from '../util.js';
import { deleteEquipmentCascade, equipmentDeleteImpact } from '../stockDeletion.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['utensilio', 'maquina']),
  qty: z.number().min(0).optional(),
  cost: z.number().min(0),
  usefulUses: z.number().gt(0),
  kwh: z.number().min(0).optional(),
});

router.get('/', async (req: AuthedRequest, res) => {
  const [rows, txItems] = await Promise.all([
    prisma.equipment.findMany({ where: { businessId: req.businessId }, orderBy: { name: 'asc' } }),
    prisma.transactionItem.findMany({
      where: { transaction: { businessId: req.businessId }, kind: 'equipment' },
      select: { kind: true, equipmentId: true },
    }),
  ]);
  const usos = equipmentUsageCounts(txItems);
  res.json(
    rows.map((eq) => ({
      ...eq,
      usos: usos[eq.id] || 0,
      depreciacaoAcumulada: equipmentDepreciation(eq, usos[eq.id] || 0),
    }))
  );
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const row = await prisma.equipment.create({
    data: {
      businessId: req.businessId!,
      name: d.name,
      kind: d.kind,
      // Registration creates the catalog entry only. Units arrive through
      // "+ Compra", which always books the cash out — same discipline the
      // products got when the initial-stock field was removed.
      qty: d.qty ?? 0,
      cost: d.cost,
      usefulUses: d.usefulUses,
      kwh: d.kind === 'maquina' ? d.kwh ?? 0 : 0,
    },
  });
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.equipment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const d = parsed.data;
  const row = await prisma.equipment.update({
    where: { id: existing.id },
    data: { name: d.name, kind: d.kind, qty: d.qty ?? existing.qty, cost: d.cost, usefulUses: d.usefulUses, kwh: d.kind === 'maquina' ? d.kwh ?? 0 : 0 },
  });
  res.json(row);
});

/** What a delete would take with it — the UI shows this before confirming. */
router.get('/:id/delete-impact', async (req: AuthedRequest, res) => {
  const existing = await prisma.equipment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(await equipmentDeleteImpact(req.businessId!, existing.id));
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.equipment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await deleteEquipmentCascade(req.businessId!, existing.id);
  res.status(204).end();
});

/** "+ Compra" — buying more units is an asset purchase (investment), not an operating expense. */
const comprarSchema = z.object({ qty: z.number().gt(0), unitCost: z.number().min(0) });
router.post('/:id/comprar', async (req: AuthedRequest, res) => {
  const parsed = comprarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const eq = await prisma.equipment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!eq) return res.status(404).json({ error: 'not_found' });
  const { qty, unitCost } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.equipment.update({ where: { id: eq.id }, data: { qty: eq.qty + qty, cost: unitCost } });
    let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'despesa', name: 'Compra de bens' } });
    if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Compra de bens', type: 'despesa', investment: true } });
    await tx.transaction.create({
      data: {
        businessId: req.businessId!,
        type: 'despesa',
        amount: qty * unitCost,
        categoryId: cat.id,
        date: todayStr(),
        ativo: true,
        equipmentId: eq.id,
        note: `Compra de bem: ${eq.name} x${qty}`,
      },
    });
    return updated;
  });
  res.json(result);
});

/** "Dar baixa" — writes off units; any undepreciated value becomes a loss (no cash movement). */
const baixaSchema = z.object({ qty: z.number().gt(0) });
router.post('/:id/baixa', async (req: AuthedRequest, res) => {
  const parsed = baixaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const eq = await prisma.equipment.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!eq) return res.status(404).json({ error: 'not_found' });
  const q = eq.qty;
  const qtd = Math.min(parsed.data.qty, q);
  if (qtd <= 0) return res.status(400).json({ error: 'invalid_qty' });

  const txItems = await prisma.transactionItem.findMany({
    where: { transaction: { businessId: req.businessId }, kind: 'equipment', equipmentId: eq.id },
  });
  const usados = txItems.length;
  const porUso = eq.usefulUses > 0 ? eq.cost / eq.usefulUses : 0;
  const bruto = eq.cost * q;
  const depreciado = Math.min(bruto, usados * porUso);
  const residual = Math.max(0, bruto - depreciado);
  const resid = q > 0 ? residual * (qtd / q) : 0;

  const updated = await prisma.equipment.update({
    where: { id: eq.id },
    data: { qty: q - qtd, baixas: eq.baixas + qtd, perdaBaixa: eq.perdaBaixa + resid, baixadoEm: todayStr() },
  });
  res.json(updated);
});

export default router;
