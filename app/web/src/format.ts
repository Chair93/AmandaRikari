export function fmtBRL(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.split('-').reverse().join('/');
}

/** Parses a Brazilian-formatted number, returning null for anything that
 *  isn't a clean number so callers can show an error instead of silently
 *  booking a wrong amount.
 *
 *  Handles "1.500,00" (dot = thousands, comma = decimals) as 1500 — the
 *  naive `.replace(',', '.')` used to read that as 1.5, i.e. a 1000x
 *  understatement written straight into the ledger. Plain "1500.50" is also
 *  accepted since keyboards and pasted values often produce it. */
export function parseNumberBR(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const raw = String(v ?? '').trim();
  if (raw === '') return null;
  // Strip currency symbols and spaces (incl. non-breaking), keep digits/separators/sign.
  const cleaned = raw.replace(/R\$/gi, '').replace(/[\s  ]/g, '');
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal separator.
    normalized = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Comma only. Treat as thousands when it's grouped (1,500 / 1,234,567),
    // otherwise as the decimal separator (1,5 / 1500,50).
    const after = cleaned.length - lastComma - 1;
    const grouped = /^-?\d{1,3}(,\d{3})+$/.test(cleaned);
    normalized = grouped || (after === 3 && cleaned.indexOf(',') !== lastComma) ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else if (lastDot > -1) {
    // Dot only. "1.500" is ambiguous; pt-BR grouping wins (1500), while
    // "1.5" / "1500.50" stay decimal.
    const after = cleaned.length - lastDot - 1;
    const grouped = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned);
    normalized = grouped ? cleaned.replace(/\./g, '') : after === 3 ? cleaned.replace(/\./g, '') : cleaned;
  } else {
    normalized = cleaned;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Lenient variant for display/derived math where a blank means zero. Prefer
 *  parseNumberBR + explicit validation anywhere a value is persisted. */
export function numOr0(v: string | number | null | undefined): number {
  return parseNumberBR(v) ?? 0;
}

/** Parses a Brazilian-formatted decimal input, or undefined if blank/invalid. */
export function parseDecimalInput(v: string): number | undefined {
  return parseNumberBR(v) ?? undefined;
}

export function monthLabelFromOffset(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function monthShortLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const COLOR_INCOME = 'var(--income)';
export const COLOR_EXPENSE = 'var(--expense)';

export function moneyColor(n: number): string {
  return n < 0 ? COLOR_EXPENSE : COLOR_INCOME;
}

export const CATEGORY_COLORS = [
  'oklch(65% 0.065 32)',
  'oklch(58% 0.1 35)',
  'oklch(64% 0.08 55)',
  'oklch(56% 0.07 130)',
  'oklch(60% 0.06 90)',
  'oklch(55% 0.09 10)',
];

export const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
};

export const UNIT_LABEL: Record<string, string> = { ml: 'ml', g: 'g', unidade: 'un' };

/** Masks a value behind bullets when the privacy toggle is on. */
export function maskable(label: string, visible: boolean): string {
  return visible ? label : '••••';
}
