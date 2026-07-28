import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useDeleteTransaction, useTransactions } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, moneyColor, PAYMENT_LABEL } from '../format';
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
      <PageHeader
        title="Lançamentos"
        subtitle="Todos os seus atendimentos e gastos"
        right={
          isOwner ? (
            <button className="btn-primary header-action" onClick={() => setTxModal({ open: true })}>
              + Lançamento
            </button>
          ) : undefined
        }
      />
      <div className="scroll-area">
        <div className="page">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={'pill' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
              Todos
            </button>
            <button className={'pill' + (filter === 'receita' ? ' active income' : '')} onClick={() => setFilter('receita')}>
              Receitas
            </button>
            <button className={'pill' + (filter === 'despesa' ? ' active expense' : '')} onClick={() => setFilter('despesa')}>
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
                    <div className="tx-row tx-head" aria-hidden="true">
                      <span>Data</span>
                      <span>Descrição</span>
                      <span>Cliente / item</span>
                      <span>Pagamento</span>
                      <span className="tx-amount">Valor</span>
                      <span className="tx-margin">Margem</span>
                      <span />
                    </div>
                    {g.items.map((tx) => {
                      // Purchases and direct sales have no client — the item
                      // is the identity of the row, so name it instead of "—".
                      const itemName = tx.product?.name || tx.equipment?.name || tx.sales[0]?.product?.name;
                      const clientName = tx.capital ? tx.socio : tx.client?.name || itemName;
                      const categoryName = tx.service?.name || tx.category?.name || 'Categoria removida';
                      const hasMargem = tx.type === 'receita' && tx.variableCost != null;
                      const margem = hasMargem ? tx.amount - (tx.variableCost || 0) : 0;
                      return (
                        <div key={tx.id} className="list-row clickable tx-row" onClick={() => setTxModal({ open: true, id: tx.id })}>
                          <span className="tx-date">{new Date(tx.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                          <span className="tx-desc">{categoryName}</span>
                          <span className="tx-who">{clientName || '—'}</span>
                          <span className="tx-pay">{tx.payment ? PAYMENT_LABEL[tx.payment] || tx.payment : ''}</span>
                          <span className="tx-amount" style={{ color: moneyColor(tx.type === 'despesa' ? -1 : 1) }}>
                            {(tx.type === 'despesa' ? '- ' : '+ ') + fmtBRL(tx.amount)}
                          </span>
                          <span className="tx-margin" style={{ color: hasMargem ? moneyColor(margem) : undefined }}>
                            {hasMargem ? fmtBRL(margem) : ''}
                          </span>
                          {isOwner ? (
                            <button className="icon-btn" aria-label="Excluir lançamento" onClick={(e) => onDelete(tx.id, e)}>
                              ×
                            </button>
                          ) : (
                            <span />
                          )}
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
          <button className="fab" aria-label="Novo lançamento" onClick={() => setTxModal({ open: true })}>
            +
          </button>
        )}
      </div>
      {txModal.open && <TransactionModal onClose={() => setTxModal({ open: false })} editingTxId={txModal.id} />}
    </>
  );
}
