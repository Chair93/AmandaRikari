import { useState } from 'react';
import Modal from './Modal';
import { useCategories, useClients, useSaveBill } from '../api/hooks';
import type { Bill } from '../api/types';
import { parseNumberBR, todayStr } from '../format';

export default function BillModal({
  onClose,
  editingBill,
  defaultKind,
  defaultClientId,
}: {
  onClose: () => void;
  editingBill?: Bill | null;
  defaultKind?: 'pagar' | 'receber';
  defaultClientId?: string;
}) {
  const { data: categories = [] } = useCategories();
  const { data: clients = [] } = useClients();
  const saveBill = useSaveBill();

  const [kind, setKind] = useState<'pagar' | 'receber'>(editingBill?.kind || defaultKind || 'pagar');
  const [desc, setDesc] = useState(editingBill?.desc || '');
  const [amount, setAmount] = useState(editingBill ? String(editingBill.amount).replace('.', ',') : '');
  const [due, setDue] = useState(editingBill?.due || todayStr());
  const [categoryId, setCategoryId] = useState(editingBill?.categoryId || '');
  const [clientId, setClientId] = useState(editingBill?.clientId || defaultClientId || '');
  const [note, setNote] = useState(editingBill?.note || '');
  const [recorrente, setRecorrente] = useState(!!editingBill?.recorrente);
  const [error, setError] = useState<string | null>(null);

  const catOptions = categories.filter((c) => c.type === (kind === 'pagar' ? 'despesa' : 'receita'));

  async function onSave() {
    if (!desc.trim()) {
      setError('Preencha a descrição.');
      return;
    }
    const parsedAmount = parseNumberBR(amount);
    if (parsedAmount == null || parsedAmount <= 0) {
      setError(amount.trim() === '' ? 'Preencha o valor.' : `Valor inválido: "${amount}". Use apenas números, ex: 1.500,00`);
      return;
    }
    try {
      await saveBill.mutateAsync({
        id: editingBill?.id,
        kind,
        desc: desc.trim(),
        amount: parsedAmount,
        due,
        categoryId: categoryId || null,
        clientId: clientId || null,
        note: note || null,
        recorrente,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Modal title={editingBill ? 'Editar conta' : 'Nova conta'} onClose={onClose}>
      <div className="tab-row">
        <button className={'tab' + (kind === 'pagar' ? ' active-expense' : '')} onClick={() => setKind('pagar')}>
          A pagar
        </button>
        <button className={'tab' + (kind === 'receber' ? ' active-income' : '')} onClick={() => setKind('receber')}>
          A receber
        </button>
      </div>
      <label className="field">
        Descrição
        <input className="input" placeholder="Ex: Aluguel, cliente Fulana..." value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          Valor
          <input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          Vencimento
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      {kind === 'receber' && (
        <label className="field">
          Cliente (opcional)
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Sem cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Categoria (opcional)
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Padrão</option>
          {catOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nota (opcional)
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        onClick={() => setRecorrente((v) => !v)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)' }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            flex: 'none',
            borderRadius: 6,
            border: '2px solid var(--accent)',
            background: recorrente ? 'var(--accent)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {recorrente ? '✓' : ''}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>Repete todo mês (gera a próxima automaticamente ao dar baixa)</span>
      </button>
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveBill.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
