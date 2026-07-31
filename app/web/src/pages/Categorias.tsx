import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useCategories, useDeleteCategory, useSaveCategory } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import type { Category } from '../api/types';

function CategoryModal({ onClose, editingCategory }: { onClose: () => void; editingCategory?: Category | null }) {
  const saveCategory = useSaveCategory();
  const [type, setType] = useState<'receita' | 'despesa' | 'servico'>(editingCategory?.type || 'despesa');
  const [name, setName] = useState(editingCategory?.name || '');
  const [investment, setInvestment] = useState(!!editingCategory?.investment);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!name.trim()) {
      setError('Informe o nome da categoria.');
      return;
    }
    try {
      await saveCategory.mutateAsync({ id: editingCategory?.id, name: name.trim(), type, investment });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Modal title={editingCategory ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <div className="tab-row">
        <button className={'tab' + (type === 'despesa' ? ' active-expense' : '')} onClick={() => setType('despesa')}>
          Despesa
        </button>
        <button className={'tab' + (type === 'receita' ? ' active-income' : '')} onClick={() => setType('receita')}>
          Receita
        </button>
        <button className={'tab' + (type === 'servico' ? ' active-accent' : '')} onClick={() => setType('servico')}>
          Serviço
        </button>
      </div>
      {type === 'servico' && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Categorias de serviço organizam o catálogo (Peeling, Limpeza de pele...). Renomear aqui atualiza os serviços que já usam o nome.
        </div>
      )}
      {type === 'despesa' && (
        <button
          onClick={() => setInvestment((v) => !v)}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)' }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              flex: 'none',
              borderRadius: 6,
              border: '2px solid var(--accent)',
              background: investment ? 'var(--accent)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--on-accent, white)',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {investment ? '✓' : ''}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text)' }}>
            <strong>Investimento</strong> — sai do caixa mas não entra no resultado (compra de estoque, equipamentos)
          </span>
        </button>
      )}
      <label className="field">
        Nome
        <input className="input" placeholder="Ex: Marketing" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveCategory.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}

export default function Categorias() {
  const { data: categories = [] } = useCategories();
  const { isOwner } = useAuth();
  const del = useDeleteCategory();
  const [modal, setModal] = useState<{ open: boolean; editing?: Category | null } | null>(null);

  const despesas = categories.filter((c) => c.type === 'despesa');
  const receitas = categories.filter((c) => c.type === 'receita');
  const servicos = categories.filter((c) => c.type === 'servico');

  function onDelete(c: Category) {
    if (!window.confirm(`Remover a categoria "${c.name}"?`)) return;
    del.mutate(c.id);
  }

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle="Organize seus tipos de gasto e receita"
        right={
          isOwner ? (
            <button className="btn-primary header-action" onClick={() => setModal({ open: true })}>
              + Categoria
            </button>
          ) : undefined
        }
      />
      <div className="scroll-area">
        <div className="page narrow">
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--expense-text)' }}>Despesas</div>
            <div className="list">
              {despesas.map((c) => (
                <div className="list-row" key={c.id}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: 'oklch(58% 0.1 35)', flex: 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{c.name}</span>
                  {c.investment && <span className="badge" style={{ background: 'var(--expense-soft)', color: 'var(--expense-text)' }}>investimento</span>}
                  {isOwner && (
                    <div className="row-actions">
                      <button className="pill ghost sm" onClick={() => setModal({ open: true, editing: c })}>
                        Editar
                      </button>
                      <button className="icon-btn" aria-label="Excluir categoria" onClick={() => onDelete(c)}>
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--income-text)' }}>Receitas</div>
            <div className="list">
              {receitas.map((c) => (
                <div className="list-row" key={c.id}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: 'oklch(50% 0.08 150)', flex: 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{c.name}</span>
                  {isOwner && (
                    <div className="row-actions">
                      <button className="pill ghost sm" onClick={() => setModal({ open: true, editing: c })}>
                        Editar
                      </button>
                      <button className="icon-btn" aria-label="Excluir categoria" onClick={() => onDelete(c)}>
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--accent-text)' }}>Serviços (catálogo)</div>
            <div className="list">
              {servicos.map((c) => (
                <div className="list-row" key={c.id}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--accent)', flex: 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{c.name}</span>
                  {isOwner && (
                    <div className="row-actions">
                      <button className="pill ghost sm" onClick={() => setModal({ open: true, editing: c })}>
                        Editar
                      </button>
                      <button className="icon-btn" aria-label="Excluir categoria" onClick={() => onDelete(c)}>
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        {isOwner && (
          <button className="fab" aria-label="Nova categoria" onClick={() => setModal({ open: true })}>
            +
          </button>
        )}
      </div>
      {modal?.open && <CategoryModal onClose={() => setModal(null)} editingCategory={modal.editing} />}
    </>
  );
}
