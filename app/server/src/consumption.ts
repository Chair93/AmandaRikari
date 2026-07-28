import type { Prisma } from '@prisma/client';

/** Ficha-técnica product usage converted to stock movement: an atendimento
 *  that uses 10g of a 100g pot consumes 0.1 of a stock unit. Stock can go
 *  negative — that's the app saying "you used more than you ever bought,
 *  time for a Contagem", not something to silently clamp away. */
export async function applyProductConsumption(
  tx: Prisma.TransactionClient,
  entries: { productId: string; qty: number }[],
  products: { id: string; packageQty: number }[],
  direction: 'consume' | 'restore'
): Promise<void> {
  const perProduct: Record<string, number> = {};
  for (const e of entries) {
    const p = products.find((x) => x.id === e.productId);
    if (!p || !(p.packageQty > 0)) continue;
    perProduct[e.productId] = (perProduct[e.productId] || 0) + e.qty / p.packageQty;
  }
  for (const [productId, used] of Object.entries(perProduct)) {
    if (!used) continue;
    const cur = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
    if (!cur) continue;
    // Rounded to 4 decimals so repeated fractions can't accumulate float dust.
    const next = Math.round((cur.stock + (direction === 'consume' ? -used : used)) * 10000) / 10000;
    await tx.product.update({ where: { id: productId }, data: { stock: next } });
  }
}
