import { useState } from 'react';
import Modal from './Modal';
import { useClientDetail, useDeletePackage, useSettleBill, useUsePackageSession } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, fmtDateBR } from '../format';
import PackageModal from './PackageModal';
import BillModal from './BillModal';
import ReceiptModal from './ReceiptModal';
import TransactionModal from './TransactionModal';
import PromptModal from './PromptModal';
import type { Bill } from '../api/types';

export default function ClientDetailModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { data } = useClientDetail(clientId);
  const { isOwner } = useAuth();
  const settle = useSettleBill();
  const usePkgSession = useUsePackageSession();
  const deletePkg = useDeletePackage();
  const [subModal, setSubModal] = useState<
    | { kind: 'package' }
    | { kind: 'bill' }
    | { kind: 'editBill'; bill: Bill }
    | { kind: 'settleBill'; bill: Bill }
    | { kind: 'receipt'; date: string; serviceName: string; amount: number; payment: string | null }
    | { kind: 'editTx'; id: string }
    | null
  >(null);

  if (!data) return null;
  const { client, pago, aberto, visitas, ticketMedio, bills, history, packages } = data;


  return (
    <>
      <Modal title={client.name} onClose={onClose} wide>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Stat label="Já pagou" value={fmtBRL(pago)} />
          <Stat label="Está devendo" value={fmtBRL(aberto)} color={aberto > 0 ? 'var(--expense-text)' : 'var(--income-text)'} />
          <Stat label="Visitas" value={String(visitas)} />
          <Stat label="Ticket médio" value={fmtBRL(ticketMedio)} />
        </div>

        {isOwner && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="pill accent sm" onClick={() => setSubModal({ kind: 'package' })}>
              + Vender pacote
            </button>
            <button className="pill sm" onClick={() => setSubModal({ kind: 'bill' })}>
              + Conta a receber
            </button>
          </div>
        )}

        {packages.length > 0 && (
          <div>
            <div className="section-title">Pacotes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {packages.map((p) => (
                <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {(p.serviceName || 'Pacote') + ` · ${p.sessions} sessões`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {fmtBRL(p.amount)} · {fmtBRL(p.amount / p.sessions)} por sessão · comprado em {fmtDateBR(p.date)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge" style={(p.restantes || 0) > 0 ? { background: 'var(--income-soft)', color: 'var(--income-text)' } : undefined}>
                      {(p.restantes || 0) > 0 ? `${p.restantes} restantes` : 'usado'}
                    </span>
                    {isOwner && (p.restantes || 0) > 0 && (
                      <button className="pill sm" onClick={() => usePkgSession.mutate(p.id)}>
                        Usar sessão
                      </button>
                    )}
                    {isOwner && (
                      <button className="icon-btn" aria-label="Excluir pacote" onClick={() => deletePkg.mutate(p.id)}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bills.length > 0 && (
          <div>
            <div className="section-title">Contas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--surface-2)', borderRadius: 14, overflow: 'hidden' }}>
              {bills.map((b) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{b.desc}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.settled ? `quitada em ${fmtDateBR(b.settledAt)}` : `vence ${fmtDateBR(b.due)}`}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(b.amount)}</span>
                  {isOwner && !b.settled && (
                    <button className="pill sm income" onClick={() => setSubModal({ kind: 'settleBill', bill: b })}>
                      Recebi
                    </button>
                  )}
                  {isOwner && (
                    <button className="pill ghost sm" onClick={() => setSubModal({ kind: 'editBill', bill: b })}>
                      editar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="section-title">Histórico</div>
          {history.length > 0 ? (
            <div className="list">
              {history.map((tx) => (
                <div key={tx.id} className="list-row">
                  <button className="list-row clickable" style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => setSubModal({ kind: 'editTx', id: tx.id })}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.categoryName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDateBR(tx.date)}</div>
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tx.type === 'receita' ? 'var(--income-text)' : 'var(--expense-text)' }}>
                    {(tx.type === 'receita' ? '' : '− ') + fmtBRL(tx.amount)}
                  </span>
                  {tx.type === 'receita' && (
                    <button
                      className="pill ghost sm"
                      onClick={() =>
                        setSubModal({ kind: 'receipt', date: tx.date, serviceName: tx.categoryName, amount: tx.amount, payment: tx.payment })
                      }
                    >
                      recibo
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Nenhum lançamento ainda.</div>
          )}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </Modal>

      {subModal?.kind === 'package' && <PackageModal onClose={() => setSubModal(null)} defaultClientId={clientId} />}
      {subModal?.kind === 'bill' && <BillModal onClose={() => setSubModal(null)} defaultKind="receber" defaultClientId={clientId} />}
      {subModal?.kind === 'editBill' && <BillModal onClose={() => setSubModal(null)} editingBill={subModal.bill} />}
      {subModal?.kind === 'settleBill' && (
        <PromptModal
          title={`${subModal.bill.kind === 'pagar' ? 'Dar baixa' : 'Recebi'} — ${subModal.bill.desc}`}
          description={`Vencimento ${fmtDateBR(subModal.bill.due)}. Ajuste o valor se pagou/recebeu diferente do combinado.`}
          fields={[{ key: 'amount', label: 'Valor (R$)', defaultValue: String(subModal.bill.amount).replace('.', ','), kind: 'money' }]}
          confirmLabel="Confirmar"
          onCancel={() => setSubModal(null)}
          onConfirm={async (v) => {
            await settle.mutateAsync({ id: (subModal as { bill: Bill }).bill.id, amount: v.amount as number });
            setSubModal(null);
          }}
        />
      )}
      {subModal?.kind === 'editTx' && <TransactionModal onClose={() => setSubModal(null)} editingTxId={subModal.id} />}
      {subModal?.kind === 'receipt' && (
        <ReceiptModal onClose={() => setSubModal(null)} clientName={client.name} clientPhone={client.phone} date={subModal.date} serviceName={subModal.serviceName} amount={subModal.amount} payment={subModal.payment} />
      )}
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 140, padding: '14px 16px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div className="serif" style={{ fontSize: 22, fontWeight: 600, color }}>
        {value}
      </div>
    </div>
  );
}
