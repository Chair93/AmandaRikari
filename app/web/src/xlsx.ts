// Lazily loads SheetJS from the same CDN build the original Rikari prototype
// used, so spreadsheet export/import stays entirely client-side (no need to
// carry a spreadsheet-parsing dependency — with its known CVEs — on our server).
// The CDN build exposes a large, loosely-typed API — `any` is intentional here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XlsxGlobal = any;
declare global {
  interface Window {
    XLSX?: XlsxGlobal;
  }
}

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let loading: Promise<void> | null = null;

export function loadXlsx(): Promise<void> {
  if (window.XLSX) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não consegui carregar a biblioteca de planilhas. Verifique sua conexão.'));
    document.head.appendChild(script);
  });
  return loading;
}

export function pickField(row: Record<string, unknown>, names: string[]): string {
  const keys = Object.keys(row);
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[áàã]/g, 'a')
      .replace(/[éê]/g, 'e')
      .replace(/[íï]/g, 'i')
      .replace(/[óô]/g, 'o')
      .replace(/ç/g, 'c');
  for (const n of names) {
    const k = keys.find((key) => norm(key) === n);
    if (k !== undefined && row[k] !== '' && row[k] != null) return String(row[k]);
  }
  return '';
}

export function parseSheetNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[R$\s]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function parseSheetDate(v: unknown): string {
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const str = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const yy = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}
