import type { Prisma } from '@prisma/client';
import { round2, lastDayOfMonth } from './util.js';

/** Adds (or removes) an atendimento's room fee to the month's accumulated
 *  conta a pagar owed to the room owner. One bill per month: atendimentos
 *  grow it, editing/deleting them shrinks it, and settling it in Contas is
 *  what actually pays the owner and moves cash. A month whose bill was
 *  already settled is left alone — the money is gone; late edits to that
 *  month are the owner's and Amanda's to sort out, not ours to guess. */
export async function adjustSalaBill(
  tx: Prisma.TransactionClient,
  businessId: string,
  date: string,
  delta: number,
  salaOwner: string
): Promise<void> {
  if (!delta) return;
  const month = date.slice(0, 7);
  const open = await tx.bill.findFirst({ where: { businessId, sala: true, recMonth: month, settled: false } });
  if (open) {
    const next = round2(open.amount + delta);
    if (next <= 0.005) await tx.bill.delete({ where: { id: open.id } });
    else await tx.bill.update({ where: { id: open.id }, data: { amount: next } });
    return;
  }
  if (delta <= 0) return;
  let cat = await tx.category.findFirst({ where: { businessId, type: 'despesa', name: 'Uso de sala' } });
  if (!cat) cat = await tx.category.create({ data: { businessId, name: 'Uso de sala', type: 'despesa' } });
  const [y, m] = month.split('-');
  await tx.bill.create({
    data: {
      businessId,
      kind: 'pagar',
      sala: true,
      recMonth: month,
      desc: `Uso de sala — ${salaOwner.trim() || 'dona do espaço'} — ${m}/${y}`,
      amount: round2(delta),
      due: lastDayOfMonth(month),
      categoryId: cat.id,
    },
  });
}
