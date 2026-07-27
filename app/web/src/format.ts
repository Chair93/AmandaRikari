export function fmtBRL(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.split('-').reverse().join('/');
}

export function fmtDateLong(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', opts);
}

export function numOr0(v: string | number | null | undefined): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Parses a Brazilian-formatted decimal input (comma separator) into a number, or undefined if blank. */
export function parseDecimalInput(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  return numOr0(v);
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

export function monthLongLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
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

/** Formats a signed BRL amount, e.g. "+ R$ 10,00" / "- R$ 10,00". */
export function fmtSignedBRL(n: number, type: 'receita' | 'despesa'): string {
  return (type === 'despesa' ? '- ' : '+ ') + fmtBRL(n);
}

/** Masks a value behind bullets when the privacy toggle is on. */
export function maskable(label: string, visible: boolean): string {
  return visible ? label : '••••';
}
