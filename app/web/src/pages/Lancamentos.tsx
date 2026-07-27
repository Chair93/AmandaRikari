import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useDeleteTransaction, useTransactions } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, moneyColor } from '../format';
import TransactionModal from '../components/TransactionModal';

type Filter = 'all' | 'receita' | 'despesa';

export default function Lancamentos() {
  const { isOwner } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: transactions = [] } = useTransactions({ type: filter });
  const deleteTx = useDeleteTransaction();
  const [txModal, setTxModal] = useState<{ open: boolean; id?: string }>({ open: false });

  const groups: { date: string; items: typeof transactions }[] = [];
  const seen = new Map<string, number>();
  [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((t) => {
      if (!seen.has(t.date)) {
        seen.set(t.date, groups.length);
        groups.push({ date: t.date, items: [] });
      }
      groups[seen.get(t.date)!].items.push(t);
    });

  function onDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('Excluir este lançamento?')) return;
    deleteTx.mutate(id);
  }

  return (
    <>
      <PageHeader title="Lançamentos" subtitle="Todos os seus atendimentos e gastos" />
      <div className="scroll-area">
        <div className="page narrow">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={'pill' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
              Todos
            </button>
            <button className={'pill' + (filter === 'receita' ? ' income' : '')} onClick={() => setFilter('receita')}>
              Receitas
            </button>
            <button className={'pill' + (filter === 'despesa' ? ' expense' : '')} onClick={() => setFilter('despesa')}>
              Despesas
            </button>
          </div>

          {groups.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {groups.map((g) => (
                <div key={g.date}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: 8 }}>
                    {new Date(g.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </div>
                  <div className="list">
                    {g.items.map((tx) => {
                      const clientName = tx.capital ? tx.socio : tx.client?.name;
                      const categoryName = tx.service?.name || tx.category?.name || 'Categoria removida';
                      const hasMargem = tx.type === 'receita' && tx.variableCost != null;
                      const margem = hasMargem ? tx.amount - (tx.variableCost || 0) : 0;
                      return (
                        <div key={tx.id} className="list-row clickable" onClick={() => setTxModal({ open: true, id: tx.id })}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{categoryName}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{clientName || '—'}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: moneyColor(tx.type === 'despesa' ? -1 : 1) }}>
                                {(tx.type === 'despesa' ? '- ' : '+ ') + fmtBRL(tx.amount)}
                              </div>
                              {hasMargem && <div style={{ fontSize: 11, color: moneyColor(margem) }}>margem {fmtBRL(margem)}</div>}
                            </div>
                            {isOwner && (
                              <button className="icon-btn" onClick={(e) => onDelete(tx.id, e)}>
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Nenhum lançamento neste período.</div>
          )}
        </div>
        {isOwner && (
          <button className="fab" onClick={() => setTxModal({ open: true })}>
            +
          </button>
        )}
      </div>
      {txModal.open && <TransactionModal onClose={() => setTxModal({ open: false })} editingTxId={txModal.id} />}
    </>
  );
}
