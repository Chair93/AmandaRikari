import { useRef, useState } from 'react';
import Modal from './Modal';
import { useClientDetail, useClientPhotos, useDeleteClientPhoto, useDeletePackage, useSettings, useSettleBill, useUploadClientPhoto, useUsePackageSession, type PhotoTipo } from '../api/hooks';
import { compressImage } from '../imageCompress';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, fmtDateBR } from '../format';
import PackageModal from './PackageModal';
import BillModal from './BillModal';
import ReceiptModal from './ReceiptModal';
import TransactionModal from './TransactionModal';
import PromptModal from './PromptModal';
import type { Bill, TxSummary } from '../api/types';

export default function ClientDetailModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { data } = useClientDetail(clientId);
  const { isOwner } = useAuth();
  const settle = useSettleBill();
  const { data: settings } = useSettings();
  const usePkgSession = useUsePackageSession();

  function usarSessao(pkgId: string) {
    // Room use is opt-in per session — ask only when a room is configured.
    const salaOn = settings && settings.salaMode !== 'off';
    const usarSala = salaOn ? window.confirm('Essa sessão foi na sala alugada?\n\nOK — sim, somar o custo da sala no mês\nCancelar — não, sem custo de sala') : false;
    usePkgSession.mutate({ id: pkgId, usarSala });
  }
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

  const { data: fotos = [] } = useClientPhotos(clientId);

  if (!data) return null;
  const { client, pago, aberto, visitas, ticketMedio, bills, history, packages, indicadoPor, indicados = [], receitaIndicados = 0 } = data;


  return (
    <>
      <Modal title={client.name} onClose={onClose} wide>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Stat label="Já pagou" value={fmtBRL(pago)} />
          <Stat label="Está devendo" value={fmtBRL(aberto)} color={aberto > 0 ? 'var(--expense-text)' : 'var(--income-text)'} />
          <Stat label="Visitas" value={String(visitas)} />
          <Stat label="Ticket médio" value={fmtBRL(ticketMedio)} />
        </div>

        {(indicadoPor || indicados.length > 0) && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, background: 'var(--surface-2)', borderRadius: 12, padding: '10px 14px' }}>
            {indicadoPor && (
              <div>
                💛 Indicada por <strong style={{ color: 'var(--text)' }}>{indicadoPor.name}</strong>
              </div>
            )}
            {indicados.length > 0 && (
              <div>
                💛 Indicou <strong style={{ color: 'var(--text)' }}>{indicados.length === 1 ? '1 cliente' : `${indicados.length} clientes`}</strong> ({indicados.map((i) => i.name).join(', ')})
                {receitaIndicados > 0 && (
                  <>
                    {' '}
                    — que já trouxeram <strong style={{ color: 'var(--income-text)' }}>{fmtBRL(receitaIndicados)}</strong>
                  </>
                )}
              </div>
            )}
          </div>
        )}

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

        <PhotosSection clientId={clientId} history={history} />

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
                      <button className="pill sm" onClick={() => usarSessao(p.id)}>
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
              {history.map((tx) => {
                const fotosDoTx = fotos.filter((p) => p.txId === tx.id);
                return (
                  <div key={tx.id} className="list-row" style={{ flexWrap: 'wrap' }}>
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
                    {fotosDoTx.length > 0 && (
                      <div style={{ flexBasis: '100%', display: 'flex', gap: 6, marginTop: 6 }}>
                        {fotosDoTx.map((p) => (
                          <a key={p.id} href={`/api/photos/${p.id}/file`} target="_blank" rel="noopener noreferrer" title={TIPO_LABEL[p.tipo]}>
                            <img
                              src={`/api/photos/${p.id}/file`}
                              alt={TIPO_LABEL[p.tipo]}
                              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
                              loading="lazy"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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

const TIPO_LABEL: Record<PhotoTipo, string> = { anamnese: 'Anamnese', antes: 'Antes', depois: 'Depois', outra: 'Outra' };
const GALERIA_COMPACTA = 6;

/** Anamnese e fotos — camera-first on the phone, compressed on-device,
 *  stored encrypted on the server. Every photo carries a fixed tipo so the
 *  gallery can filter; the newest anamnese is flagged "atual" and the rest
 *  stay as history (health declarations are never overwritten). */
function PhotosSection({ clientId, history }: { clientId: string; history: TxSummary[] }) {
  const { isOwner } = useAuth();
  const { data: photos = [] } = useClientPhotos(clientId);
  const upload = useUploadClientPhoto();
  const delPhoto = useDeleteClientPhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const tipoRef = useRef<PhotoTipo>('anamnese');
  const txRef = useRef<string>('');
  const [choosing, setChoosing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'anamnese' | 'ad'>('todas');
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const atendimentos = history.filter((h) => h.type === 'receita').slice(0, 12);

  function pickTipo(t: PhotoTipo) {
    tipoRef.current = t;
    txRef.current = '';
    setChoosing(false);
    // Antes/depois documents a specific atendimento — offer the link before
    // opening the camera. Anamnese and outras go straight through.
    if ((t === 'antes' || t === 'depois') && atendimentos.length > 0) {
      txRef.current = atendimentos[0].id; // default: the most recent one
      setLinking(true);
    } else {
      fileRef.current?.click();
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    try {
      const data = await compressImage(file);
      await upload.mutateAsync({ clientId, data, tipo: tipoRef.current, txId: txRef.current || null });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Não consegui enviar a foto.');
    }
  }

  // Rows come newest-first from the server, so the first anamnese is the
  // current one.
  const anamneseAtualId = photos.find((p) => p.tipo === 'anamnese')?.id;
  const filtered = photos.filter((p) => (filtro === 'todas' ? true : filtro === 'anamnese' ? p.tipo === 'anamnese' : p.tipo === 'antes' || p.tipo === 'depois'));
  const visiveis = showAll ? filtered : filtered.slice(0, GALERIA_COMPACTA);

  if (photos.length === 0 && !isOwner) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          Anamnese e fotos
        </div>
        {isOwner && (
          <button className="pill sm" onClick={() => setChoosing((c) => !c)} disabled={upload.isPending}>
            {upload.isPending ? 'Enviando…' : '📷 Adicionar foto'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>
        Guardadas criptografadas no servidor — só quem está logado vê. Anamnese nova entra por cima; as antigas ficam de histórico.
      </div>
      {choosing && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>O que é essa foto?</span>
          {(Object.keys(TIPO_LABEL) as PhotoTipo[]).map((t) => (
            <button key={t} className="pill sm" onClick={() => pickTipo(t)}>
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      {linking && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>De qual atendimento?</span>
          <select className="input" style={{ maxWidth: 280, padding: '7px 10px', fontSize: 12.5 }} defaultValue={txRef.current} onChange={(e) => (txRef.current = e.target.value)}>
            {atendimentos.map((t) => (
              <option key={t.id} value={t.id}>
                {fmtDateBR(t.date)} — {t.categoryName} — {fmtBRL(t.amount)}
              </option>
            ))}
            <option value="">Sem vínculo</option>
          </select>
          <button
            className="pill sm accent"
            onClick={() => {
              setLinking(false);
              fileRef.current?.click();
            }}
          >
            📷 Continuar
          </button>
          <button className="pill ghost sm" onClick={() => setLinking(false)}>
            cancelar
          </button>
        </div>
      )}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(
            [
              ['todas', `Todas (${photos.length})`],
              ['anamnese', `Anamnese (${photos.filter((p) => p.tipo === 'anamnese').length})`],
              ['ad', `Antes/Depois (${photos.filter((p) => p.tipo === 'antes' || p.tipo === 'depois').length})`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={'pill sm' + (filtro === k ? ' active' : '')} onClick={() => setFiltro(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {err && <div className="auth-error">{err}</div>}
      {filtered.length > 0 ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {visiveis.map((p) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <a href={`/api/photos/${p.id}/file`} target="_blank" rel="noopener noreferrer" title={`${TIPO_LABEL[p.tipo]} — ${fmtDateBR(p.createdAt.slice(0, 10))}`}>
                  <img
                    src={`/api/photos/${p.id}/file`}
                    alt={`${TIPO_LABEL[p.tipo]} de ${fmtDateBR(p.createdAt.slice(0, 10))}`}
                    style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)', display: 'block' }}
                    loading="lazy"
                  />
                </a>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>
                  {TIPO_LABEL[p.tipo]}
                  {p.id === anamneseAtualId ? ' · atual' : ''} · {fmtDateBR(p.createdAt.slice(0, 10))}
                </div>
                {p.id === anamneseAtualId && (
                  <span
                    className="badge"
                    style={{ position: 'absolute', top: 4, left: 4, background: 'var(--income-soft)', color: 'var(--income-text)', fontSize: 9, fontWeight: 700, padding: '2px 6px' }}
                  >
                    atual
                  </span>
                )}
                {isOwner && (
                  <button
                    className="icon-btn"
                    aria-label="Excluir foto"
                    style={{ position: 'absolute', top: -6, right: -6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, width: 22, height: 22, lineHeight: 1 }}
                    onClick={() => {
                      if (window.confirm('Excluir esta foto? Não tem volta.')) delPhoto.mutate({ id: p.id, clientId });
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {filtered.length > GALERIA_COMPACTA && (
            <button className="pill ghost sm" style={{ marginTop: 8 }} onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Mostrar menos' : `Ver todas (${filtered.length})`}
            </button>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {photos.length === 0 ? 'Nenhuma foto ainda — tire uma foto da ficha de anamnese no celular e guarde aqui.' : 'Nenhuma foto nesse filtro.'}
        </div>
      )}
      {isOwner && <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPick} />}
    </div>
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
