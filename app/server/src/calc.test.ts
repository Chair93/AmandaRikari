import { describe, it, expect } from 'vitest';
import {
  computeServiceCost,
  feePctFor,
  salaFeeAmount,
  equipmentUsageCounts,
  equipmentDepreciation,
  isOpExpense,
  isRevenueTx,
  cashDelta,
  dreNumbers,
  prolaboreSuggestion,
  packageSessionAmount,
  computeReceitaDiferida,
  computeBalanceSheet,
  computeClientStats,
  type TxRow,
  type ProductRow,
  type EquipmentRow,
  type CategoryRow,
  type SettingsRow,
  type PackageRow,
} from './calc.js';

// ---------- fixtures ----------

function tx(overrides: Partial<TxRow> & { type: string; amount: number; date: string }): TxRow {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    categoryId: 'cat',
    clientId: null,
    serviceId: null,
    distanciaKm: null,
    variableCost: null,
    note: null,
    capital: null,
    capitalKind: null,
    socio: null,
    payment: null,
    feeOf: null,
    prolabore: false,
    estoque: false,
    ativo: false,
    cashOnly: false,
    accrualOnly: false,
    packageId: null,
    items: [],
    sales: [],
    ...overrides,
  };
}

const settings: SettingsRow = {
  energyPricePerKwh: 1,
  costPerKm: 2,
  prolaboreMode: 'pct',
  prolaborePct: 30,
  prolaboreFixo: 0,
  taxaCredito: 4,
  taxaDebito: 2,
  taxaPix: 1,
  metaMensal: 0,
};

const opCategory: CategoryRow = { id: 'cat', type: 'despesa', investment: false };
const investCategory: CategoryRow = { id: 'invest-cat', type: 'despesa', investment: true };
const receitaCategory: CategoryRow = { id: 'rec-cat', type: 'receita', investment: false };
const categories = [opCategory, investCategory, receitaCategory];

// ---------- computeServiceCost ----------

describe('computeServiceCost', () => {
  const product: ProductRow = { id: 'p1', packageCost: 50, packageQty: 250, avgCost: 0, stock: 0 };
  const utensilio: EquipmentRow = { id: 'e1', kind: 'utensilio', qty: 1, cost: 300, usefulUses: 200, kwh: 0, perdaBaixa: 0 };
  const maquina: EquipmentRow = { id: 'e2', kind: 'maquina', qty: 1, cost: 1200, usefulUses: 500, kwh: 0.5, perdaBaixa: 0 };

  it('prices a product by qty * (cost/packageQty)', () => {
    const cost = computeServiceCost([{ kind: 'product', refId: 'p1', qty: 20 }], [product], [], settings);
    expect(cost).toBeCloseTo((50 / 250) * 20, 6); // R$4,00
  });

  it('uses avgCost over packageCost when set (weighted-average cost)', () => {
    const p = { ...product, avgCost: 60 };
    const cost = computeServiceCost([{ kind: 'product', refId: 'p1', qty: 10 }], [p], [], settings);
    expect(cost).toBeCloseTo((60 / 250) * 10, 6);
  });

  it('prices a utensilio purely by depreciation-per-use × usos, no energy', () => {
    const cost = computeServiceCost([{ kind: 'equipment', refId: 'e1', qty: 2 }], [], [utensilio], settings);
    const porUso = 300 / 200;
    expect(cost).toBeCloseTo(porUso * 2, 6);
  });

  it('prices a maquina by depreciation-per-use + energy for the minutes used', () => {
    const cost = computeServiceCost([{ kind: 'equipment', refId: 'e2', qty: 30 }], [], [maquina], settings);
    const porUso = 1200 / 500;
    const energy = 0.5 * (30 / 60) * settings.energyPricePerKwh;
    expect(cost).toBeCloseTo(porUso + energy, 6);
  });

  it('ignores items referencing an unknown product/equipment id instead of throwing', () => {
    const cost = computeServiceCost([{ kind: 'product', refId: 'missing', qty: 5 }], [product], [], settings);
    expect(cost).toBe(0);
  });
});

describe('feePctFor', () => {
  it('maps payment method to its configured percentage', () => {
    expect(feePctFor('credito', settings)).toBe(4);
    expect(feePctFor('debito', settings)).toBe(2);
    expect(feePctFor('pix', settings)).toBe(1);
    expect(feePctFor('dinheiro', settings)).toBe(0);
    expect(feePctFor(null, settings)).toBe(0);
  });

  it('uses the per-installment credit table, falling back to the base rate', () => {
    const s = { ...settings, taxaCreditoParcelas: '{"2":6.09,"3":6.85}' };
    expect(feePctFor('credito', s, 2)).toBe(6.09);
    expect(feePctFor('credito', s, 3)).toBe(6.85);
    expect(feePctFor('credito', s, 1)).toBe(4); // à vista / juros por conta do cliente
    expect(feePctFor('credito', s, 12)).toBe(4); // count not configured → base rate
    expect(feePctFor('credito', { ...settings, taxaCreditoParcelas: 'not json' }, 2)).toBe(4);
    expect(feePctFor('debito', s, 3)).toBe(2); // installments only mean something on credit
  });
});

describe('salaFeeAmount', () => {
  it('is zero when no rented room is configured (default off)', () => {
    expect(salaFeeAmount(200, settings)).toBe(0);
    expect(salaFeeAmount(200, { ...settings, salaMode: 'off', salaFixo: 50, salaPct: 10 })).toBe(0);
  });
  it('charges the flat value per atendimento in fixo mode', () => {
    expect(salaFeeAmount(200, { ...settings, salaMode: 'fixo', salaFixo: 35 })).toBe(35);
    expect(salaFeeAmount(80, { ...settings, salaMode: 'fixo', salaFixo: 35 })).toBe(35);
  });
  it('charges a percentage of the amount in pct mode', () => {
    expect(salaFeeAmount(200, { ...settings, salaMode: 'pct', salaPct: 15 })).toBe(30);
    expect(salaFeeAmount(0, { ...settings, salaMode: 'pct', salaPct: 15 })).toBe(0);
  });
});

describe('equipment usage + depreciation', () => {
  it('counts one "uso" per transaction line-item regardless of qty/minutes', () => {
    const usos = equipmentUsageCounts([
      { kind: 'equipment', equipmentId: 'e1' },
      { kind: 'equipment', equipmentId: 'e1' },
      { kind: 'product', equipmentId: null },
      { kind: 'equipment', equipmentId: 'e2' },
    ]);
    expect(usos).toEqual({ e1: 2, e2: 1 });
  });

  it('caps depreciation at the gross asset value (never over-depreciates)', () => {
    const eq: EquipmentRow = { id: 'e1', kind: 'utensilio', qty: 1, cost: 300, usefulUses: 200, kwh: 0, perdaBaixa: 0 };
    expect(equipmentDepreciation(eq, 100)).toBeCloseTo(150, 6); // half used
    expect(equipmentDepreciation(eq, 10_000)).toBe(300); // way past useful life — capped
  });
});

describe('isOpExpense / isRevenueTx', () => {
  it('excludes sócio, estoque, ativo and investment-category despesas from the operating result', () => {
    expect(isOpExpense(tx({ type: 'despesa', amount: 10, date: '2026-01-01', categoryId: 'cat' }), categories)).toBe(true);
    expect(isOpExpense(tx({ type: 'despesa', amount: 10, date: '2026-01-01', categoryId: 'cat', capital: 'pagamento' }), categories)).toBe(false);
    expect(isOpExpense(tx({ type: 'despesa', amount: 10, date: '2026-01-01', categoryId: 'cat', estoque: true }), categories)).toBe(false);
    expect(isOpExpense(tx({ type: 'despesa', amount: 10, date: '2026-01-01', categoryId: 'cat', ativo: true }), categories)).toBe(false);
    expect(isOpExpense(tx({ type: 'despesa', amount: 10, date: '2026-01-01', categoryId: 'invest-cat' }), categories)).toBe(false);
  });

  it('counts an accrued room fee once: at accrual, not again when the bill is paid', () => {
    expect(isOpExpense(tx({ type: 'despesa', amount: 40, date: '2026-01-01', categoryId: 'cat', accrualOnly: true }), categories)).toBe(true);
    expect(isOpExpense(tx({ type: 'despesa', amount: 40, date: '2026-01-01', categoryId: 'cat', cashOnly: true }), categories)).toBe(false);
  });

  it('excludes cashOnly (package sale/installment) and sócio receitas from revenue, includes accrualOnly', () => {
    expect(isRevenueTx(tx({ type: 'receita', amount: 500, date: '2026-01-01', cashOnly: true }))).toBe(false);
    expect(isRevenueTx(tx({ type: 'receita', amount: 500, date: '2026-01-01', capital: 'aporte' }))).toBe(false);
    expect(isRevenueTx(tx({ type: 'receita', amount: 100, date: '2026-01-01', accrualOnly: true }))).toBe(true);
    expect(isRevenueTx(tx({ type: 'receita', amount: 100, date: '2026-01-01' }))).toBe(true);
  });
});

describe('cashDelta', () => {
  it('is the full signed amount for normal and cashOnly transactions', () => {
    expect(cashDelta(tx({ type: 'receita', amount: 100, date: '2026-01-01' }))).toBe(100);
    expect(cashDelta(tx({ type: 'receita', amount: 500, date: '2026-01-01', cashOnly: true }))).toBe(500);
    expect(cashDelta(tx({ type: 'despesa', amount: 40, date: '2026-01-01' }))).toBe(-40);
  });

  it('is zero for accrualOnly on both sides — session revenue and accrued room fees move no cash', () => {
    expect(cashDelta(tx({ type: 'receita', amount: 100, date: '2026-01-01', accrualOnly: true }))).toBe(0);
    expect(cashDelta(tx({ type: 'despesa', amount: 40, date: '2026-01-01', accrualOnly: true }))).toBe(0);
    expect(cashDelta(tx({ type: 'despesa', amount: 40, date: '2026-01-01', cashOnly: true }))).toBe(-40);
  });
});

describe('packageSessionAmount', () => {
  it('splits evenly when it divides cleanly', () => {
    const pkg = { amount: 500, sessions: 5 };
    for (let i = 1; i <= 5; i++) expect(packageSessionAmount(pkg, i)).toBe(100);
  });

  it('gives the last session the remainder so the total always matches exactly (cent-safe)', () => {
    const pkg = { amount: 100, sessions: 3 }; // 33.33... per session
    const amounts = [1, 2, 3].map((i) => packageSessionAmount(pkg, i));
    expect(amounts[0]).toBeCloseTo(33.33, 2);
    expect(amounts[1]).toBeCloseTo(33.33, 2);
    const total = amounts.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 6);
  });
});

// ---------- dreNumbers ----------

describe('dreNumbers', () => {
  it('computes margem and resultado from services + product sales, net of costs', () => {
    const t = [
      tx({ type: 'receita', amount: 150, date: '2026-07-10', serviceId: 'svc', variableCost: 4 }),
      tx({ type: 'despesa', amount: 30, date: '2026-07-10', categoryId: 'cat' }),
    ];
    const dre = dreNumbers('2026-07', t, categories);
    expect(dre.serv).toBe(150);
    expect(dre.custoVar).toBe(4);
    expect(dre.margem).toBe(146);
    expect(dre.desp).toBe(30);
    expect(dre.resultado).toBe(116);
    expect(dre.atendCount).toBe(1);
  });

  it('nets out product sales revenue/CMV separately from service revenue', () => {
    const t = [
      tx({
        type: 'receita',
        amount: 180,
        date: '2026-07-10',
        sales: [{ productId: 'p1', qty: 2, unitPrice: 40, unitCost: 15 }],
      }),
    ];
    const dre = dreNumbers('2026-07', t, categories);
    expect(dre.vendas).toBe(80);
    expect(dre.cmv).toBe(30);
    expect(dre.serv).toBe(100); // 180 total - 80 vendas
  });

  it('excludes a cashOnly package sale from revenue entirely', () => {
    const t = [tx({ type: 'receita', amount: 500, date: '2026-07-10', cashOnly: true })];
    const dre = dreNumbers('2026-07', t, categories);
    expect(dre.receita).toBe(0);
    expect(dre.resultado).toBe(0);
  });

  it('recognizes an accrualOnly session-use at its real amount, matched against its cost', () => {
    const t = [tx({ type: 'receita', amount: 100, date: '2026-07-10', serviceId: 'svc', variableCost: 30, accrualOnly: true })];
    const dre = dreNumbers('2026-07', t, categories);
    expect(dre.receita).toBe(100);
    expect(dre.custoVar).toBe(30);
    expect(dre.resultado).toBe(70);
    expect(dre.atendCount).toBe(1);
  });

  it('separates pró-labore withdrawals from other operating expenses but still nets into resultado', () => {
    const t = [
      tx({ type: 'receita', amount: 1000, date: '2026-07-10' }),
      tx({ type: 'despesa', amount: 100, date: '2026-07-10', categoryId: 'cat' }),
      tx({ type: 'despesa', amount: 200, date: '2026-07-10', categoryId: 'cat', prolabore: true }),
    ];
    const dre = dreNumbers('2026-07', t, categories);
    expect(dre.desp).toBe(100);
    expect(dre.prolabore).toBe(200);
    expect(dre.resultado).toBe(700);
  });
});

// ---------- prolaboreSuggestion ----------

describe('prolaboreSuggestion', () => {
  it('bases the suggestion on service revenue minus variable cost minus opex, times the configured %', () => {
    const t = [
      tx({ type: 'receita', amount: 1000, date: '2026-07-10', variableCost: 100 }),
      tx({ type: 'despesa', amount: 300, date: '2026-07-10', categoryId: 'cat' }),
    ];
    const sug = prolaboreSuggestion(t, categories, settings);
    expect(sug.base).toBe(600); // 1000 - 100 - 300
    expect(sug.amount).toBeCloseTo(180, 6); // 30%
  });

  it('does not let a package sale (cashOnly) inflate the pró-labore base', () => {
    const t = [tx({ type: 'receita', amount: 5000, date: '2026-07-10', cashOnly: true })];
    const sug = prolaboreSuggestion(t, categories, settings);
    expect(sug.base).toBe(0);
  });

  it('uses a fixed amount in fixo mode and ignores the percentage', () => {
    const fixedSettings = { ...settings, prolaboreMode: 'fixo', prolaboreFixo: 500 };
    const sug = prolaboreSuggestion([], categories, fixedSettings);
    expect(sug.amount).toBe(500);
  });

  it('reports already-withdrawn pró-labore without it feeding back into the base', () => {
    const t = [
      tx({ type: 'receita', amount: 1000, date: '2026-07-10' }),
      tx({ type: 'despesa', amount: 150, date: '2026-07-10', categoryId: 'cat', prolabore: true }),
    ];
    const sug = prolaboreSuggestion(t, categories, settings);
    expect(sug.retirado).toBe(150);
    expect(sug.base).toBe(1000); // prolabore itself excluded from opex deduction
  });
});

// ---------- computeReceitaDiferida ----------

describe('computeReceitaDiferida', () => {
  const packages: PackageRow[] = [{ id: 'pkg1', amount: 500 }];

  it('is the full package amount when no sessions have been recognized yet', () => {
    expect(computeReceitaDiferida([], packages)).toBe(500);
  });

  it('shrinks by exactly what has been recognized via accrualOnly session-use transactions', () => {
    const t = [tx({ type: 'receita', amount: 100, date: '2026-07-10', accrualOnly: true, packageId: 'pkg1' })];
    expect(computeReceitaDiferida(t, packages)).toBe(400);
  });

  it('reaches zero once all sessions are recognized (never goes negative)', () => {
    const t = Array.from({ length: 5 }, (_, i) => tx({ type: 'receita', amount: 100, date: '2026-07-10', accrualOnly: true, packageId: 'pkg1' }));
    expect(computeReceitaDiferida(t, packages)).toBe(0);
  });

  it('ignores the cashOnly sale transaction itself (only accrualOnly counts as recognized)', () => {
    const t = [tx({ type: 'receita', amount: 500, date: '2026-07-10', cashOnly: true, packageId: 'pkg1' })];
    expect(computeReceitaDiferida(t, packages)).toBe(500);
  });
});

// ---------- computeBalanceSheet ----------

describe('computeBalanceSheet', () => {
  it('ajusteConciliar is zero for a healthy ledger with a prepaid package and open fiado', () => {
    // Aporte funds the caixa; a package paid ahead (1 of 5 sessions delivered)
    // and a fiado atendimento (R$80 paid now, R$120 open) are normal timing
    // gaps, not unexplained money — the plug must NOT flag them.
    const packages: PackageRow[] = [{ id: 'pkg1', amount: 500 }];
    const allTx: TxRow[] = [
      tx({ type: 'receita', amount: 1000, date: '2026-01-01', capital: 'aporte', capitalKind: 'capital', socio: 'Henrique' }),
      tx({ type: 'receita', amount: 500, date: '2026-06-15', cashOnly: true, packageId: 'pkg1' }),
      tx({ type: 'receita', amount: 100, date: '2026-07-10', accrualOnly: true, packageId: 'pkg1' }),
      tx({ type: 'receita', amount: 200, date: '2026-07-12', accrualOnly: true }), // fiado atendimento (recognized)
      tx({ type: 'receita', amount: 80, date: '2026-07-12', cashOnly: true, feeOf: 'fiado-main' }), // parte paga na hora
      tx({ type: 'despesa', amount: 50, date: '2026-07-01', categoryId: 'cat' }),
    ];
    const balance = computeBalanceSheet({ allTx, products: [], equipment: [], categories, packages, aReceberAberto: 120, aPagarAberto: 0, fiadoAberto: 120 });
    expect(balance.ajusteConciliar).toBeCloseTo(0, 6);
    expect(balance.plLiquido).toBeCloseTo(balance.ativoTotal - balance.passivoTotal, 6);
  });

  it('ajusteConciliar still catches genuinely unexplained cash', () => {
    // Same ledger but R$300 of cash appears without any story behind it.
    const allTx: TxRow[] = [
      tx({ type: 'receita', amount: 1000, date: '2026-01-01', capital: 'aporte', capitalKind: 'capital', socio: 'Henrique' }),
      tx({ type: 'receita', amount: 300, date: '2026-07-01', cashOnly: true }), // cash-only, no package: nothing explains it
    ];
    const balance = computeBalanceSheet({ allTx, products: [], equipment: [], categories, packages: [], aReceberAberto: 0, aPagarAberto: 0, fiadoAberto: 0 });
    expect(balance.ajusteConciliar).toBeCloseTo(300, 6);
  });

  it('excludes accrualOnly recognition from caixa (no double-counting cash already received at sale time)', () => {
    const packages: PackageRow[] = [{ id: 'pkg1', amount: 500 }];
    const allTx: TxRow[] = [
      tx({ type: 'receita', amount: 500, date: '2026-06-15', cashOnly: true, packageId: 'pkg1' }),
      tx({ type: 'receita', amount: 100, date: '2026-07-10', accrualOnly: true, packageId: 'pkg1' }),
    ];
    const balance = computeBalanceSheet({ allTx, products: [], equipment: [], categories, packages, aReceberAberto: 0, aPagarAberto: 0 });
    expect(balance.caixa).toBe(500); // not 600
  });

  it('nets partner loans (emprestimo) into passivo, keeping capital-classified aportes in PL', () => {
    const allTx: TxRow[] = [
      tx({ type: 'receita', amount: 1000, date: '2026-01-01', capital: 'aporte', capitalKind: 'capital', socio: 'A' }),
      tx({ type: 'receita', amount: 2000, date: '2026-01-01', capital: 'aporte', capitalKind: 'emprestimo', socio: 'B' }),
    ];
    const balance = computeBalanceSheet({ allTx, products: [], equipment: [], categories, packages: [], aReceberAberto: 0, aPagarAberto: 0 });
    expect(balance.capitalSocios).toBe(1000);
    expect(balance.emprestimoSocios).toBe(2000);
    expect(balance.passivoTotal).toBe(2000);
  });
});

// ---------- computeClientStats ----------

describe('computeClientStats', () => {
  it('counts cash actually paid, not double-counting a package sale plus its later session recognitions', () => {
    const allTx: TxRow[] = [
      tx({ type: 'receita', amount: 500, date: '2026-06-15', clientId: 'c1', cashOnly: true, packageId: 'pkg1' }),
      tx({ type: 'receita', amount: 100, date: '2026-07-01', clientId: 'c1', accrualOnly: true, packageId: 'pkg1' }),
      tx({ type: 'receita', amount: 100, date: '2026-07-08', clientId: 'c1', accrualOnly: true, packageId: 'pkg1' }),
    ];
    const stats = computeClientStats('c1', allTx);
    expect(stats.gasto).toBe(500); // only the cash-in counts, not the two recognitions
    expect(stats.visitas).toBe(3); // still tracks all 3 receita events for cadence purposes
  });
});
