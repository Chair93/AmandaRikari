import { prisma } from './db.js';

/** What deleting a product or asset would take with it, so the UI can show the
 *  damage before the user commits to it. */
export interface DeleteImpact {
  /** Direct sales of this product. The whole transaction goes: it exists only
   *  to record selling this. */
  vendas: { count: number; total: number };
  /** "+ Entrada" / "+ Compra" entries booked for it. Also whole transactions. */
  compras: { count: number; total: number };
  /** Atendimentos that used it. These are KEPT — a client paid for that
   *  appointment and the revenue is real. Only the item line is removed, so
   *  the recorded cost of those appointments stays as it was booked. */
  atendimentos: { count: number };
  /** Services whose ficha técnica lists it. Kept; the item leaves the ficha. */
  servicos: { count: number; names: string[] };
}

const EMPTY_MONEY = { count: 0, total: 0 };

function sumAmounts(rows: { amount: number }[]) {
  return { count: rows.length, total: rows.reduce((a, r) => a + r.amount, 0) };
}

export async function productDeleteImpact(businessId: string, productId: string): Promise<DeleteImpact> {
  const [saleTxs, purchaseTxs, itemTxIds, serviceItems] = await Promise.all([
    prisma.transaction.findMany({
      where: { businessId, sales: { some: { productId } } },
      select: { amount: true },
    }),
    prisma.transaction.findMany({ where: { businessId, productId }, select: { amount: true } }),
    prisma.transactionItem.findMany({
      where: { productId, transaction: { businessId } },
      select: { transactionId: true },
    }),
    prisma.serviceItem.findMany({
      where: { productId, service: { businessId } },
      select: { service: { select: { name: true } } },
    }),
  ]);

  // A transaction can list the same product on more than one line; count the
  // appointment once.
  const uniqueTxIds = new Set(itemTxIds.map((i) => i.transactionId));
  const serviceNames = [...new Set(serviceItems.map((s) => s.service.name))];

  return {
    vendas: sumAmounts(saleTxs),
    compras: sumAmounts(purchaseTxs),
    atendimentos: { count: uniqueTxIds.size },
    servicos: { count: serviceNames.length, names: serviceNames },
  };
}

export async function equipmentDeleteImpact(businessId: string, equipmentId: string): Promise<DeleteImpact> {
  const [purchaseTxs, itemTxIds, serviceItems] = await Promise.all([
    prisma.transaction.findMany({ where: { businessId, equipmentId }, select: { amount: true } }),
    prisma.transactionItem.findMany({
      where: { equipmentId, transaction: { businessId } },
      select: { transactionId: true },
    }),
    prisma.serviceItem.findMany({
      where: { equipmentId, service: { businessId } },
      select: { service: { select: { name: true } } },
    }),
  ]);

  const uniqueTxIds = new Set(itemTxIds.map((i) => i.transactionId));
  const serviceNames = [...new Set(serviceItems.map((s) => s.service.name))];

  return {
    vendas: EMPTY_MONEY, // equipment is never sold through Estoque
    compras: sumAmounts(purchaseTxs),
    atendimentos: { count: uniqueTxIds.size },
    servicos: { count: serviceNames.length, names: serviceNames },
  };
}

/** Deletes a product together with everything that only existed because of it.
 *
 *  Sales and purchases are whole transactions about this product alone, so they
 *  go. Appointments that merely used it are left standing — deleting them would
 *  erase revenue a client actually paid — and only lose the item line; their
 *  stored variableCost is left at the figure booked at the time, which is what
 *  it historically cost. */
export async function deleteProductCascade(businessId: string, productId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const saleTxIds = (
      await tx.transaction.findMany({
        where: { businessId, sales: { some: { productId } } },
        select: { id: true },
      })
    ).map((t) => t.id);

    const purchaseTxIds = (
      await tx.transaction.findMany({ where: { businessId, productId }, select: { id: true } })
    ).map((t) => t.id);

    const doomed = [...new Set([...saleTxIds, ...purchaseTxIds])];

    // Fee expenses hang off their parent by feeOf, which has no FK to cascade.
    if (doomed.length) {
      await tx.transaction.deleteMany({ where: { businessId, feeOf: { in: doomed } } });
    }

    // Item and sale rows cascade from Transaction, but rows pointing at this
    // product from surviving transactions must go by hand or the FK blocks us.
    await tx.transactionItem.deleteMany({ where: { productId, transaction: { businessId } } });
    await tx.transactionSale.deleteMany({ where: { productId, transaction: { businessId } } });
    await tx.serviceItem.deleteMany({ where: { productId, service: { businessId } } });

    if (doomed.length) {
      await tx.transaction.deleteMany({ where: { businessId, id: { in: doomed } } });
    }

    await tx.product.delete({ where: { id: productId } });
  });
}

/** Same contract as deleteProductCascade, for assets. */
export async function deleteEquipmentCascade(businessId: string, equipmentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const purchaseTxIds = (
      await tx.transaction.findMany({ where: { businessId, equipmentId }, select: { id: true } })
    ).map((t) => t.id);

    if (purchaseTxIds.length) {
      await tx.transaction.deleteMany({ where: { businessId, feeOf: { in: purchaseTxIds } } });
    }

    await tx.transactionItem.deleteMany({ where: { equipmentId, transaction: { businessId } } });
    await tx.serviceItem.deleteMany({ where: { equipmentId, service: { businessId } } });

    if (purchaseTxIds.length) {
      await tx.transaction.deleteMany({ where: { businessId, id: { in: purchaseTxIds } } });
    }

    await tx.equipment.delete({ where: { id: equipmentId } });
  });
}
