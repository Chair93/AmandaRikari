// Business logic ported from the Rikari design prototype (Rikari.dc.html).
// Kept as pure functions operating on plain data so it's easy to unit test
// and reuse across report endpoints.
import { numOr0, monthKeyOf, daysBetween, todayStr } from './util.js';

export type TxItem = { kind: string; productId: string | null; equipmentId: string | null; qty: number };
export type TxSale = { productId: string; qty: number; unitPrice: number; unitCost: number };

export type TxRow = {
  id: string;
  type: string; // 'receita' | 'despesa'
  amount: number;
  categoryId: string;
  clientId: string | null;
  serviceId: string | null;
  distanciaKm: number | null;
  variableCost: number | null;
  date: string;
  note: string | null;
  capital: string | null;
  capitalKind: string | null;
  socio: string | null;
  payment: string | null;
  feeOf: string | null;
  prolabore: boolean;
  estoque: boolean;
  ativo: boolean;
  cashOnly: boolean; // package sale / installment payoff: moves cash, revenue not yet earned
  accrualOnly: boolean; // package session used: earns its share of revenue, no new cash
  packageId: string | null;
  items: TxItem[];
  sales: TxSale[];
};

export type PackageRow = { id: string; amount: number };

export type ProductRow = { id: string; packageCost: number; packageQty: number; avgCost: number; stock: number };
export type EquipmentRow = {
  id: string;
  kind: string; // 'utensilio' | 'maquina'
  qty: number;
  cost: number;
  usefulUses: number;
  kwh: number;
  perdaBaixa: number;
};
export type CategoryRow = { id: string; type: string; investment: boolean };
export type SettingsRow = {
  energyPricePerKwh: number;
  costPerKm: number;
  prolaboreMode: string;
  prolaborePct: number;
  prolaboreFixo: number;
  taxaCredito: number;
  taxaDebito: number;
  taxaPix: number;
  metaMensal: number;
};

function isMaquina(eq: EquipmentRow): boolean {
  return (eq.kind || (eq.kwh > 0 ? 'maquina' : 'utensilio')) === 'maquina';
}

export function computeServiceCost(
  items: { kind: string; refId: string; qty: number }[],
  products: ProductRow[],
  equipment: EquipmentRow[],
  settings: SettingsRow
): number {
  const energyPrice = numOr0(settings.energyPricePerKwh);
  return items.reduce((sum, it) => {
    if (it.kind === 'product') {
      const p = products.find((x) => x.id === it.refId);
      if (!p) return sum;
      const base = numOr0(p.avgCost) || numOr0(p.packageCost);
      const perUnit = numOr0(p.packageQty) > 0 ? base / numOr0(p.packageQty) : 0;
      return sum + perUnit * numOr0(it.qty);
    }
    const eq = equipment.find((x) => x.id === it.refId);
    if (!eq) return sum;
    const porUso = numOr0(eq.usefulUses) > 0 ? numOr0(eq.cost) / numOr0(eq.usefulUses) : 0;
    if (isMaquina(eq)) {
      const minutos = numOr0(it.qty);
      return sum + porUso + numOr0(eq.kwh) * (minutos / 60) * energyPrice;
    }
    const usos = Math.max(1, numOr0(it.qty));
    return sum + porUso * usos;
  }, 0);
}

export function feePctFor(method: string | null | undefined, settings: SettingsRow): number {
  if (method === 'credito') return numOr0(settings.taxaCredito);
  if (method === 'debito') return numOr0(settings.taxaDebito);
  if (method === 'pix') return numOr0(settings.taxaPix);
  return 0;
}

/** Counts how many transaction line-items reference each piece of equipment
 *  ("usos" = number of times used, regardless of minutes/qty per use). */
export function equipmentUsageCounts(allItems: { kind: string; equipmentId: string | null }[]): Record<string, number> {
  const usos: Record<string, number> = {};
  allItems.forEach((it) => {
    if (it.kind === 'equipment' && it.equipmentId) usos[it.equipmentId] = (usos[it.equipmentId] || 0) + 1;
  });
  return usos;
}

export function equipmentDepreciation(eq: EquipmentRow, usos: number): number {
  const porUso = numOr0(eq.usefulUses) > 0 ? numOr0(eq.cost) / numOr0(eq.usefulUses) : 0;
  const bruto = numOr0(eq.cost) * (numOr0(eq.qty) || 1);
  return Math.min(bruto, usos * porUso);
}

function isInvestmentCategory(categoryId: string, categories: CategoryRow[]): boolean {
  const c = categories.find((x) => x.id === categoryId);
  return !!(c && c.type === 'despesa' && c.investment);
}

/** A despesa transaction that should count toward the operating result (DRE). */
export function isOpExpense(t: TxRow, categories: CategoryRow[]): boolean {
  return t.type === 'despesa' && !t.capital && !t.estoque && !t.ativo && !isInvestmentCategory(t.categoryId, categories);
}

export function salesTotal(sales: TxSale[]): number {
  return sales.reduce((a, sl) => a + sl.qty * sl.unitPrice, 0);
}
export function salesCmv(sales: TxSale[]): number {
  return sales.reduce((a, sl) => a + sl.qty * sl.unitCost, 0);
}

/** Cash impact of a transaction — 0 for accrualOnly (revenue recognized with
 *  no new money in), full signed amount otherwise (cashOnly transactions DO
 *  move cash, they just don't count as revenue yet — see isRevenueTx). */
export function cashDelta(t: TxRow): number {
  if (t.type === 'receita') return t.accrualOnly ? 0 : t.amount;
  return -t.amount;
}

/** Whether a receita transaction counts as recognized (accrual) revenue for
 *  DRE/Resultado purposes — excludes sócio contributions and cashOnly
 *  package cash-ins (sale / installment payoff), which get recognized later
 *  as their sessions are actually delivered. */
export function isRevenueTx(t: TxRow): boolean {
  return t.type === 'receita' && !t.capital && !t.cashOnly;
}

/** Deterministic per-session revenue share for a prepaid package: splits
 *  `amount` evenly across `sessions`, giving the last session whatever's
 *  left over so the total recognized across all sessions is always exactly
 *  `amount`, cent for cent (same pattern as installment splitting). */
export function packageSessionAmount(pkg: { amount: number; sessions: number }, sessionIndex: number): number {
  if (pkg.sessions <= 0) return 0;
  const base = Math.floor((pkg.amount / pkg.sessions) * 100) / 100;
  if (sessionIndex >= pkg.sessions) return Math.round((pkg.amount - base * (pkg.sessions - 1)) * 100) / 100;
  return base;
}

export interface DreNumbers {
  key: string;
  serv: number;
  vendas: number;
  receita: number;
  custoVar: number;
  cmv: number;
  margem: number;
  desp: number;
  prolabore: number;
  resultado: number;
  atendCount: number;
}

/** transactions must already be filtered to the desired period (month or year). */
export function dreNumbers(key: string, tx: TxRow[], categories: CategoryRow[]): DreNumbers {
  const rec = tx.filter(isRevenueTx);
  const vendas = rec.reduce((a, t) => a + salesTotal(t.sales), 0);
  const cmv = rec.reduce((a, t) => a + salesCmv(t.sales), 0);
  const serv = rec.reduce((a, t) => a + t.amount, 0) - vendas;
  const custoVar = rec.reduce((a, t) => a + (t.variableCost || 0), 0);
  const opExpenses = tx.filter((t) => isOpExpense(t, categories));
  const prolabore = opExpenses.filter((t) => t.prolabore).reduce((a, t) => a + t.amount, 0);
  const desp = opExpenses.filter((t) => !t.prolabore).reduce((a, t) => a + t.amount, 0);
  const atendCount = rec.filter((t) => t.serviceId || t.items.length).length;
  return {
    key,
    serv,
    vendas,
    receita: serv + vendas,
    custoVar,
    cmv,
    margem: serv + vendas - custoVar - cmv,
    desp,
    prolabore,
    resultado: serv + vendas - custoVar - cmv - desp - prolabore,
    atendCount,
  };
}

export interface ProlaboreSuggestion {
  base: number;
  amount: number;
  mode: string;
  pct: number;
  retirado: number;
}

/** monthTx = all transactions dated within the target month. */
export function prolaboreSuggestion(monthTx: TxRow[], categories: CategoryRow[], settings: SettingsRow): ProlaboreSuggestion {
  const rec = monthTx.filter(isRevenueTx);
  const vendas = rec.reduce((a, t) => a + salesTotal(t.sales), 0);
  const receitaSvc = rec.reduce((a, t) => a + t.amount, 0) - vendas;
  const custoVar = rec.reduce((a, t) => a + (t.variableCost || 0), 0);
  const desp = monthTx
    .filter((t) => isOpExpense(t, categories) && !t.prolabore)
    .reduce((a, t) => a + t.amount, 0);
  const base = Math.max(0, receitaSvc - custoVar - desp);
  const mode = settings.prolaboreMode || 'pct';
  const pct = numOr0(settings.prolaborePct);
  const amount = mode === 'fixo' ? numOr0(settings.prolaboreFixo) : base * (pct / 100);
  const retirado = monthTx.filter((t) => t.prolabore).reduce((a, t) => a + t.amount, 0);
  return { base, amount: Math.max(0, amount), mode, pct, retirado };
}

export interface BalanceSheet {
  caixa: number;
  estoque: number;
  equipBruto: number;
  depreciacao: number;
  equipAtivo: number;
  ativoOperacional: number;
  aReceber: number;
  aPagar: number;
  ativoTotal: number;
  passivoTotal: number;
  aportesTotal: number;
  capitalSocios: number;
  emprestimoSocios: number;
  receitaDiferida: number;
  lucrosAcumulados: number;
  perdaBaixas: number;
  plLiquido: number;
  resultadoARealizar: number;
  ajusteConciliar: number;
  caixaProjetado: number;
}

/** Sum of prepaid-package cash still not "earned" — sessions sold but not
 *  yet delivered. Derived straight from the ledger (packageId + accrualOnly
 *  transactions), so it self-corrects if a session-use entry is edited or
 *  deleted, no counters to drift out of sync. */
export function computeReceitaDiferida(allTx: TxRow[], packages: PackageRow[]): number {
  const recognizedByPackage: Record<string, number> = {};
  allTx.forEach((t) => {
    if (t.accrualOnly && t.packageId) recognizedByPackage[t.packageId] = (recognizedByPackage[t.packageId] || 0) + t.amount;
  });
  return packages.reduce((a, p) => a + Math.max(0, p.amount - (recognizedByPackage[p.id] || 0)), 0);
}

export function computeBalanceSheet(params: {
  allTx: TxRow[];
  products: ProductRow[];
  equipment: EquipmentRow[];
  categories: CategoryRow[];
  packages: PackageRow[];
  aReceberAberto: number;
  aPagarAberto: number;
}): BalanceSheet {
  const { allTx, products, equipment, categories, packages, aReceberAberto, aPagarAberto } = params;
  const caixa = allTx.reduce((a, t) => a + cashDelta(t), 0);
  const estoque = products.reduce((a, p) => a + numOr0(p.stock) * (numOr0(p.avgCost) || numOr0(p.packageCost)), 0);
  const usos = equipmentUsageCounts(allTx.flatMap((t) => t.items));
  const equipBruto = equipment.reduce((a, eq) => a + numOr0(eq.cost) * (numOr0(eq.qty) || 1), 0);
  const depreciacao = equipment.reduce((a, eq) => a + equipmentDepreciation(eq, usos[eq.id] || 0), 0);
  const equipAtivo = equipBruto - depreciacao;
  const perdaBaixas = equipment.reduce((a, eq) => a + numOr0(eq.perdaBaixa), 0);

  const aportesTotal = allTx.reduce(
    (a, t) => a + (t.capital === 'aporte' ? t.amount : t.capital === 'pagamento' ? -t.amount : 0),
    0
  );
  const capitalSocios = allTx.reduce(
    (a, t) =>
      a +
      ((t.capitalKind || 'capital') === 'capital'
        ? t.capital === 'aporte'
          ? t.amount
          : t.capital === 'pagamento'
          ? -t.amount
          : 0
        : 0),
    0
  );
  const emprestimoSocios = aportesTotal - capitalSocios;
  const receitaDiferida = computeReceitaDiferida(allTx, packages);

  const rec = allTx.filter(isRevenueTx);
  const cmv = rec.reduce((a, t) => a + salesCmv(t.sales), 0);
  const custoVar = rec.reduce((a, t) => a + (t.variableCost || 0), 0);
  const desp = allTx.filter((t) => isOpExpense(t, categories)).reduce((a, t) => a + t.amount, 0);
  const lucrosAcumulados = rec.reduce((a, t) => a + t.amount, 0) - custoVar - cmv - desp;

  const ativoOperacional = caixa + estoque + equipAtivo;
  const ativoTotal = ativoOperacional + aReceberAberto;
  const passivoTotal = aPagarAberto + emprestimoSocios + receitaDiferida;
  const plLiquido = ativoTotal - passivoTotal;
  const resultadoARealizar = aReceberAberto - aPagarAberto;
  const ajusteConciliar = ativoOperacional - aportesTotal - (lucrosAcumulados - perdaBaixas);
  const caixaProjetado = caixa + aReceberAberto - aPagarAberto;

  return {
    caixa,
    estoque,
    equipBruto,
    depreciacao,
    equipAtivo,
    ativoOperacional,
    aReceber: aReceberAberto,
    aPagar: aPagarAberto,
    ativoTotal,
    passivoTotal,
    aportesTotal,
    capitalSocios,
    emprestimoSocios,
    receitaDiferida,
    lucrosAcumulados,
    perdaBaixas,
    plLiquido,
    resultadoARealizar,
    ajusteConciliar,
    caixaProjetado,
  };
}

export interface ClientStats {
  visitas: number;
  gasto: number;
  ultima: string | null;
  primeira: string | null;
  diasDesde: number | null;
  intervaloMedio: number | null;
}

export function computeClientStats(clientId: string, allTx: TxRow[]): ClientStats {
  const visitas = allTx
    .filter((t) => t.clientId === clientId && t.type === 'receita' && !t.capital)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Cash actually paid by this client — not accrual revenue, so a package
  // sale and its later session-use recognitions aren't double-counted.
  const gasto = visitas.reduce((a, t) => a + (t.accrualOnly ? 0 : t.amount), 0);
  const ultima = visitas.length ? visitas[visitas.length - 1].date : null;
  const primeira = visitas.length ? visitas[0].date : null;
  const intervalos: number[] = [];
  for (let i = 1; i < visitas.length; i++) intervalos.push(daysBetween(visitas[i - 1].date, visitas[i].date));
  const hoje = todayStr();
  return {
    visitas: visitas.length,
    gasto,
    ultima,
    primeira,
    diasDesde: ultima ? daysBetween(ultima, hoje) : null,
    intervaloMedio: intervalos.length ? intervalos.reduce((a, b) => a + b, 0) / intervalos.length : null,
  };
}

export function monthKeyOffset(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
}

export { monthKeyOf };
