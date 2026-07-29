import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, type AuthedRequest } from '../auth.js';
import {
  dreNumbers,
  prolaboreSuggestion,
  computeBalanceSheet,
  computeClientStats,
  cashDelta,
  isRevenueTx,
  monthKeyOf,
  monthKeyOffset,
  isOpExpense,
  type TxRow,
  type CategoryRow,
} from '../calc.js';
import { ensureRecurringGenerated } from './recurring.js';
import { computeReconciliation, reconcile } from '../reconciliation.js';
import { requireOwnerForWrites } from '../auth.js';
import { todayStr, daysBetween, numOr0 } from '../util.js';

const router = Router();
router.use(requireAuth);

export async function loadAll(businessId: string) {
  const [transactions, categories, clients, products, equipment, services, settings, bills, packages, appointments] = await Promise.all([
    prisma.transaction.findMany({ where: { businessId }, include: { items: true, sales: true } }),
    prisma.category.findMany({ where: { businessId } }),
    prisma.client.findMany({ where: { businessId } }),
    prisma.product.findMany({ where: { businessId } }),
    prisma.equipment.findMany({ where: { businessId } }),
    prisma.service.findMany({ where: { businessId }, include: { items: true } }),
    prisma.settings.upsert({ where: { businessId }, update: {}, create: { businessId } }),
    prisma.bill.findMany({ where: { businessId } }),
    prisma.package.findMany({ where: { businessId } }),
    prisma.appointment.findMany({ where: { businessId } }),
  ]);
  return { transactions: transactions as unknown as TxRow[], categories: categories as CategoryRow[], clients, products, equipment, services, settings, bills, packages, appointments };
}

function categoryName(categories: CategoryRow[] & { name?: string }[], id: string) {
  const c = (categories as any[]).find((x) => x.id === id);
  return c ? c.name : 'Categoria removida';
}

router.get('/home', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  await ensureRecurringGenerated(businessId);
  const data = await loadAll(businessId);
  res.json({
    alerts: buildAlerts(data),
    checklist: {
      hasCatalogItems: data.products.length > 0 || data.equipment.length > 0,
      hasServices: data.services.length > 0,
      hasTransactions: data.transactions.length > 0,
    },
  });
});

export function buildAlerts(data: Awaited<ReturnType<typeof loadAll>>) {
  const hoje = todayStr();
  const alerts: { id: string; kind: string; text: string; overdue: boolean; phone?: string | null; clientName?: string }[] = [];

  // Birthdays in the next 7 days — compared by month-day so the stored year
  // (often unknown/arbitrary) doesn't matter. These come first: a missed
  // birthday can't be caught up next week.
  const hojeDate = new Date(hoje + 'T00:00:00');
  data.clients.forEach((c) => {
    if (!c.birthday) return;
    const [, m, d] = c.birthday.split('-').map(Number);
    if (!m || !d) return;
    const alvo = new Date(hojeDate.getFullYear(), m - 1, d);
    if (alvo < hojeDate) alvo.setFullYear(alvo.getFullYear() + 1);
    const dias = Math.round((alvo.getTime() - hojeDate.getTime()) / 86400000);
    if (dias > 7) return;
    const quando = dias === 0 ? 'HOJE' : dias === 1 ? 'amanhã' : `${alvo.toLocaleDateString('pt-BR', { weekday: 'long' })} (${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')})`;
    alerts.push({ id: 'b' + c.id, kind: 'birthday', overdue: dias === 0, text: `🎂 ${c.name} faz aniversário ${quando}`, phone: c.phone, clientName: c.name });
  });

  // Booked appointments from the last 7 days that never became an
  // atendimento — the money probably happened, the register didn't. One
  // aggregated alert so a busy week doesn't flood the list.
  const seteDiasAtras = new Date(hojeDate.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const semRegistro = data.appointments.filter((a) => a.status === 'confirmed' && !a.txId && a.date < hoje && a.date >= seteDiasAtras);
  if (semRegistro.length > 0) {
    const dias = [...new Set(semRegistro.map((a) => a.date))].sort().map((d) => d.slice(8, 10) + '/' + d.slice(5, 7));
    alerts.push({
      id: 'apt-sem-registro',
      kind: 'appointment',
      overdue: true,
      text:
        semRegistro.length === 1
          ? `1 agendamento (${dias[0]}) ficou sem atendimento registrado — abra a Agenda pra registrar`
          : `${semRegistro.length} agendamentos (${dias.join(', ')}) ficaram sem atendimento registrado`,
    });
  }
  data.bills
    .filter((b) => !b.settled)
    .forEach((b) => {
      const dias = daysBetween(hoje, b.due);
      if (dias > 7) return;
      const quem = b.kind === 'pagar' ? 'Pagar' : 'Receber';
      alerts.push({
        id: b.id,
        kind: 'bill',
        overdue: dias < 0,
        text: `${quem} ${b.desc} — vence ${dias < 0 ? `atrasada ${-dias}d` : dias === 0 ? 'hoje' : `em ${dias}d`}`,
      });
    });
  data.products
    .filter((p) => numOr0(p.stock) <= numOr0((p as { lowStockAt?: number }).lowStockAt ?? 1))
    .slice(0, 4)
    .forEach((p) => alerts.push({ id: 'e' + p.id, kind: 'stock', overdue: false, text: `Estoque baixo: ${p.name} (${numOr0(p.stock)} un)` }));
  data.products
    .filter((p) => p.expiresAt && daysBetween(hoje, p.expiresAt) <= 30)
    .slice(0, 4)
    .forEach((p) => {
      const dias = daysBetween(hoje, p.expiresAt!);
      alerts.push({ id: 'x' + p.id, kind: 'stock', overdue: dias < 0, text: dias < 0 ? `${p.name} vencido há ${-dias}d` : `${p.name} vence em ${dias}d` });
    });
  data.clients.forEach((c) => {
    const st = computeClientStats(c.id, data.transactions);
    if (st.diasDesde != null && st.diasDesde > 60) {
      alerts.push({ id: 'c' + c.id, kind: 'client', overdue: false, text: `${c.name} não vem há ${st.diasDesde} dias — vale chamar` });
    }
  });
  return alerts.slice(0, 8);
}

router.get('/dashboard', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const monthOffset = Number(req.query.monthOffset) || 0;
  const data = await loadAll(businessId);
  const monthKey = monthKeyOffset(monthOffset);
  const monthTx = data.transactions.filter((t) => monthKeyOf(t.date) === monthKey);

  // Caixa is cash-basis on both sides: a package sale counts in full (money
  // really came in) but a session-use recognition doesn't add again; an
  // accrued room fee doesn't subtract until the month's bill is actually
  // paid. cashDelta encodes all of that.
  const receitasTotal = monthTx.filter((t) => t.type === 'receita').reduce((a, t) => a + cashDelta(t), 0);
  const despesasTotal = monthTx.filter((t) => t.type === 'despesa').reduce((a, t) => a - cashDelta(t), 0);
  const receitasOp = monthTx.filter((t) => t.type === 'receita' && !t.capital).reduce((a, t) => a + cashDelta(t), 0);
  const despesasOp = monthTx.filter((t) => t.type === 'despesa' && !t.capital).reduce((a, t) => a - cashDelta(t), 0);

  const svcTx = monthTx.filter((t) => t.type === 'receita' && t.serviceId && t.variableCost != null);
  const custoVariavelTotal = svcTx.reduce((a, t) => a + (t.variableCost || 0), 0);
  const margem = svcTx.reduce((a, t) => a + (t.amount - (t.variableCost || 0)), 0);

  const pl = prolaboreSuggestion(monthTx, data.categories, data.settings);

  const despesaCats = data.categories.filter((c) => c.type === 'despesa');
  const categoryBreakdown = despesaCats
    .map((c) => ({
      id: c.id,
      name: (c as any).name as string,
      amount: monthTx.filter((t) => t.type === 'despesa' && t.categoryId === c.id).reduce((a, t) => a - cashDelta(t), 0),
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const recentTx = [...monthTx]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((t) => serializeTx(t, data));

  // Split by capitalKind: an aporte marked "vira capital" is investment, not
  // debt — only the empréstimo balance is money the business owes back.
  const sociosMap: Record<string, { aportado: number; pago: number; capital: number; emprestimo: number }> = {};
  data.transactions.forEach((t) => {
    if (!t.capital || !t.socio) return;
    if (!sociosMap[t.socio]) sociosMap[t.socio] = { aportado: 0, pago: 0, capital: 0, emprestimo: 0 };
    const kind = (t.capitalKind || 'capital') === 'emprestimo' ? 'emprestimo' : 'capital';
    const sign = t.capital === 'aporte' ? 1 : -1;
    sociosMap[t.socio][kind] += sign * t.amount;
    if (t.capital === 'aporte') sociosMap[t.socio].aportado += t.amount;
    else sociosMap[t.socio].pago += t.amount;
  });
  const sociosList = Object.entries(sociosMap).map(([name, v]) => ({
    name,
    aportado: v.aportado,
    pago: v.pago,
    saldo: v.aportado - v.pago,
    capital: v.capital,
    emprestimo: v.emprestimo,
  }));

  res.json({
    monthKey,
    receitasTotal,
    receitasOp,
    despesasTotal,
    saldo: receitasTotal - despesasTotal,
    lucroOp: receitasOp - despesasOp,
    metaMensal: data.settings.metaMensal,
    metaPct: data.settings.metaMensal > 0 ? Math.min(100, (receitasOp / data.settings.metaMensal) * 100) : 0,
    margem,
    custoVariavelTotal,
    atendimentosComFicha: svcTx.length,
    prolabore: pl,
    categoryBreakdown,
    recentTx,
    alerts: buildAlerts(data),
    sociosList,
  });
});

router.get('/dashboard-year', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const yearOffset = Number(req.query.yearOffset) || 0;
  const data = await loadAll(businessId);
  const year = new Date().getFullYear() + yearOffset;
  const yearTx = data.transactions.filter((t) => monthKeyOf(t.date).slice(0, 4) === String(year));
  const receitas = yearTx.filter((t) => t.type === 'receita').reduce((a, t) => a + cashDelta(t), 0);
  const despesas = yearTx.filter((t) => t.type === 'despesa').reduce((a, t) => a - cashDelta(t), 0);
  const lucroOp =
    yearTx.filter((t) => t.type === 'receita' && !t.capital).reduce((a, t) => a + cashDelta(t), 0) -
    yearTx.filter((t) => t.type === 'despesa' && !t.capital).reduce((a, t) => a - cashDelta(t), 0);

  const monthsInYear = [];
  for (let i = 0; i < 12; i++) {
    const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
    const mTx = data.transactions.filter((t) => monthKeyOf(t.date) === mk);
    const rec = mTx.filter((t) => t.type === 'receita').reduce((a, t) => a + cashDelta(t), 0);
    const desp = mTx.filter((t) => t.type === 'despesa').reduce((a, t) => a - cashDelta(t), 0);
    monthsInYear.push({ month: i, monthKey: mk, receita: rec, despesa: desp, saldo: rec - desp });
  }
  res.json({ year, receitas, despesas, lucroOp, monthsInYear });
});

router.get('/resultado', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const scope = (req.query.scope as string) === 'year' ? 'year' : 'month';
  const monthOffset = Number(req.query.monthOffset) || 0;
  const yearOffset = Number(req.query.yearOffset) || 0;
  const data = await loadAll(businessId);
  const year = new Date().getFullYear() + yearOffset;
  const monthKey = monthKeyOffset(monthOffset);
  const key = scope === 'year' ? String(year) : monthKey;
  const dreTx = data.transactions.filter((t) => (scope === 'year' ? monthKeyOf(t.date).slice(0, 4) === key : monthKeyOf(t.date) === key));
  const dre = dreNumbers(key, dreTx, data.categories);

  const svcAgg: Record<string, { count: number; receita: number; margem: number }> = {};
  const recTx = dreTx.filter(isRevenueTx);
  recTx.forEach((t) => {
    if (!t.serviceId) return;
    const name = data.services.find((s) => s.id === t.serviceId)?.name || 'Serviço removido';
    const vendaValor = t.sales.reduce((a, sl) => a + sl.qty * sl.unitPrice, 0);
    if (!svcAgg[name]) svcAgg[name] = { count: 0, receita: 0, margem: 0 };
    svcAgg[name].count += 1;
    svcAgg[name].receita += t.amount - vendaValor;
    svcAgg[name].margem += t.amount - vendaValor - (t.variableCost || 0);
  });

  const vendaAgg: Record<string, { qty: number; receita: number; margem: number }> = {};
  recTx.forEach((t) => {
    t.sales.forEach((sl) => {
      const name = data.products.find((p) => p.id === sl.productId)?.name || 'Produto removido';
      if (!vendaAgg[name]) vendaAgg[name] = { qty: 0, receita: 0, margem: 0 };
      vendaAgg[name].qty += sl.qty;
      vendaAgg[name].receita += sl.qty * sl.unitPrice;
      vendaAgg[name].margem += sl.qty * (sl.unitPrice - sl.unitCost);
    });
  });

  const last6 = [];
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const mk = d.toISOString().slice(0, 7);
    const mTx = data.transactions.filter((t) => monthKeyOf(t.date) === mk);
    const n = dreNumbers(mk, mTx, data.categories);
    last6.push({ monthKey: mk, receita: n.receita, lucro: n.resultado, margemPct: n.receita > 0 ? (n.resultado / n.receita) * 100 : null });
  }

  const aReceberAberto = data.bills.filter((b) => !b.settled && b.kind === 'receber').reduce((a, b) => a + b.amount, 0);
  const aPagarAberto = data.bills.filter((b) => !b.settled && b.kind === 'pagar').reduce((a, b) => a + b.amount, 0);
  const balance = computeBalanceSheet({
    allTx: data.transactions,
    products: data.products,
    equipment: data.equipment,
    categories: data.categories,
    packages: data.packages,
    aReceberAberto,
    aPagarAberto,
  });

  const despPorAtend = dre.atendCount > 0 ? (dre.desp + dre.prolabore) / dre.atendCount : 0;
  const breakEven = dre.margem > 0 && dre.atendCount > 0 ? Math.ceil((dre.desp + dre.prolabore) / (dre.margem / dre.atendCount)) : null;

  res.json({
    scope,
    key,
    dre,
    breakEven,
    despPorAtend,
    porServico: Object.entries(svcAgg).map(([name, v]) => ({ name, ...v })),
    porProduto: Object.entries(vendaAgg).map(([name, v]) => ({ name, ...v })),
    last6,
    balance,
  });
});

router.get('/contas', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  await ensureRecurringGenerated(businessId);
  const data = await loadAll(businessId);
  const aReceberAberto = data.bills.filter((b) => !b.settled && b.kind === 'receber').reduce((a, b) => a + b.amount, 0);
  const aPagarAberto = data.bills.filter((b) => !b.settled && b.kind === 'pagar').reduce((a, b) => a + b.amount, 0);
  const balance = computeBalanceSheet({
    allTx: data.transactions,
    products: data.products,
    equipment: data.equipment,
    categories: data.categories,
    packages: data.packages,
    aReceberAberto,
    aPagarAberto,
  });
  const abertas = data.bills.filter((b) => !b.settled);
  res.json({
    aReceberTotal: aReceberAberto,
    aPagarTotal: aPagarAberto,
    caixaProjetado: balance.caixaProjetado,
    aPagarList: abertas.filter((b) => b.kind === 'pagar').sort((a, b) => a.due.localeCompare(b.due)),
    aReceberList: abertas.filter((b) => b.kind === 'receber').sort((a, b) => a.due.localeCompare(b.due)),
    quitadasList: data.bills.filter((b) => b.settled).slice(-8).reverse(),
    balance,
  });
});

/** What the "ajuste a conciliar" is made of, item by item. */
router.get('/reconciliation', async (req: AuthedRequest, res) => {
  res.json(await computeReconciliation(req.businessId!));
});

/** One click books the missing history — an aporte + purchase pair per item.
 *  Amounts are recomputed here; the client sends nothing. */
router.post('/reconciliation', requireOwnerForWrites, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
  const result = await reconcile(req.businessId!, user?.name || 'Sócia');
  res.json(result);
});

function serializeTx(t: TxRow & { id: string }, data: Awaited<ReturnType<typeof loadAll>>) {
  const client = data.clients.find((c) => c.id === t.clientId);
  const service = data.services.find((s) => s.id === t.serviceId);
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    date: t.date,
    categoryName: service ? service.name : categoryName(data.categories, t.categoryId),
    // For purchases/sales there is no client — name the item instead, so the
    // row never reads as an anonymous "Compra de estoque".
    clientName: t.capital
      ? t.socio
      : client?.name ||
        data.products.find((x) => x.id === (t as { productId?: string | null }).productId)?.name ||
        data.equipment.find((x) => x.id === (t as { equipmentId?: string | null }).equipmentId)?.name ||
        data.products.find((x) => x.id === t.sales?.[0]?.productId)?.name ||
        null,
    payment: t.payment,
    variableCost: t.variableCost,
    hasMargem: t.type === 'receita' && t.variableCost != null,
    margem: t.variableCost != null ? t.amount - t.variableCost : null,
    cashOnly: t.cashOnly,
    accrualOnly: t.accrualOnly,
  };
}

router.get('/clientes', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const data = await loadAll(businessId);
  const stats = Object.fromEntries(data.clients.map((c) => [c.id, computeClientStats(c.id, data.transactions)]));

  const totalVisitas = data.clients.reduce((a, c) => a + stats[c.id].visitas, 0);
  const totalGasto = data.clients.reduce((a, c) => a + stats[c.id].gasto, 0);
  const recorrentes = data.clients.filter((c) => stats[c.id].visitas >= 2).length;
  const comVisita = data.clients.filter((c) => stats[c.id].visitas > 0).length;
  const intervalos = data.clients.map((c) => stats[c.id].intervaloMedio).filter((x): x is number => x != null);

  const clientsList = data.clients.map((c) => {
    const st = stats[c.id];
    const abertoNum = data.bills.filter((b) => b.clientId === c.id && !b.settled && b.kind === 'receber').reduce((a, b) => a + b.amount, 0);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      birthday: c.birthday,
      notes: c.notes,
      visitas: st.visitas,
      gasto: st.gasto,
      ticketMedio: st.visitas > 0 ? st.gasto / st.visitas : 0,
      diasDesde: st.diasDesde,
      aberto: abertoNum,
    };
  });

  const topClientes = data.clients
    .map((c) => ({ name: c.name, gasto: stats[c.id].gasto, visitas: stats[c.id].visitas }))
    .filter((x) => x.gasto > 0)
    .sort((a, b) => b.gasto - a.gasto)
    .slice(0, 6);

  const reativarList = data.clients
    .filter((c) => stats[c.id].visitas > 0 && (stats[c.id].diasDesde || 0) > 45)
    .sort((a, b) => (stats[b.id].diasDesde || 0) - (stats[a.id].diasDesde || 0))
    .map((c) => ({ name: c.name, phone: c.phone, diasDesde: stats[c.id].diasDesde }));

  const inativosList = data.clients
    .filter((c) => (stats[c.id].diasDesde || 0) > 45)
    .sort((a, b) => (stats[b.id].diasDesde || 0) - (stats[a.id].diasDesde || 0))
    .slice(0, 12)
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, diasDesde: stats[c.id].diasDesde }));

  const novosPorMes = [];
  for (let i = 5; i >= 0; i--) {
    const dN = new Date();
    dN.setDate(1);
    dN.setMonth(dN.getMonth() - i);
    const mk = dN.toISOString().slice(0, 7);
    const count = data.clients.filter((c) => stats[c.id].primeira && stats[c.id].primeira!.slice(0, 7) === mk).length;
    novosPorMes.push({ monthKey: mk, count });
  }

  res.json({
    ticketMedio: totalVisitas > 0 ? totalGasto / totalVisitas : 0,
    recorrentesPct: comVisita > 0 ? (recorrentes / comVisita) * 100 : 0,
    recorrentes,
    comVisita,
    ltvMedio: comVisita > 0 ? totalGasto / comVisita : 0,
    intervaloMedio: intervalos.length ? intervalos.reduce((a, b) => a + b, 0) / intervalos.length : null,
    topClientes,
    reativarList,
    inativosList,
    novosPorMes,
    clientsList,
  });
});

router.get('/clients/:id', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const client = await prisma.client.findFirst({ where: { id: req.params.id, businessId } });
  if (!client) return res.status(404).json({ error: 'not_found' });
  const data = await loadAll(businessId);
  const tx = data.transactions.filter((t) => t.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date));
  // Cash actually paid — excludes accrualOnly package-session recognitions
  // so a package sale + its later sessions aren't counted as money twice.
  const pago = tx.filter((t) => t.type === 'receita').reduce((a, t) => a + cashDelta(t), 0);
  const visitasCount = tx.filter((t) => t.type === 'receita').length;
  const bills = data.bills.filter((b) => b.clientId === client.id);
  const aberto = bills.filter((b) => !b.settled && b.kind === 'receber').reduce((a, b) => a + b.amount, 0);
  const packages = await prisma.package.findMany({ where: { businessId, clientId: client.id }, orderBy: { date: 'desc' } });

  res.json({
    client,
    pago,
    aberto,
    visitas: visitasCount,
    ticketMedio: visitasCount > 0 ? pago / visitasCount : 0,
    bills: bills.sort((a, b) => (a.settled === b.settled ? a.due.localeCompare(b.due) : a.settled ? 1 : -1)),
    history: tx.slice(0, 20).map((t) => serializeTx(t, data)),
    packages: packages.map((p) => ({
      ...p,
      serviceName: data.services.find((s) => s.id === p.serviceId)?.name || null,
      restantes: p.sessions - p.used,
    })),
  });
});

function sendCsv(res: import('express').Response, filename: string, rows: string[]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + rows.join('\n'));
}
const csvNum = (v: number) => v.toFixed(2).replace('.', ',');

router.get('/export/dre.csv', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const scope = (req.query.scope as string) === 'year' ? 'year' : 'month';
  const monthOffset = Number(req.query.monthOffset) || 0;
  const yearOffset = Number(req.query.yearOffset) || 0;
  const data = await loadAll(businessId);
  const year = new Date().getFullYear() + yearOffset;
  const monthKey = monthKeyOffset(monthOffset);
  const key = scope === 'year' ? String(year) : monthKey;
  const dreTx = data.transactions.filter((t) => (scope === 'year' ? monthKeyOf(t.date).slice(0, 4) === key : monthKeyOf(t.date) === key));
  const n = dreNumbers(key, dreTx, data.categories);
  sendCsv(res, `rikari-dre-${key}.csv`, [
    ['DRE simplificado', key].join(';'),
    ['Receita de atendimentos', csvNum(n.serv)].join(';'),
    ['Receita de vendas de produtos', csvNum(n.vendas)].join(';'),
    ['Receita total', csvNum(n.receita)].join(';'),
    ['(-) Custo variavel dos atendimentos', csvNum(n.custoVar)].join(';'),
    ['(-) CMV (custo medio dos produtos vendidos)', csvNum(n.cmv)].join(';'),
    ['= Margem de contribuicao', csvNum(n.margem)].join(';'),
    ['(-) Despesas operacionais', csvNum(n.desp)].join(';'),
    ['(-) Pro-labore retirado', csvNum(n.prolabore)].join(';'),
    ['= Resultado do periodo', csvNum(n.resultado)].join(';'),
  ]);
});

router.get('/export/balanco.csv', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const data = await loadAll(businessId);
  const aReceberAberto = data.bills.filter((b) => !b.settled && b.kind === 'receber').reduce((a, b) => a + b.amount, 0);
  const aPagarAberto = data.bills.filter((b) => !b.settled && b.kind === 'pagar').reduce((a, b) => a + b.amount, 0);
  const balance = computeBalanceSheet({ allTx: data.transactions, products: data.products, equipment: data.equipment, categories: data.categories, packages: data.packages, aReceberAberto, aPagarAberto });
  sendCsv(res, `rikari-balanco-${todayStr()}.csv`, [
    ['Balanco simplificado', todayStr()].join(';'),
    ['ATIVO', ''].join(';'),
    ['Caixa acumulado', csvNum(balance.caixa)].join(';'),
    ['Estoque (custo medio)', csvNum(balance.estoque)].join(';'),
    ['Equipamentos (bruto)', csvNum(balance.equipBruto)].join(';'),
    ['(-) Depreciacao acumulada', csvNum(balance.depreciacao)].join(';'),
    ['Contas a receber', csvNum(balance.aReceber)].join(';'),
    ['Ativo total', csvNum(balance.ativoTotal)].join(';'),
    ['PASSIVO', ''].join(';'),
    ['Contas a pagar', csvNum(balance.aPagar)].join(';'),
    ['Emprestimo de socios (a devolver)', csvNum(balance.emprestimoSocios)].join(';'),
    ['Receita diferida (pacotes nao realizados)', csvNum(balance.receitaDiferida)].join(';'),
    ['Passivo total', csvNum(balance.passivoTotal)].join(';'),
    ['PATRIMONIO LIQUIDO', ''].join(';'),
    ['Capital investido pelos socios', csvNum(balance.capitalSocios)].join(';'),
    ['Lucros/prejuizos acumulados (DRE)', csvNum(balance.lucrosAcumulados)].join(';'),
    ['Resultado a realizar (a receber - a pagar)', csvNum(balance.resultadoARealizar)].join(';'),
    ['Ajuste a conciliar', csvNum(balance.ajusteConciliar)].join(';'),
    ['PL total', csvNum(balance.plLiquido)].join(';'),
  ]);
});

router.get('/export/transactions.csv', async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const data = await loadAll(businessId);
  const esc = (v: string) => `"${v.split('"').join('""')}"`;
  const rows = [['data', 'tipo', 'categoria', 'servico', 'cliente', 'valor', 'custo_variavel', 'reconhecimento', 'nota'].join(';')];
  [...data.transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => {
      const cliente = t.capital ? t.socio : data.clients.find((c) => c.id === t.clientId)?.name;
      const reconhecimento = t.cashOnly ? 'caixa (pacote nao realizado)' : t.accrualOnly ? 'receita (sem novo caixa)' : '';
      rows.push(
        [
          t.date,
          t.type,
          categoryName(data.categories, t.categoryId),
          data.services.find((s) => s.id === t.serviceId)?.name || '',
          cliente || '',
          csvNum(t.amount),
          t.variableCost != null ? csvNum(t.variableCost) : '',
          reconhecimento,
          t.note || '',
        ]
          .map((v) => esc(String(v ?? '')))
          .join(';')
      );
    });
  sendCsv(res, `rikari-lancamentos-${todayStr()}.csv`, rows);
});

export default router;
