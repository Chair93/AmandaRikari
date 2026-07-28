import { describe, it, expect } from 'vitest';
import { backupFingerprint } from './emailBackup.js';

const base = () => ({
  categories: [{ id: 'c1', name: 'Serviços' }],
  clients: [{ id: 'a', name: 'Mariana', phone: '11 9999' }],
  transactions: [{ id: 't1', amount: 250 }],
  exportedAt: '2026-07-28T22:00:00.000Z',
});

describe('backupFingerprint', () => {
  it('é estável para o mesmo conteúdo', () => {
    expect(backupFingerprint(base())).toBe(backupFingerprint(base()));
  });

  it('ignora o exportedAt — senão todo dia contaria como mudança', () => {
    const b = base();
    b.exportedAt = '2027-01-01T00:00:00.000Z';
    expect(backupFingerprint(b)).toBe(backupFingerprint(base()));
  });

  it('muda quando um valor muda', () => {
    const b = base();
    b.transactions[0].amount = 251;
    expect(backupFingerprint(b)).not.toBe(backupFingerprint(base()));
  });

  it('muda quando uma linha entra', () => {
    const b = base();
    b.clients.push({ id: 'b', name: 'Beatriz', phone: null as unknown as string });
    expect(backupFingerprint(b)).not.toBe(backupFingerprint(base()));
  });

  it('muda quando uma linha sai', () => {
    const b = base();
    b.transactions = [];
    expect(backupFingerprint(b)).not.toBe(backupFingerprint(base()));
  });
});
