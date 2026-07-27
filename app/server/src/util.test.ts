import { describe, expect, it } from 'vitest';
import { parseNumberBR, numOr0 } from './util.js';

describe('parseNumberBR', () => {
  it('reads pt-BR thousands + decimals', () => {
    // The regression that made this function necessary: the old parser read
    // "1.500,00" as 1.5 and wrote that straight into the ledger.
    expect(parseNumberBR('1.500,00')).toBe(1500);
    expect(parseNumberBR('10.000,99')).toBe(10000.99);
    expect(parseNumberBR('1.234.567,89')).toBe(1234567.89);
  });

  it('reads pt-BR thousands with no decimals', () => {
    expect(parseNumberBR('2.000')).toBe(2000);
    expect(parseNumberBR('1.500')).toBe(1500);
    expect(parseNumberBR('999')).toBe(999);
  });

  it('reads comma as the decimal separator', () => {
    expect(parseNumberBR('1,5')).toBe(1.5);
    expect(parseNumberBR('1500,50')).toBe(1500.5);
    expect(parseNumberBR('0,99')).toBe(0.99);
  });

  it('still accepts plain en-US style input', () => {
    expect(parseNumberBR('1500.50')).toBe(1500.5);
    expect(parseNumberBR('1.5')).toBe(1.5);
    expect(parseNumberBR('1,234,567.89')).toBe(1234567.89);
  });

  it('tolerates currency symbols and spacing', () => {
    expect(parseNumberBR('R$ 300')).toBe(300);
    expect(parseNumberBR('R$ 1.500,00')).toBe(1500);
    expect(parseNumberBR(' 42 ')).toBe(42);
  });

  it('handles negatives and numeric input', () => {
    expect(parseNumberBR('-1.500,00')).toBe(-1500);
    expect(parseNumberBR(250.75)).toBe(250.75);
  });

  it('returns null for anything that is not a clean number', () => {
    // Rejecting instead of coercing is the point: a typo should surface as an
    // error, not become R$ 0,00 or a truncated amount.
    expect(parseNumberBR('300abc')).toBeNull();
    expect(parseNumberBR('abc')).toBeNull();
    expect(parseNumberBR('')).toBeNull();
    expect(parseNumberBR('   ')).toBeNull();
    expect(parseNumberBR(null)).toBeNull();
    expect(parseNumberBR(undefined)).toBeNull();
    expect(parseNumberBR(NaN)).toBeNull();
  });

  it('numOr0 keeps the lenient zero-default behaviour', () => {
    expect(numOr0('1.500,00')).toBe(1500);
    expect(numOr0('')).toBe(0);
    expect(numOr0('abc')).toBe(0);
  });
});
