import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwnerForWrites, type AuthedRequest } from '../auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireOwnerForWrites);

/** Full JSON export — same shape usable for backup, re-import and the
 *  nightly e-mail backup. */
export async function exportBusiness(businessId: string) {
  const [categories, clients, products, equipment, services, transactions, bills, recurring, packages, settings, appointments] = await Promise.all([
    prisma.category.findMany({ where: { businessId } }),
    prisma.client.findMany({ where: { businessId } }),
    prisma.product.findMany({ where: { businessId } }),
    prisma.equipment.findMany({ where: { businessId } }),
    prisma.service.findMany({ where: { businessId }, include: { items: true } }),
    prisma.transaction.findMany({ where: { businessId }, include: { items: true, sales: true } }),
    prisma.bill.findMany({ where: { businessId } }),
    prisma.recurring.findMany({ where: { businessId } }),
    prisma.package.findMany({ where: { businessId } }),
    prisma.settings.findUnique({ where: { businessId } }),
    prisma.appointment.findMany({ where: { businessId } }),
  ] as const);
  return { categories, clients, products, equipment, services, transactions, bills, recurring, packages, settings, appointments, exportedAt: new Date().toISOString() };
}

router.get('/', async (req: AuthedRequest, res) => {
  res.json(await exportBusiness(req.businessId!));
});

const restoreSchema = z.object({
  categories: z.array(z.any()).optional(),
  clients: z.array(z.any()).optional(),
  products: z.array(z.any()).optional(),
  equipment: z.array(z.any()).optional(),
  services: z.array(z.any()).optional(),
  transactions: z.array(z.any()).optional(),
  bills: z.array(z.any()).optional(),
  recurring: z.array(z.any()).optional(),
  packages: z.array(z.any()).optional(),
  appointments: z.array(z.any()).optional(),
  settings: z.any().optional(),
});

/** Restores a full backup, replacing all of this user's data. Old ids are remapped to new ones. */
router.post('/restore', async (req: AuthedRequest, res) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_backup_file' });
  const businessId = req.businessId!;
  const d = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.transactionSale.deleteMany({ where: { transaction: { businessId } } });
    await tx.transactionItem.deleteMany({ where: { transaction: { businessId } } });
    await tx.transaction.deleteMany({ where: { businessId } });
    // Appointments point at clients/services with no cascade, so they have to
    // go before those rows are deleted — otherwise the whole restore aborts
    // with a foreign-key error (P2003) for anyone who has used the Agenda.
    await tx.appointment.deleteMany({ where: { businessId } });
    await tx.serviceItem.deleteMany({ where: { service: { businessId } } });
    await tx.package.deleteMany({ where: { businessId } });
    await tx.bill.deleteMany({ where: { businessId } });
    await tx.recurring.deleteMany({ where: { businessId } });
    await tx.service.deleteMany({ where: { businessId } });
    await tx.equipment.deleteMany({ where: { businessId } });
    await tx.product.deleteMany({ where: { businessId } });
    await tx.client.deleteMany({ where: { businessId } });
    await tx.category.deleteMany({ where: { businessId } });

    const catIdMap = new Map<string, string>();
    for (const c of d.categories || []) {
      const row = await tx.category.create({ data: { businessId, name: c.name, type: c.type, investment: !!(c.investment ?? c.investimento) } });
      catIdMap.set(c.id, row.id);
    }
    const cliIdMap = new Map<string, string>();
    for (const c of d.clients || []) {
      const row = await tx.client.create({ data: { businessId, name: c.name, phone: c.phone || null, birthday: c.birthday || null, notes: c.notes || null } });
      cliIdMap.set(c.id, row.id);
    }
    const prodIdMap = new Map<string, string>();
    for (const p of d.products || []) {
      const row = await tx.product.create({
        data: { businessId, name: p.name, unit: p.unit || 'ml', packageCost: p.packageCost || 0, packageQty: p.packageQty || 1, salePrice: p.salePrice || 0, stock: p.stock || 0, avgCost: p.avgCost || p.packageCost || 0, expiresAt: p.expiresAt || null, kind: p.kind || 'operacional', lowStockAt: p.lowStockAt ?? 1 },
      });
      prodIdMap.set(p.id, row.id);
    }
    const eqIdMap = new Map<string, string>();
    for (const e of d.equipment || []) {
      const row = await tx.equipment.create({
        data: { businessId, name: e.name, kind: e.kind || (e.kwh > 0 ? 'maquina' : 'utensilio'), qty: e.qty ?? 1, cost: e.cost || 0, usefulUses: e.usefulUses || 0, kwh: e.kwh || 0, baixas: e.baixas || 0, perdaBaixa: e.perdaBaixa || 0, baixadoEm: e.baixadoEm || null },
      });
      eqIdMap.set(e.id, row.id);
    }
    const svcIdMap = new Map<string, string>();
    for (const s of d.services || []) {
      const items = (s.items || []).map((it: any) => ({
        kind: it.kind,
        qty: it.qty,
        productId: it.kind === 'product' ? prodIdMap.get(it.productId || it.refId) || null : null,
        equipmentId: it.kind === 'equipment' ? eqIdMap.get(it.equipmentId || it.refId) || null : null,
      }));
      const row = await tx.service.create({ data: { businessId, name: s.name, price: s.price || 0, category: s.category || null, items: { create: items } } });
      svcIdMap.set(s.id, row.id);
    }
    const pkgIdMap = new Map<string, string>();
    for (const p of d.packages || []) {
      if (!cliIdMap.get(p.clientId)) continue;
      const row = await tx.package.create({
        data: {
          businessId,
          clientId: cliIdMap.get(p.clientId)!,
          serviceId: p.serviceId ? svcIdMap.get(p.serviceId) || null : null,
          sessions: p.sessions,
          used: p.used || 0,
          amount: p.amount,
          date: p.date,
          aprazo: !!p.aprazo,
          parcelas: p.parcelas || null,
        },
      });
      pkgIdMap.set(p.id, row.id);
    }
    for (const t of d.transactions || []) {
      if (!catIdMap.get(t.categoryId)) continue;
      const items = (t.items || []).map((it: any) => ({
        kind: it.kind,
        qty: it.qty,
        productId: it.kind === 'product' ? prodIdMap.get(it.productId || it.refId) || null : null,
        equipmentId: it.kind === 'equipment' ? eqIdMap.get(it.equipmentId || it.refId) || null : null,
      }));
      const sales = (t.sales || []).map((sl: any) => ({ productId: prodIdMap.get(sl.productId), qty: sl.qty, unitPrice: sl.unitPrice, unitCost: sl.unitCost })).filter((sl: any) => sl.productId);
      await tx.transaction.create({
        data: {
          businessId,
          type: t.type,
          amount: t.amount,
          categoryId: catIdMap.get(t.categoryId)!,
          clientId: t.clientId ? cliIdMap.get(t.clientId) || null : null,
          serviceId: t.serviceId ? svcIdMap.get(t.serviceId) || null : null,
          distanciaKm: t.distanciaKm ?? null,
          variableCost: t.variableCost ?? null,
          date: t.date,
          note: t.note || null,
          capital: t.capital || null,
          capitalKind: t.capitalKind || null,
          socio: t.socio || null,
          payment: t.payment || null,
          prolabore: !!t.prolabore,
          estoque: !!t.estoque,
          ativo: !!t.ativo,
          // Purchase entries point back at what they bought; without remapping
          // these a restored backup loses the link and the product's own
          // purchases would survive its deletion as orphan expenses.
          productId: t.productId ? prodIdMap.get(t.productId) || null : null,
          equipmentId: t.equipmentId ? eqIdMap.get(t.equipmentId) || null : null,
          cashOnly: !!t.cashOnly,
          accrualOnly: !!t.accrualOnly,
          packageId: t.packageId ? pkgIdMap.get(t.packageId) || null : null,
          items: { create: items },
          sales: { create: sales },
        },
      });
    }
    for (const b of d.bills || []) {
      await tx.bill.create({
        data: {
          businessId,
          kind: b.kind,
          desc: b.desc,
          amount: b.amount,
          due: b.due,
          categoryId: b.categoryId ? catIdMap.get(b.categoryId) || null : null,
          clientId: b.clientId ? cliIdMap.get(b.clientId) || null : null,
          packageId: b.packageId ? pkgIdMap.get(b.packageId) || null : null,
          note: b.note || null,
          recorrente: !!b.recorrente,
          settled: !!b.settled,
          settledAt: b.settledAt || null,
          sala: !!b.sala,
          recMonth: b.recMonth || null,
        },
      });
    }
    for (const r of d.recurring || []) {
      await tx.recurring.create({
        data: { businessId, desc: r.desc, amount: r.amount, dueDay: r.dueDay || 5, categoryId: r.categoryId ? catIdMap.get(r.categoryId) || null : null, geradas: JSON.stringify(r.geradas || []) },
      });
    }
    for (const a of d.appointments || []) {
      const clientId = cliIdMap.get(a.clientId);
      if (!clientId) continue; // client didn't survive the restore — skip rather than fail
      await tx.appointment.create({
        data: {
          businessId,
          clientId,
          serviceId: a.serviceId ? svcIdMap.get(a.serviceId) || null : null,
          date: a.date,
          time: a.time,
          durationMin: a.durationMin || 60,
          status: a.status || 'confirmed',
          note: a.note || null,
        },
      });
    }
    if (d.settings) {
      // One shared object so a settings field added later can't silently go
      // missing from the create or the update branch again.
      const s = {
        energyPricePerKwh: d.settings.energyPricePerKwh || 0,
        costPerKm: d.settings.costPerKm || 0,
        prolaboreMode: d.settings.prolaboreMode || 'pct',
        prolaborePct: d.settings.prolaborePct || 0,
        prolaboreFixo: d.settings.prolaboreFixo || 0,
        metaMensal: d.settings.metaMensal || 0,
        taxaCredito: d.settings.taxaCredito || 0,
        taxaDebito: d.settings.taxaDebito || 0,
        taxaPix: d.settings.taxaPix || 0,
        emailDigestEnabled: !!d.settings.emailDigestEnabled,
        emailBackupEnabled: d.settings.emailBackupEnabled ?? true,
        receiptDoc: d.settings.receiptDoc || '',
        receiptPhone: d.settings.receiptPhone || '',
        receiptAddress: d.settings.receiptAddress || '',
        receiptCity: d.settings.receiptCity || '',
        salaMode: d.settings.salaMode || 'off',
        salaFixo: d.settings.salaFixo || 0,
        salaPct: d.settings.salaPct || 0,
        salaOwner: d.settings.salaOwner || '',
        waTemplate: d.settings.waTemplate || '',
        agendaStartHour: d.settings.agendaStartHour ?? 9,
        agendaEndHour: d.settings.agendaEndHour ?? 19,
        agendaSlotMin: d.settings.agendaSlotMin ?? 30,
      };
      await tx.settings.upsert({ where: { businessId }, create: { businessId, ...s }, update: s });
    }
  });

  res.json({ ok: true });
});

/** Row-shaped import (from a spreadsheet parsed client-side) — merges into existing data. */
const importSchema = z.object({
  clients: z.array(z.object({ name: z.string(), phone: z.string().optional(), birthday: z.string().optional(), notes: z.string().optional() })).optional(),
  products: z.array(z.object({ name: z.string(), unit: z.string().optional(), packageCost: z.number().optional(), packageQty: z.number().optional(), salePrice: z.number().optional(), stock: z.number().optional(), avgCost: z.number().optional(), expiresAt: z.string().optional() })).optional(),
  bills: z.array(z.object({ kind: z.enum(['pagar', 'receber']), desc: z.string(), amount: z.number(), due: z.string(), settled: z.boolean().optional() })).optional(),
  transactions: z
    .array(
      z.object({
        type: z.enum(['receita', 'despesa']),
        amount: z.number(),
        categoryName: z.string().optional(),
        clientName: z.string().optional(),
        date: z.string(),
        variableCost: z.number().optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
});

router.post('/import', async (req: AuthedRequest, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const businessId = req.businessId!;
  const d = parsed.data;
  const summary = { clients: 0, products: 0, bills: 0, transactions: 0 };

  await prisma.$transaction(async (tx) => {
    for (const c of d.clients || []) {
      const existing = await tx.client.findFirst({ where: { businessId, name: { equals: c.name } } });
      if (existing) await tx.client.update({ where: { id: existing.id }, data: { phone: c.phone || existing.phone, birthday: c.birthday || existing.birthday, notes: c.notes || existing.notes } });
      else await tx.client.create({ data: { businessId, name: c.name, phone: c.phone || null, birthday: c.birthday || null, notes: c.notes || null } });
      summary.clients++;
    }
    for (const p of d.products || []) {
      const existing = await tx.product.findFirst({ where: { businessId, name: { equals: p.name } } });
      const data = { unit: p.unit || 'ml', packageCost: p.packageCost ?? 0, packageQty: p.packageQty || 1, salePrice: p.salePrice ?? 0, stock: p.stock ?? 0, avgCost: p.avgCost ?? p.packageCost ?? 0, expiresAt: p.expiresAt || null };
      if (existing) await tx.product.update({ where: { id: existing.id }, data });
      else await tx.product.create({ data: { businessId, name: p.name, ...data } });
      summary.products++;
    }
    for (const b of d.bills || []) {
      await tx.bill.create({ data: { businessId, kind: b.kind, desc: b.desc, amount: b.amount, due: b.due, settled: !!b.settled } });
      summary.bills++;
    }
    for (const t of d.transactions || []) {
      const catName = t.categoryName?.trim() || (t.type === 'receita' ? 'Outras receitas' : 'Outras despesas');
      let cat = await tx.category.findFirst({ where: { businessId, type: t.type, name: { equals: catName } } });
      if (!cat) cat = await tx.category.create({ data: { businessId, name: catName, type: t.type } });
      let clientId: string | null = null;
      if (t.clientName?.trim()) {
        let cli = await tx.client.findFirst({ where: { businessId, name: { equals: t.clientName.trim() } } });
        if (!cli) cli = await tx.client.create({ data: { businessId, name: t.clientName.trim() } });
        clientId = cli.id;
      }
      await tx.transaction.create({
        data: { businessId, type: t.type, amount: t.amount, categoryId: cat.id, clientId, date: t.date, variableCost: t.variableCost ?? (t.type === 'receita' ? 0 : null), note: t.note || null },
      });
      summary.transactions++;
    }
  });

  res.json({ ok: true, summary });
});

export default router;
