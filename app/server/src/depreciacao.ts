import { prisma } from './db.js';
import { todayStr, round2 } from './util.js';

function nextYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Time-based depreciation for general assets (mirror, furniture...): once
 *  an equipment with depMode 'tempo' is activated, every elapsed month books
 *  one accrual-only 'Depreciação' expense of cost×qty ÷ vidaMeses — profit
 *  drops in the DRE and the asset's residual value drops on the balance
 *  sheet, cash untouched. Idempotent: months already booked (by the entry's
 *  date) are skipped, the last month absorbs rounding leftovers, and the
 *  total never exceeds the asset's value. */
export async function ensureDepreciationGenerated(businessId: string) {
  const eqs = await prisma.equipment.findMany({
    where: { businessId, depMode: 'tempo', ativadoEm: { not: null }, baixadoEm: null },
  });
  const ativos = eqs.filter((e) => e.vidaMeses > 0 && e.cost * e.qty > 0.005);
  if (!ativos.length) return;

  let cat = await prisma.category.findFirst({ where: { businessId, type: 'despesa', name: 'Depreciação' } });
  if (!cat) cat = await prisma.category.create({ data: { businessId, name: 'Depreciação', type: 'despesa' } });

  const hoje = todayStr();
  const curYm = hoje.slice(0, 7);
  for (const eq of ativos) {
    const total = round2(eq.cost * eq.qty);
    const mensal = round2(total / eq.vidaMeses);
    const existing = await prisma.transaction.findMany({
      where: { businessId, equipmentId: eq.id, accrualOnly: true, type: 'despesa' },
      select: { date: true, amount: true },
    });
    const booked = new Set(existing.map((t) => t.date.slice(0, 7)));
    let acumulado = round2(existing.reduce((a, t) => a + t.amount, 0));

    let ym = eq.ativadoEm!.slice(0, 7);
    let guard = 0;
    while (ym <= curYm && guard++ < 600) {
      if (!booked.has(ym) && booked.size < eq.vidaMeses && acumulado < total - 0.005) {
        const ultima = booked.size === eq.vidaMeses - 1;
        const valor = ultima ? round2(total - acumulado) : Math.min(mensal, round2(total - acumulado));
        if (valor > 0.005) {
          await prisma.transaction.create({
            data: {
              businessId,
              type: 'despesa',
              amount: valor,
              categoryId: cat.id,
              // Past months post on the 28th (inside the right DRE bucket);
              // the current month posts today so it never dates the future.
              date: ym === curYm ? hoje : `${ym}-28`,
              accrualOnly: true,
              equipmentId: eq.id,
              note: `Depreciação — ${eq.name} (${ym.slice(5, 7)}/${ym.slice(0, 4)})`,
            },
          });
          booked.add(ym);
          acumulado = round2(acumulado + valor);
        }
      }
      ym = nextYm(ym);
    }
  }
}

/** Sum of monthly depreciation already booked, per equipment id. */
export async function depTempoAcumulada(businessId: string): Promise<Record<string, number>> {
  const rows = await prisma.transaction.findMany({
    where: { businessId, accrualOnly: true, type: 'despesa', equipmentId: { not: null } },
    select: { equipmentId: true, amount: true },
  });
  const map: Record<string, number> = {};
  rows.forEach((r) => (map[r.equipmentId!] = round2((map[r.equipmentId!] || 0) + r.amount)));
  return map;
}
