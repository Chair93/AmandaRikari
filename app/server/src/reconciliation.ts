import { prisma } from './db.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ReconLine {
  kind: 'product' | 'equipment';
  id: string;
  name: string;
  missing: number;
}

/** Finds inventory and assets that exist on the balance sheet without a
 *  purchase entry funding them — the usual source of the "ajuste a conciliar"
 *  plug. Typical causes: assets registered before registration stopped
 *  granting units, and stock entries made with "lançar no caixa" unticked.
 *
 *  Products are estimated from the shelf: what today's stock is worth minus
 *  what was ever booked as purchases for it. Consumption only makes purchases
 *  exceed the shelf, so the max(0, …) keeps the estimate conservative — it
 *  can miss a gap, but never invents one. */
export async function computeReconciliation(businessId: string): Promise<{ lines: ReconLine[]; totalMissing: number }> {
  const [products, equipment, purchaseTx] = await Promise.all([
    prisma.product.findMany({ where: { businessId } }),
    prisma.equipment.findMany({ where: { businessId } }),
    prisma.transaction.findMany({
      where: { businessId, OR: [{ estoque: true }, { ativo: true }] },
      select: { amount: true, productId: true, equipmentId: true },
    }),
  ]);

  const paidByProduct: Record<string, number> = {};
  const paidByEquipment: Record<string, number> = {};
  for (const t of purchaseTx) {
    if (t.productId) paidByProduct[t.productId] = (paidByProduct[t.productId] || 0) + t.amount;
    if (t.equipmentId) paidByEquipment[t.equipmentId] = (paidByEquipment[t.equipmentId] || 0) + t.amount;
  }

  const lines: ReconLine[] = [];

  for (const eq of equipment) {
    // Everything ever acquired: units on hand plus units already written off.
    const acquiredValue = eq.cost * (eq.qty + eq.baixas);
    const missing = round2(acquiredValue - (paidByEquipment[eq.id] || 0));
    if (missing > 0.005) lines.push({ kind: 'equipment', id: eq.id, name: eq.name, missing });
  }

  for (const p of products) {
    const shelfValue = p.stock * (p.avgCost || p.packageCost);
    const missing = round2(shelfValue - (paidByProduct[p.id] || 0));
    if (missing > 0.005) lines.push({ kind: 'product', id: p.id, name: p.name, missing });
  }

  lines.sort((a, b) => b.missing - a.missing);
  return { lines, totalMissing: round2(lines.reduce((a, l) => a + l.missing, 0)) };
}

/** Books the missing history as a pair per item, dated today:
 *
 *    1. aporte de sócio  (+X no caixa — o dinheiro que a dona pôs do bolso)
 *    2. compra do item   (−X no caixa, marcada como investimento)
 *
 *  Net cash zero, PL gains the aporte, and the asset finally has a funding
 *  source — which is exactly what the plug was complaining about. Both lines
 *  stay visible in Lançamentos, so the ledger tells the true story instead of
 *  hiding an adjustment. Amounts are recomputed server-side at click time;
 *  nothing from the client is trusted. */
export async function reconcile(businessId: string, socioName: string): Promise<{ created: number; total: number }> {
  const { lines, totalMissing } = await computeReconciliation(businessId);
  if (lines.length === 0) return { created: 0, total: 0 };

  const today = new Date().toISOString().slice(0, 10);

  const findOrCreateCategory = async (name: string, type: string, investment = false) => {
    let cat = await prisma.category.findFirst({ where: { businessId, type, name } });
    if (!cat) cat = await prisma.category.create({ data: { businessId, name, type, investment } });
    return cat;
  };
  const aporteCat = await findOrCreateCategory('Aporte de sócio', 'receita');
  const bensCat = await findOrCreateCategory('Compra de bens', 'despesa', true);
  const estoqueCat = await findOrCreateCategory('Compra de estoque', 'despesa', true);

  await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      await tx.transaction.create({
        data: {
          businessId,
          type: 'receita',
          amount: line.missing,
          categoryId: aporteCat.id,
          date: today,
          capital: 'aporte',
          capitalKind: 'capital',
          socio: socioName,
          note: `Regularização de saldo inicial: ${line.name}`,
        },
      });
      await tx.transaction.create({
        data: {
          businessId,
          type: 'despesa',
          amount: line.missing,
          categoryId: line.kind === 'equipment' ? bensCat.id : estoqueCat.id,
          date: today,
          ativo: line.kind === 'equipment',
          estoque: line.kind === 'product',
          equipmentId: line.kind === 'equipment' ? line.id : null,
          productId: line.kind === 'product' ? line.id : null,
          note: `Regularização de saldo inicial: ${line.name}`,
        },
      });
    }
  });

  return { created: lines.length * 2, total: totalMissing };
}
