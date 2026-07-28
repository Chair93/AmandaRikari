import { useState } from 'react';
import Modal from './Modal';
import { fmtBRL } from '../format';
import type { DeleteImpact } from '../api/types';

/** Confirmation for deleting a product or asset from Estoque.
 *
 *  It spells out the damage rather than asking a bare "tem certeza?", because
 *  the answer genuinely depends on what is attached: deleting a product just
 *  registered by mistake is harmless, while deleting one with a year of sales
 *  rewrites the caixa of every month it touched. */
export default function ConfirmDeleteModal({
  name,
  what,
  impact,
  loading,
  onCancel,
  onConfirm,
}: {
  name: string;
  what: 'produto' | 'bem';
  impact?: DeleteImpact;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removes: string[] = [];
  const changes: string[] = [];
  if (impact) {
    if (impact.vendas.count > 0) {
      removes.push(`${impact.vendas.count} ${impact.vendas.count === 1 ? 'venda registrada' : 'vendas registradas'} — ${fmtBRL(impact.vendas.total)} de receita`);
    }
    if (impact.compras.count > 0) {
      removes.push(`${impact.compras.count} ${impact.compras.count === 1 ? 'compra' : 'compras'} — ${fmtBRL(impact.compras.total)} de saída do caixa`);
    }
    if (impact.atendimentos.count > 0) {
      changes.push(`${impact.atendimentos.count} ${impact.atendimentos.count === 1 ? 'atendimento usou' : 'atendimentos usaram'} este item — os atendimentos continuam (o cliente pagou), só somem da lista de itens`);
    }
    if (impact.servicos.count > 0) {
      changes.push(`sai da ficha técnica de ${impact.servicos.count} ${impact.servicos.count === 1 ? 'serviço' : 'serviços'}: ${impact.servicos.names.join(', ')}`);
    }
  }

  const mexeNoCaixa = !!impact && (impact.vendas.count > 0 || impact.compras.count > 0);

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui excluir.');
      setBusy(false);
    }
  }

  return (
    <Modal title={`Excluir ${what} "${name}"?`} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Verificando o que está ligado a este item…</div>
        ) : (
          <>
            {removes.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--expense-text)', marginBottom: 6 }}>Também vai apagar</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {removes.map((t) => (
                    <li key={t} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {changes.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>O que muda (mas não some)</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {changes.map((t) => (
                    <li key={t} style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {removes.length === 0 && changes.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Nada mais está ligado a este item — nenhum lançamento, serviço ou atendimento será afetado.
              </div>
            )}

            {mexeNoCaixa && (
              <div className="info-banner" style={{ background: 'var(--expense-soft)', color: 'var(--expense-text)' }}>
                Isso muda o caixa e o resultado dos meses envolvidos. Não dá para desfazer.
              </div>
            )}
          </>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={confirm} disabled={busy || loading}>
            {busy ? 'Excluindo…' : 'Excluir mesmo assim'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
