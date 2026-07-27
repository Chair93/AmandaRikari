import { prisma } from './db.js';

/** Thrown when a request references a record that belongs to another business.
 *  Surfaces as 400 rather than 404 so it reads as "bad input" to the caller
 *  without confirming whether the id exists somewhere else. */
export class OwnershipError extends Error {
  status = 400;
  constructor(what: string) {
    super(`${what} inválido`);
  }
}

/** Verifies every referenced id actually belongs to this business before it is
 *  written to. Ids arrive from the request body, so without this a caller can
 *  name a row from another tenant — Prisma's `where: { id }` updates happily
 *  cross-tenant, and foreign keys only check existence, not ownership. */
export async function assertOwned(
  businessId: string,
  refs: {
    categoryIds?: (string | null | undefined)[];
    clientIds?: (string | null | undefined)[];
    serviceIds?: (string | null | undefined)[];
    productIds?: (string | null | undefined)[];
    equipmentIds?: (string | null | undefined)[];
    packageIds?: (string | null | undefined)[];
  }
): Promise<void> {
  const clean = (xs?: (string | null | undefined)[]) => [...new Set((xs || []).filter((x): x is string => !!x))];

  const checks: [string, string[], () => Promise<number>][] = [
    ['Categoria', clean(refs.categoryIds), () => prisma.category.count({ where: { businessId, id: { in: clean(refs.categoryIds) } } })],
    ['Cliente', clean(refs.clientIds), () => prisma.client.count({ where: { businessId, id: { in: clean(refs.clientIds) } } })],
    ['Serviço', clean(refs.serviceIds), () => prisma.service.count({ where: { businessId, id: { in: clean(refs.serviceIds) } } })],
    ['Produto', clean(refs.productIds), () => prisma.product.count({ where: { businessId, id: { in: clean(refs.productIds) } } })],
    ['Equipamento', clean(refs.equipmentIds), () => prisma.equipment.count({ where: { businessId, id: { in: clean(refs.equipmentIds) } } })],
    ['Pacote', clean(refs.packageIds), () => prisma.package.count({ where: { businessId, id: { in: clean(refs.packageIds) } } })],
  ];

  for (const [label, ids, count] of checks) {
    if (ids.length === 0) continue;
    if ((await count()) !== ids.length) throw new OwnershipError(label);
  }
}
