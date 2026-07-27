export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthKeyOf(dateStr: string | null | undefined): string {
  return (dateStr || '').slice(0, 7);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parses a Brazilian-formatted number, or null when the input isn't a clean
 *  number. Mirrors web/src/format.ts parseNumberBR — kept in sync so a value
 *  means the same thing on both sides of the wire. See that file for why the
 *  naive `.replace(',', '.')` was wrong ("1.500,00" read as 1.5). */
export function parseNumberBR(v: unknown): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const raw = String(v ?? '').trim();
  if (raw === '') return null;
  const cleaned = raw.replace(/R\$/gi, '').replace(/[\s  ]/g, '');
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    const after = cleaned.length - lastComma - 1;
    const grouped = /^-?\d{1,3}(,\d{3})+$/.test(cleaned);
    normalized = grouped || (after === 3 && cleaned.indexOf(',') !== lastComma) ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else if (lastDot > -1) {
    const after = cleaned.length - lastDot - 1;
    const grouped = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned);
    normalized = grouped ? cleaned.replace(/\./g, '') : after === 3 ? cleaned.replace(/\./g, '') : cleaned;
  } else {
    normalized = cleaned;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function numOr0(v: unknown): number {
  return parseNumberBR(v) ?? 0;
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
