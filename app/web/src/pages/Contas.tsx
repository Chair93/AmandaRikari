import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useClients, useContasReport, useDeleteRecurring, useRecurring, useReopenBill, useSaveRecurring, useSettleBill } from '../api/hooks';
import { useCategories } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, fmtDateBR, numOr0 } from '../format';
import BillModal from '../components/BillModal';
import Modal from '../components/Modal';
import QueryState from '../components/QueryState';
import PromptModal from '../components/PromptModal';
import type { Bill } from '../api/types';

function daysUntil(due: string): number {
  const DAY = 86400000;
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((new Date(due + 'T00:00:00').getTime() - today) / DAY);
}

function BillRow({ bill, kind }: { bill: Bill; kind: 'pagar' | 'receber' }) {
  const { data: clients = [] } = useClients();
  const { isOwner } = useAuth();
  const settle = useSettleBill();
  const [editing, setEditing] = useState(false);
  const [settling, setSettling] = useState(false);
  const client = clients.find((c) => c.id === bill.clientId);
  const dias = daysUntil(bill.due);
  const venceLabel = dias === 0 ? 'vence hoje' : dias > 0 ? `em ${dias} dia${dias === 1 ? '' : 's'}` : `atrasada ${-dias} dia${dias === -1 ? '' : 's'}`;

  // One-tap polite payment reminder — only for receivables tied to a client
  // with a phone on file.
  const fone = kind === 'receber' ? (client?.phone || '').replace(/\D/g, '') : '';
  const cobrarLink = fone
    ? `https://api.whatsapp.com/send?phone=${fone.length <= 11 ? '55' + fone : fone}&text=${encodeURIComponent(
        `Oiii ${client!.name.split(' ')[0]}, tudo bem? 💗 Passando só pra lembrar do pagamento de ${bill.desc} (${fmtBRL(bill.amount)}), combinado pra ${fmtDateBR(bill.due)}. Qualquer coisa me chama! 😊`
      )}`
    : null;

  return (
    <div className="list-row">
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{bill.desc}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {client ? client.name + ' · ' : ''}vence {fmtDateBR(bill.due)} · {venceLabel}
        </div>
      </div>
      <div className="row-stats">
        <span className={'badge' + (dias < 0 ? ' expense' : '')}>{dias < 0 ? 'Atrasada' : 'Em aberto'}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{fmtBRL(bill.amount)}</span>
      </div>
      {isOwner && (
        <div className="row-actions">
          {cobrarLink && (
            <a className="pill sm" href={cobrarLink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              💬 Cobrar
            </a>
          )}
          <button className={'pill sm ' + (kind === 'pagar' ? 'expense' : 'income')} onClick={() => setSettling(true)}>
            {kind === 'pagar' ? 'Dar baixa' : 'Recebi'}
          </button>
          <button className="pill ghost sm" onClick={() => setEditing(true)}>
            editar
          </button>
        </div>
      )}
      {editing && <BillModal onClose={() => setEditing(false)} editingBill={bill} />}
      {settling && (
        <PromptModal
          title={`${kind === 'pagar' ? 'Dar baixa' : 'Recebi'} — ${bill.desc}`}
          description={`Vencimento ${fmtDateBR(bill.due)}. Ajuste o valor se pagou/recebeu diferente do combinado.`}
          fields={[{ key: 'amount', label: 'Valor (R$)', defaultValue: String(bill.amount).replace('.', ','), kind: 'money' }]}
          confirmLabel="Confirmar"
          onCancel={() => setSettling(false)}
          onConfirm={async (v) => {
            await settle.mutateAsync({ id: bill.id, amount: v.amount as number });
            setSettling(false);
          }}
        />
      )}
    </div>
  );
}

function QuitadaRow({ bill }: { bill: Bill }) {
  const { isOwner } = useAuth();
  const reopen = useReopenBill();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--divider)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{bill.desc}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>quitada em {fmtDateBR(bill.settledAt)}</div>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtBRL(bill.amount)}</span>
      {isOwner && (
        <button className="pill ghost sm" onClick={() => reopen.mutate(bill.id)}>
          reabrir
        </button>
      )}
    </div>
  );
}

const AGING_BUCKETS = [
  { label: '1–30 dias', min: 1, max: 30 },
  { label: '31–60 dias', min: 31, max: 60 },
  { label: '61–90 dias', min: 61, max: 90 },
  { label: '90+ dias', min: 91, max: Infinity },
] as const;

function AgingReport({ aPagarList, aReceberList }: { aPagarList: Bill[]; aReceberList: Bill[] }) {
  const overduePagar = aPagarList.filter((b) => daysUntil(b.due) < 0);
  const overdueReceber = aReceberList.filter((b) => daysUntil(b.due) < 0);
  if (overduePagar.length === 0 && overdueReceber.length === 0) return null;

  const rows = AGING_BUCKETS.map((bucket) => {
    const inBucket = (b: Bill) => {
      const atraso = -daysUntil(b.due);
      return atraso >= bucket.min && atraso <= bucket.max;
    };
    const pagar = overduePagar.filter(inBucket);
    const receber = overdueReceber.filter(inBucket);
    return { bucket, pagar, receber };
  });

  const sum = (list: Bill[]) => list.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="card">
      <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
        Contas em atraso por tempo
      </div>
      <div className="section-hint" style={{ marginBottom: 12 }}>
        Quanto tempo essas contas estão vencidas — quanto mais tempo, maior o risco de nunca receber ou de juros no pagar.
      </div>
      <div className="list">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: 'var(--surface-2)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
          <span style={{ flex: 1 }}>ATRASO</span>
          <span style={{ width: 130, textAlign: 'right' }}>A RECEBER</span>
          <span style={{ width: 130, textAlign: 'right' }}>A PAGAR</span>
        </div>
        {rows.map(({ bucket, pagar, receber }) => (
          <div key={bucket.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface)' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{bucket.label}</span>
            <span style={{ width: 130, textAlign: 'right', fontSize: 13, color: receber.length ? 'var(--income-text)' : 'var(--text-muted)' }}>
              {receber.length ? `${fmtBRL(sum(receber))} (${receber.length})` : '—'}
            </span>
            <span style={{ width: 130, textAlign: 'right', fontSize: 13, color: pagar.length ? 'var(--expense-text)' : 'var(--text-muted)' }}>
              {pagar.length ? `${fmtBRL(sum(pagar))} (${pagar.length})` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecurringSection() {
  const { data: recurring = [] } = useRecurring();
  const { data: categories = [] } = useCategories();
  const { isOwner } = useAuth();
  const saveRec = useSaveRecurring();
  const deleteRec = useDeleteRecurring();
  const [modal, setModal] = useState<{ open: boolean; id?: string } | null>(null);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('5');
  const [categoryId, setCategoryId] = useState('');
  const despesaCats = categories.filter((c) => c.type === 'despesa');

  function openAdd() {
    setDesc('');
    setAmount('');
    setDueDay('5');
    setCategoryId('');
    setModal({ open: true });
  }
  function openEdit(r: (typeof recurring)[number]) {
    setDesc(r.desc);
    setAmount(String(r.amount).replace('.', ','));
    setDueDay(String(r.dueDay));
    setCategoryId(r.categoryId || '');
    setModal({ open: true, id: r.id });
  }
  async function onSave() {
    if (!desc.trim() || numOr0(amount) <= 0) return;
    await saveRec.mutateAsync({ id: modal?.id, desc: desc.trim(), amount: numOr0(amount), dueDay: Math.min(28, Math.max(1, numOr0(dueDay) || 5)), categoryId: categoryId || null });
    setModal(null);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
            Despesas fixas
          </div>
          <div className="section-hint">Aluguel, internet, assinaturas — a conta do mês nasce sozinha.</div>
        </div>
        {isOwner && (
          <button className="pill accent sm" onClick={openAdd}>
            + Despesa fixa
          </button>
        )}
      </div>
      {recurring.length > 0 ? (
        <div className="list">
          {recurring.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.desc}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>todo dia {r.dueDay}{r.jaGerouEsteMes ? ' · conta deste mês já criada' : ' · será criada automaticamente'}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(r.amount)}</span>
              {isOwner && (
                <>
                  <button className="pill ghost sm" onClick={() => openEdit(r)}>
                    editar
                  </button>
                  <button className="icon-btn" aria-label="Excluir despesa fixa" onClick={() => deleteRec.mutate(r.id)}>
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Nenhuma despesa fixa cadastrada.</div>
      )}
      {modal?.open && (
        <Modal title={modal.id ? 'Editar despesa fixa' : 'Nova despesa fixa'} onClose={() => setModal(null)}>
          <label className="field">
            Descrição
            <input className="input" placeholder="Ex: Aluguel" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              Valor
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field">
              Dia do vencimento
              <input className="input" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Categoria
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Padrão</option>
              {despesaCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={onSave}>
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Contas() {
  const { data, isLoading, error, refetch } = useContasReport();
  const { isOwner } = useAuth();
  const [billModal, setBillModal] = useState<'pagar' | 'receber' | null>(null);

  return (
    <>
      <PageHeader title="Contas" subtitle="Contas a pagar, a receber e patrimônio líquido" />
      <div className="scroll-area">
        {(isLoading || error) && (
          <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
            <div />
          </QueryState>
        )}
        <div className="page">
          <div className="info-banner" style={{ background: 'var(--banner-amber-bg)', border: '1px solid var(--banner-amber-border)', color: 'var(--banner-amber-text)' }}>
            <strong>Contas</strong>&nbsp;responde: <em>o que ainda falta pagar e receber?</em> Só entra no Caixa quando você dá baixa.
          </div>

          {data && (
            <div style={{ borderRadius: 22, padding: '26px 30px', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--on-accent, white)', boxShadow: 'var(--shadow-hero)', display: 'flex', flexWrap: 'wrap', gap: 34 }}>
              <div>
                <div style={{ fontSize: 11.5, opacity: 0.85, marginBottom: 3 }}>A receber (em aberto)</div>
                <div className="serif" style={{ fontSize: 30, fontWeight: 600 }}>
                  {fmtBRL(data.aReceberTotal)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, opacity: 0.85, marginBottom: 3 }}>A pagar (em aberto)</div>
                <div className="serif" style={{ fontSize: 30, fontWeight: 600 }}>
                  {fmtBRL(data.aPagarTotal)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, opacity: 0.85, marginBottom: 3 }}>Caixa projetado (depois de tudo)</div>
                <div className="serif" style={{ fontSize: 30, fontWeight: 600 }}>
                  {fmtBRL(data.caixaProjetado)}
                </div>
              </div>
            </div>
          )}

          {data && <AgingReport aPagarList={data.aPagarList} aReceberList={data.aReceberList} />}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 1, minWidth: 330, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
                  Contas a pagar
                </div>
                {isOwner && (
                  <button className="pill expense sm" onClick={() => setBillModal('pagar')}>
                    + Conta
                  </button>
                )}
              </div>
              {data && data.aPagarList.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--surface-2)', borderRadius: 14, overflow: 'hidden' }}>
                  {data.aPagarList.map((b) => (
                    <BillRow key={b.id} bill={b} kind="pagar" />
                  ))}
                </div>
              ) : null}
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>Lançar aqui não mexe no caixa. Quando você marcar como paga, vira despesa do dia.</div>
            </div>

            <div className="card" style={{ flex: 1, minWidth: 330, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
                  Contas a receber
                </div>
                {isOwner && (
                  <button className="pill income sm" onClick={() => setBillModal('receber')}>
                    + Conta
                  </button>
                )}
              </div>
              {data && data.aReceberList.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--surface-2)', borderRadius: 14, overflow: 'hidden' }}>
                  {data.aReceberList.map((b) => (
                    <BillRow key={b.id} bill={b} kind="receber" />
                  ))}
                </div>
              ) : null}
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>Cliente que ficou devendo, parcela de pacote, venda no fiado.</div>
            </div>
          </div>

          <RecurringSection />

          {data && data.quitadasList.length > 0 && (
            <div className="card">
              <div className="serif" style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>
                Últimas quitadas
              </div>
              {data.quitadasList.map((b) => (
                <QuitadaRow key={b.id} bill={b} />
              ))}
            </div>
          )}
        </div>
      </div>
      {billModal && <BillModal onClose={() => setBillModal(null)} defaultKind={billModal} />}
    </>
  );
}
