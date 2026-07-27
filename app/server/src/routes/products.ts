import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';

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
    },
  });
  res.json(row);
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.product.delete({ where: { id: existing.id } });
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
          note: `Compra de estoque: ${p.name} x${qty}`,
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

export default router;
