import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';
import { deleteProductCascade, productDeleteImpact } from '../stockDeletion.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

const bodySchema = z.object({
  name: z.string().min(1),
  unit: z.enum(['ml', 'g', 'unidade']),
  packageCost: z.number().min(0),
  packageQty: z.number().gt(0),
  salePrice: z.number().min(0).optional(),
  stock: z.number().min(0).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  kind: z.enum(['operacional', 'descartavel']).optional(),
  lowStockAt: z.number().min(0).optional(),
});

router.get('/', async (req: AuthedRequest, res) => {
  const rows = await prisma.product.findMany({ where: { businessId: req.businessId }, orderBy: { name: 'asc' } });
  res.json(rows);
});

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const row = await prisma.product.create({
    data: {
      businessId: req.businessId!,
      name: d.name,
      unit: d.unit,
      packageCost: d.packageCost,
      packageQty: d.packageQty,
      salePrice: d.salePrice ?? 0,
      stock: d.stock ?? 0,
      avgCost: d.packageCost,
      expiresAt: d.expiresAt || null,
      kind: d.kind || 'operacional',
      lowStockAt: d.lowStockAt ?? 1,
    },
  });
  res.status(201).json(row);
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const d = parsed.data;
  const row = await prisma.product.update({
    where: { id: existing.id },
    data: {
      name: d.name,
      unit: d.unit,
      packageCost: d.packageCost,
      packageQty: d.packageQty,
      salePrice: d.salePrice ?? 0,
      stock: d.stock ?? existing.stock,
      expiresAt: d.expiresAt || null,
      kind: d.kind || existing.kind,
      lowStockAt: d.lowStockAt ?? existing.lowStockAt,
    },
  });
  res.json(row);
});

/** What a delete would take with it — the UI shows this before confirming. */
router.get('/:id/delete-impact', async (req: AuthedRequest, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(await productDeleteImpact(req.businessId!, existing.id));
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await deleteProductCascade(req.businessId!, existing.id);
  res.status(204).end();
});

/** Estoque "+Entrada" — records a new batch of stock, updates the weighted-average cost. */
const entradaSchema = z.object({ qty: z.number().gt(0), unitCost: z.number().min(0), lancarNoCaixa: z.boolean().optional() });
router.post('/:id/entrada', async (req: AuthedRequest, res) => {
  const parsed = entradaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const p = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!p) return res.status(404).json({ error: 'not_found' });
  const { qty, unitCost, lancarNoCaixa } = parsed.data;
  const stockAtual = p.stock;
  const custoMedioAtual = p.avgCost || p.packageCost;
  const novoCustoMedio = stockAtual + qty > 0 ? (stockAtual * custoMedioAtual + qty * unitCost) / (stockAtual + qty) : unitCost;

  const updated = await prisma.$transaction(async (tx) => {
    const prod = await tx.product.update({
      where: { id: p.id },
      data: { stock: stockAtual + qty, packageCost: unitCost, avgCost: novoCustoMedio },
    });
    if (lancarNoCaixa) {
      let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'despesa', name: 'Compra de estoque' } });
      if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Compra de estoque', type: 'despesa', investment: true } });
      await tx.transaction.create({
        data: {
          businessId: req.businessId!,
          type: 'despesa',
          amount: qty * unitCost,
          categoryId: cat.id,
          date: new Date().toISOString().slice(0, 10),
          estoque: true,
          productId: p.id,
          note: `Compra de estoque: ${p.name} x${qty}`,
        },
      });
    }
    return prod;
  });
  res.json(updated);
});

/** "Débito posterior": the supplier ended up charging more than the entrada
 *  recorded. The difference spreads over the CURRENT stock, correcting the
 *  weighted average cost; optionally the extra payment also leaves the caixa. */
const diferencaSchema = z.object({ valor: z.number().gt(0), lancarNoCaixa: z.boolean().optional() });
router.post('/:id/diferenca-custo', async (req: AuthedRequest, res) => {
  const parsed = diferencaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const p = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (p.stock <= 0.005) return res.status(400).json({ error: 'Sem estoque pra ratear — lance a diferença como despesa avulsa em Lançamentos (categoria Compra de estoque).' });
  const { valor, lancarNoCaixa } = parsed.data;
  const custoMedioAtual = p.avgCost || p.packageCost;
  const novoCustoMedio = custoMedioAtual + valor / p.stock;

  const updated = await prisma.$transaction(async (tx) => {
    const prod = await tx.product.update({
      where: { id: p.id },
      // packageCost follows so the "R$ X / pacote" display reflects the real price paid.
      data: { avgCost: novoCustoMedio, packageCost: novoCustoMedio },
    });
    if (lancarNoCaixa) {
      let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'despesa', name: 'Compra de estoque' } });
      if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Compra de estoque', type: 'despesa', investment: true } });
      await tx.transaction.create({
        data: {
          businessId: req.businessId!,
          type: 'despesa',
          amount: valor,
          categoryId: cat.id,
          date: new Date().toISOString().slice(0, 10),
          estoque: true,
          productId: p.id,
          note: `Diferença de custo: ${p.name}`,
        },
      });
    }
    return prod;
  });
  res.json(updated);
});

/** Estoque "Vender" — sells stock directly (not tied to an appointment), records revenue + margin. */
const venderSchema = z.object({ qty: z.number().gt(0), unitPrice: z.number().gt(0) });
router.post('/:id/vender', async (req: AuthedRequest, res) => {
  const parsed = venderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const p = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!p) return res.status(404).json({ error: 'not_found' });
  const { qty, unitPrice } = parsed.data;
  if (qty > p.stock) return res.status(400).json({ error: 'Quantidade maior que o estoque disponível' });
  const unitCost = p.avgCost || p.packageCost;

  const result = await prisma.$transaction(async (tx) => {
    const prod = await tx.product.update({ where: { id: p.id }, data: { stock: p.stock - qty } });
    let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type: 'receita', name: 'Venda de produtos' } });
    if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: 'Venda de produtos', type: 'receita' } });
    const t = await tx.transaction.create({
      data: {
        businessId: req.businessId!,
        type: 'receita',
        amount: qty * unitPrice,
        categoryId: cat.id,
        date: new Date().toISOString().slice(0, 10),
        variableCost: 0,
        note: `Venda: ${p.name} x${qty}`,
        sales: { create: [{ productId: p.id, qty, unitPrice, unitCost }] },
      },
    });
    return { product: prod, transaction: t };
  });
  res.json(result);
});

/** Estoque "Contagem" — inventory adjustment. The physical count replaces the
 *  app's number and the difference, valued at average cost, is booked to the
 *  result: a shortfall as 'Perda de inventário' (despesa), a surplus as
 *  'Ganho de inventário' (receita). Both are accrualOnly — no cash moved,
 *  the shelf just didn't match the books. */
const inventarioSchema = z.object({ real: z.number().min(0), note: z.string().max(200).optional() });
router.post('/:id/inventario', async (req: AuthedRequest, res) => {
  const parsed = inventarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const p = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!p) return res.status(404).json({ error: 'not_found' });
  const { real, note } = parsed.data;
  const delta = Math.round((real - p.stock) * 100) / 100;
  if (delta === 0) return res.json({ product: p, transaction: null });

  const unitCost = p.avgCost || p.packageCost;
  const value = Math.round(Math.abs(delta) * unitCost * 100) / 100;
  const isPerda = delta < 0;

  const result = await prisma.$transaction(async (tx) => {
    const prod = await tx.product.update({ where: { id: p.id }, data: { stock: real } });
    let t = null;
    if (value > 0) {
      const type = isPerda ? 'despesa' : 'receita';
      const catName = isPerda ? 'Perda de inventário' : 'Ganho de inventário';
      let cat = await tx.category.findFirst({ where: { businessId: req.businessId, type, name: catName } });
      if (!cat) cat = await tx.category.create({ data: { businessId: req.businessId!, name: catName, type } });
      t = await tx.transaction.create({
        data: {
          businessId: req.businessId!,
          type,
          amount: value,
          categoryId: cat.id,
          date: new Date().toISOString().slice(0, 10),
          accrualOnly: true,
          productId: p.id,
          note: `Ajuste de inventário: ${p.name} (${p.stock} → ${real})${note?.trim() ? ' — ' + note.trim() : ''}`,
        },
      });
    }
    return { product: prod, transaction: t };
  });
  res.json(result);
});

export default router;
