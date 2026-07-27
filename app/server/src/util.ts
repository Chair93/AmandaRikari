export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthKeyOf(dateStr: string | null | undefined): string {
  return (dateStr || '').slice(0, 7);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function numOr0(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function uid(): string {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function addMonthsToDate(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const DAY = 86400000;
  return Math.round((new Date(toIso + 'T00:00:00').getTime() - new Date(fromIso + 'T00:00:00').getTime()) / DAY);
}
