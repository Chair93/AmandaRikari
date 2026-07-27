import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PeriodNav, { type PeriodMode } from '../components/PeriodNav';
import { useDashboardReport, useDashboardYearReport, useSacarProlabore } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { CATEGORY_COLORS, fmtBRL, maskable, monthLabelFromOffset, moneyColor } from '../format';
import TransactionModal from '../components/TransactionModal';
import QueryState from '../components/QueryState';
import PromptModal from '../components/PromptModal';

export default function Dashboard() {
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const [showMargin, setShowMargin] = useState(false);
  const [txModal, setTxModal] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [prolaboreOpen, setProlaboreOpen] = useState(false);

  const { data, isLoading, error, refetch } = useDashboardReport(monthOffset);
  const { data: yearData, isLoading: yearLoading, error: yearError, refetch: refetchYear } = useDashboardYearReport(yearOffset);
  const sacar = useSacarProlabore();
  const active = mode === 'month' ? { isLoading, error, refetch } : { isLoading: yearLoading, error: yearError, refetch: refetchYear };

  const mask = (label: string) => maskable(label, showMargin);
  const year = new Date().getFullYear() + yearOffset;

  const sugeridoProlabore = data ? Math.max(0, Math.round((data.prolabore.amount - data.prolabore.retirado) * 100) / 100) : 0;

  return (
    <>
      <PageHeader
        title="Caixa"
        subtitle="Entradas e saídas de dinheiro — o que sobra no bolso"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <PeriodNav
              mode={mode}
              onModeChange={setMode}
              monthOffset={monthOffset}
              onMonthOffsetChange={setMonthOffset}
              yearOffset={yearOffset}
              onYearOffsetChange={setYearOffset}
              monthLabel={monthLabelFromOffset(monthOffset)}
              yearLabel={String(year)}
            />
            <button className="pill" onClick={() => setShowMargin((v) => !v)}>
              {showMargin ? 'Margem visível' : 'Margem oculta'}
            </button>
          </div>
        }
      />
      <div className="scroll-area">
        {(active.isLoading || active.error) && (
          <QueryState isLoading={active.isLoading} error={active.error} onRetry={active.refetch}>
            <div />
          </QueryState>
        )}
        {mode === 'month' && data && (
          <div className="page">
            <div className="info-banner" style={{ background: 'var(--banner-green-bg)', border: '1px solid var(--banner-green-border)', color: 'var(--banner-green-text)' }}>
              <strong>Caixa</strong>&nbsp;responde: <em>sobrou dinheiro na conta este mês?</em> Conta tudo que entrou e saiu, inclusive compras e aportes.
            </div>

            <div className="hero-card">
              <span className="label">Sobrou no mês</span>
              <span className="amount">{mask(fmtBRL(data.saldo))}</span>
              <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 130, background: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, opacity: 0.9, marginBottom: 4 }}>Entrou</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{mask(fmtBRL(data.receitasTotal))}</div>
                </div>
                <div style={{ flex: 1, minWidth: 130, background: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, opacity: 0.9, marginBottom: 4 }}>Saiu</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{mask(fmtBRL(data.despesasTotal))}</div>
                </div>
                <div style={{ flex: 1, minWidth: 130, background: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, opacity: 0.9, marginBottom: 4 }}>Só da operação</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{mask(fmtBRL(data.lucroOp))}</div>
                </div>
              </div>
              {data.metaMensal > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, opacity: 0.9, marginBottom: 5 }}>
                    <span>
                      Meta do mês: {mask(fmtBRL(data.receitasOp))} de {mask(fmtBRL(data.metaMensal))}
                    </span>
                    <span style={{ fontWeight: 600 }}>{Math.round(data.metaPct)}%</span>
                  </div>
                  <div className="progress-track" style={{ background: 'rgba(255,255,255,0.25)' }}>
                    <div className="progress-fill" style={{ background: 'white', width: `${data.metaPct}%` }} />
                  </div>
                </div>
              )}
              {showMargin && (data.prolabore.amount > 0 || data.prolabore.retirado > 0) && (
                <>
                  <div style={{ display: 'flex', gap: 26, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.25)', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>Lucro dos atendimentos</div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>{mask(fmtBRL(data.prolabore.base))}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>Sugerido · {data.prolabore.mode === 'fixo' ? 'valor fixo' : data.prolabore.pct + '% do lucro'}</div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>{fmtBRL(data.prolabore.amount)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>Já retirado no mês</div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>{fmtBRL(data.prolabore.retirado)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>Fica na empresa</div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>{fmtBRL(Math.max(0, data.prolabore.base - data.prolabore.amount))}</div>
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => setProlaboreOpen(true)}
                      style={{ all: 'unset', cursor: 'pointer', marginTop: 12, alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: 'rgba(255,255,255,0.18)', color: 'white' }}
                    >
                      Retirar pró-labore — você confirma o valor
                    </button>
                  )}
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6 }}>A retirada entra como despesa no Resultado (DRE) do mês.</div>
                </>
              )}
            </div>

            {data.alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="section-title">Precisa de atenção</div>
                {data.alerts.map((a) => (
                  <button key={a.id} className={'pill' + (a.overdue ? ' expense' : '')} style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '11px 16px' }} onClick={() => navigate(a.kind === 'bill' ? '/contas' : a.kind === 'stock' ? '/estoque' : '/clientes')}>
                    {a.text}
                  </button>
                ))}
              </div>
            )}

            {showMargin && data.sociosList.length > 0 && (
              <div>
                <div className="section-title">Sócios (acumulado)</div>
                <div className="section-hint" style={{ marginBottom: 10 }}>
                  Aportes recebidos e pagamentos feitos — fora do resultado operacional.
                </div>
                <div className="list">
                  {data.sociosList.map((s) => (
                    <div className="list-row" key={s.name}>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{s.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--income-text)', width: 130, textAlign: 'right' }}>aportou {mask(fmtBRL(s.aportado))}</span>
                      <span style={{ fontSize: 12, color: 'var(--expense-text)', width: 130, textAlign: 'right' }}>recebeu {mask(fmtBRL(s.pago))}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, width: 150, textAlign: 'right' }}>a devolver {mask(fmtBRL(s.saldo))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="section-title" style={{ marginBottom: 12 }}>
                Despesas por categoria
              </div>
              {data.categoryBreakdown.length > 0 ? (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.categoryBreakdown.map((cat, i) => {
                    const pct = data.despesasTotal > 0 ? (cat.amount / data.despesasTotal) * 100 : 0;
                    return (
                      <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ fontWeight: 500 }}>{cat.name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{mask(fmtBRL(cat.amount))}</span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${Math.max(4, Math.round(pct))}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">Nenhuma despesa neste mês ainda.</div>
              )}
            </div>

            <div>
              <div className="section-title" style={{ marginBottom: 12 }}>
                Últimos lançamentos
              </div>
              {data.recentTx.length > 0 ? (
                <div className="list">
                  {data.recentTx.map((tx) => (
                    <div key={tx.id} className="list-row clickable" onClick={() => setTxModal({ open: true, editId: tx.id })}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.categoryName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {tx.clientName ? tx.clientName + ' · ' : ''}
                          {new Date(tx.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: moneyColor(tx.type === 'despesa' ? -1 : 1) }}>{mask((tx.type === 'despesa' ? '- ' : '+ ') + fmtBRL(tx.amount))}</div>
                        {showMargin && tx.hasMargem && <div style={{ fontSize: 11, color: moneyColor(tx.margem || 0) }}>margem {fmtBRL(tx.margem || 0)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
                    Comece por aqui
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="pill" onClick={() => navigate('/catalogo')}>
                      Abrir catálogo
                    </button>
                    {isOwner && (
                      <button className="btn-primary" onClick={() => setTxModal({ open: true })}>
                        + Novo lançamento
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'year' && yearData && (
          <div className="page">
            <div className="hero-card">
              <span className="label">Saldo do ano</span>
              <span className="amount">{fmtBRL(yearData.receitas - yearData.despesas)}</span>
              <div style={{ display: 'flex', gap: 26, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>Receitas</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtBRL(yearData.receitas)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>Despesas</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtBRL(yearData.despesas)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>Lucro do ano (sem aportes)</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtBRL(yearData.lucroOp)}</div>
                </div>
              </div>
            </div>
            <div className="list">
              {yearData.monthsInYear.map((m) => (
                <div
                  key={m.monthKey}
                  className="list-row clickable"
                  onClick={() => {
                    const now = new Date();
                    const diff = (yearData.year - now.getFullYear()) * 12 + (m.month - now.getMonth());
                    setMonthOffset(diff);
                    setMode('month');
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', width: 90, flex: 'none' }}>
                    {new Date(yearData.year, m.month, 1).toLocaleDateString('pt-BR', { month: 'long' })}
                  </span>
                  <div style={{ flex: 1 }} className="progress-track">
                    <div className="progress-fill" style={{ background: 'oklch(48% 0.08 150)', width: `${Math.max(2, Math.round((m.receita / Math.max(1, ...yearData.monthsInYear.map((x) => x.receita))) * 100))}%` }} />
                  </div>
                  <span style={{ fontSize: 12, width: 90, textAlign: 'right', color: 'var(--income-text)', flex: 'none' }}>{fmtBRL(m.receita)}</span>
                  <span style={{ fontSize: 12, width: 90, textAlign: 'right', color: 'var(--expense-text)', flex: 'none' }}>{fmtBRL(m.despesa)}</span>
                  <span style={{ fontSize: 12, width: 90, textAlign: 'right', fontWeight: 600, color: moneyColor(m.saldo), flex: 'none' }}>{fmtBRL(m.saldo)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isOwner && (
          <button className="fab" aria-label="Novo lançamento" onClick={() => setTxModal({ open: true })}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          </button>
        )}
      </div>

      {txModal.open && <TransactionModal onClose={() => setTxModal({ open: false })} editingTxId={txModal.editId} />}
      {prolaboreOpen && data && (
        <PromptModal
          title="Retirar pró-labore"
          description={`Lucro dos atendimentos no mês: ${fmtBRL(data.prolabore.base)} · Sugerido (${data.prolabore.mode === 'fixo' ? 'valor fixo' : data.prolabore.pct + '% do lucro'}): ${fmtBRL(data.prolabore.amount)} · Já retirado: ${fmtBRL(data.prolabore.retirado)}`}
          fields={[{ key: 'amount', label: 'Quanto retirar (R$)', defaultValue: String(sugeridoProlabore).replace('.', ','), kind: 'money' }]}
          confirmLabel="Retirar"
          onCancel={() => setProlaboreOpen(false)}
          onConfirm={async (v) => {
            await sacar.mutateAsync(v.amount as number);
            setProlaboreOpen(false);
          }}
        />
      )}
    </>
  );
}
