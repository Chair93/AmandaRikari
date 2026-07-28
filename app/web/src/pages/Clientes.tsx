import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useClientesReport, useDeleteClient } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { CATEGORY_COLORS, fmtBRL, fmtDateBR, monthShortLabel } from '../format';
import ClientModal from '../components/ClientModal';
import ClientDetailModal from '../components/ClientDetailModal';
import QueryState from '../components/QueryState';
import type { ClienteRow } from '../api/types';

function statusFor(row: ClienteRow) {
  if (row.visitas === 0) return { label: 'Sem atendimento', bg: 'var(--surface-2)', color: 'var(--idle-color)' };
  const d = row.diasDesde || 0;
  if (d > 60) return { label: `Sumiu há ${d} dias`, bg: 'var(--expense-soft)', color: 'var(--expense-text)' };
  if (d > 45) return { label: 'Hora de chamar', bg: 'var(--warning-soft)', color: 'var(--warning-text)' };
  return { label: `Em dia · ${d} dias`, bg: 'var(--income-soft)', color: 'var(--income-text)' };
}

export default function Clientes() {
  const { data, isLoading, error, refetch } = useClientesReport();
  const { isOwner } = useAuth();
  const del = useDeleteClient();
  const [clientModal, setClientModal] = useState<{ open: boolean; editing?: ClienteRow } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  function onDelete(row: ClienteRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('Remover este cliente? Os lançamentos ficarão sem cliente vinculado.')) return;
    del.mutate(row.id);
  }

  if (isLoading || error || !data) {
    return (
      <>
        <PageHeader title="Clientes" subtitle="Clientes cadastrados e seus totais" />
        <div className="scroll-area">
          <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
            <div />
          </QueryState>
        </div>
      </>
    );
  }

  const maxGasto = Math.max(1, ...data.topClientes.map((c) => c.gasto));
  const maxNovos = Math.max(1, ...data.novosPorMes.map((m) => m.count));

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Clientes cadastrados e seus totais"
        right={
          isOwner ? (
            <button className="btn-primary header-action" onClick={() => setClientModal({ open: true })}>
              + Cliente
            </button>
          ) : undefined
        }
      />
      <div className="scroll-area">
        <div className="page wide">
          {data.inativosList.length > 0 && (
            <div className="card">
              <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
                Vale chamar de volta
              </div>
              <div className="section-hint" style={{ marginBottom: 14 }}>
                Quem não aparece há mais de 45 dias. Um recado costuma trazer de volta.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--surface-2)', borderRadius: 14, overflow: 'hidden' }}>
                {data.inativosList.map((c) => {
                  const hasZap = !!(c.phone && c.phone.replace(/\D/g, '').length >= 10);
                  const zapHref = `https://wa.me/55${(c.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Oi, ${c.name.split(' ')[0]}! Passando pra saber se você quer agendar sua próxima limpeza de pele 💗`)}`;
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface)' }}>
                      <button style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => setDetailId(c.id)}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.diasDesde} dias sem vir</div>
                      </button>
                      {hasZap && (
                        <a href={zapHref} target="_blank" rel="noopener noreferrer" className="pill sm income" style={{ textDecoration: 'none' }}>
                          Chamar no WhatsApp
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.clientsList.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <StatCard label="Ticket médio" value={fmtBRL(data.ticketMedio)} />
                <StatCard label="Retornaram (2+ visitas)" value={`${Math.round(data.recorrentesPct)}%`} sub={`${data.recorrentes} de ${data.comVisita} clientes`} />
                <StatCard label="Valor por cliente (médio)" value={fmtBRL(data.ltvMedio)} />
                <StatCard label="Intervalo médio de retorno" value={data.intervaloMedio != null ? `${Math.round(data.intervaloMedio)} dias` : '—'} />
              </div>

              {data.reativarList.length > 0 && (
                <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', borderRadius: 16, padding: '16px 20px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-dark)' }}>Hora de chamar de volta</div>
                  <div style={{ fontSize: 11.5, color: 'var(--accent-dark)', margin: '2px 0 10px' }}>Clientes sem atendimento há mais de 45 dias.</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {data.reativarList.map((r, i) => (
                      <span key={i} style={{ fontSize: 12, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent-dark)', padding: '7px 13px', borderRadius: 999 }}>
                        {r.name}
                        {r.phone ? ` · ${r.phone}` : ''} — {r.diasDesde} dias
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="section-title">Top clientes por receita</div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.topClientes.map((c, i) => (
                    <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {fmtBRL(c.gasto)} · {c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}
                        </span>
                      </div>
                      <div className="progress-track" style={{ height: 8 }}>
                        <div className="progress-fill" style={{ width: `${Math.max(4, Math.round((c.gasto / maxGasto) * 100))}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-title">Novos clientes por mês</div>
                <div className="card" style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
                  {data.novosPorMes.map((m) => (
                    <div key={m.monthKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{m.count}</span>
                      <div
                        className="chart-bar"
                        style={{ width: '100%', borderRadius: '8px 8px 0 0', background: m.count > 0 ? 'var(--accent)' : 'var(--surface-2)', height: `${Math.max(3, Math.round((m.count / maxNovos) * 78))}%` }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{monthShortLabel(m.monthKey)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-title">Todos os clientes</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 14 }}>
                  {data.clientsList.map((c) => {
                    const status = statusFor(c);
                    return (
                      <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          {/* padding, not just text height — as a bare line of
                              text this was a 21px tap target on a phone. */}
                          <button
                            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'Newsreader, serif', fontSize: 17, fontWeight: 600, padding: '6px 0', minHeight: 32, flex: 1, minWidth: 0, lineHeight: 1.2, textWrap: 'balance' }}
                            onClick={() => setDetailId(c.id)}
                          >
                            {c.name}
                          </button>
                          {isOwner && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <button className="pill ghost sm" onClick={() => setClientModal({ open: true, editing: c })}>
                                Editar
                              </button>
                              <button className="icon-btn" aria-label="Excluir cliente" onClick={(e) => onDelete(c, e)}>
                                ×
                              </button>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <span className="badge" style={{ background: status.bg, color: status.color }}>
                            {status.label}
                          </span>
                          <span className="badge">
                            {c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}
                          </span>
                        </div>
                        {c.phone && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📞 {c.phone}</span>}
                        {c.birthday && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aniversário: {fmtDateBR(c.birthday)}</span>
                        )}
                        {c.notes && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{c.notes}</span>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Já gastou</span>
                          <span style={{ fontWeight: 600 }}>{fmtBRL(c.gasto)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                          <span style={{ color: 'var(--text-muted)' }}>Ticket médio</span>
                          <span style={{ fontWeight: 600 }}>{fmtBRL(c.ticketMedio)}</span>
                        </div>
                        {c.aberto > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                            <span style={{ color: 'var(--expense-text)' }}>Está devendo</span>
                            <span style={{ fontWeight: 700, color: 'var(--expense-text)' }}>{fmtBRL(c.aberto)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {data.clientsList.length === 0 && (
            <div className="empty-state">
              <span>Nenhum cliente cadastrado ainda.</span>
              {isOwner && (
                <button className="btn-primary" onClick={() => setClientModal({ open: true })}>
                  + Novo cliente
                </button>
              )}
            </div>
          )}
        </div>
        {isOwner && (
          <button className="fab" aria-label="Novo cliente" onClick={() => setClientModal({ open: true })}>
            +
          </button>
        )}
      </div>
      {clientModal?.open && (
        <ClientModal
          onClose={() => setClientModal(null)}
          editingClient={clientModal.editing ? { id: clientModal.editing.id, name: clientModal.editing.name, phone: clientModal.editing.phone, birthday: clientModal.editing.birthday, notes: clientModal.editing.notes } : null}
        />
      )}
      {detailId && <ClientDetailModal clientId={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 170 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}
