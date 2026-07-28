/** Brazilian-currency amounts in words, as receipts traditionally carry:
 *  "R$ 1.250,00 (mil duzentos e cinquenta reais)". Covers up to the hundreds
 *  of millions, which is a few orders of magnitude past any clinic receipt. */

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 1–999 in words. */
function trio(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const d = Math.floor(resto / 10);
  const u = resto % 10;

  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto <= 19) partes.push(DEZ_A_DEZENOVE[resto - 10]);
  else {
    if (d > 0) partes.push(DEZENAS[d]);
    if (u > 0) partes.push(UNIDADES[u]);
  }
  return partes.join(' e ');
}

/** Whole number in words (0 returns ''). */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return '';
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const blocos: string[] = [];
  if (milhoes > 0) blocos.push(milhoes === 1 ? 'um milhão' : `${trio(milhoes)} milhões`);
  if (milhares > 0) blocos.push(milhares === 1 ? 'mil' : `${trio(milhares)} mil`);
  if (resto > 0) blocos.push(trio(resto));

  // "e" joins the last block when it is small (mil e dez) or a round hundred
  // (mil e quinhentos); larger remainders read without it (mil duzentos e
  // trinta). Traditional receipt grammar, not an invention.
  if (blocos.length === 1) return blocos[0];
  const ultimo = blocos[blocos.length - 1];
  const cabeça = blocos.slice(0, -1).join(' ');
  // The value the final block spells out: the sub-thousand remainder, or the
  // thousands count when the number ends in round thousands (1.500.000 ->
  // "um milhão E quinhentos mil").
  const valorUltimo = resto > 0 ? resto : milhares;
  const liga = valorUltimo < 100 || valorUltimo % 100 === 0;
  return liga ? `${cabeça} e ${ultimo}` : `${cabeça} ${ultimo}`;
}

export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round(valor * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;

  const partes: string[] = [];
  if (reais > 0) {
    const extenso = inteiroPorExtenso(reais);
    // "um milhão DE reais" when the amount is exact millions.
    const deReais = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${extenso}${deReais} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  if (partes.length === 0) return 'zero reais';
  return partes.join(' e ');
}
