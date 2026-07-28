import { useState } from 'react';
import Modal from './Modal';
import { useSaveEquipment } from '../api/hooks';
import type { Equipment } from '../api/types';
import { fmtBRL, numOr0 } from '../format';

export default function EquipmentModal({ onClose, editingEquipment }: { onClose: () => void; editingEquipment?: Equipment | null }) {
  const saveEquipment = useSaveEquipment();
  const [name, setName] = useState(editingEquipment?.name || '');
  const [kind, setKind] = useState<'utensilio' | 'maquina'>(editingEquipment?.kind || 'utensilio');
  const [cost, setCost] = useState(editingEquipment ? String(editingEquipment.cost).replace('.', ',') : '');
  const [usefulUses, setUsefulUses] = useState(editingEquipment ? String(editingEquipment.usefulUses) : '');
  const [kwh, setKwh] = useState(editingEquipment?.kwh ? String(editingEquipment.kwh).replace('.', ',') : '');
  const [error, setError] = useState<string | null>(null);

  const perUse = numOr0(usefulUses) > 0 ? numOr0(cost) / numOr0(usefulUses) : 0;

  async function onSave() {
    if (!name.trim() || numOr0(usefulUses) <= 0) {
      setError('Preencha o nome e os usos estimados.');
      return;
    }
    try {
      // Quantity is deliberately absent: registration only creates the entry,
      // and units arrive through "+ Compra" so every asset also books the cash
      // out. Same rule the products got — otherwise the balance sheet carries
      // assets no money ever paid for.
      await saveEquipment.mutateAsync({ id: editingEquipment?.id, name: name.trim(), kind, cost: numOr0(cost), usefulUses: numOr0(usefulUses), kwh: kind === 'maquina' ? numOr0(kwh) : 0 });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Modal title={editingEquipment ? 'Editar bem' : 'Novo bem'} onClose={onClose}>
      <div className="tab-row">
        <button className={'tab' + (kind === 'utensilio' ? ' active-income' : '')} onClick={() => setKind('utensilio')}>
          Utensílio
        </button>
        <button className={'tab' + (kind === 'maquina' ? ' active-accent' : '')} onClick={() => setKind('maquina')}>
          Máquina (usa energia)
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {kind === 'maquina'
          ? 'Na ficha do serviço você informa os minutos ligada — entra depreciação por uso + energia.'
          : 'Na ficha do serviço você informa quantos usa por atendimento — entra só a depreciação, sem energia.'}
      </div>
      <label className="field">
        Nome
        <input className="input" placeholder="Ex: Extrator de cravos" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        Custo por unidade (R$)
        <input className="input" inputMode="decimal" placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          Usos até depreciar 100%
          <input className="input" inputMode="numeric" value={usefulUses} onChange={(e) => setUsefulUses(e.target.value)} />
        </label>
        {kind === 'maquina' && (
          <label className="field">
            kWh por hora de uso
            <input className="input" inputMode="decimal" value={kwh} onChange={(e) => setKwh(e.target.value)} />
          </label>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fmtBRL(perUse)} / uso</div>
      {!editingEquipment && (
        <div className="info-banner" style={{ background: 'var(--banner-green-bg)', border: '1px solid var(--banner-green-border)', color: 'var(--banner-green-text)' }}>
          Depois de salvar, use <strong>+ Compra</strong> na lista para dar entrada nas unidades — é a compra que lança a saída no caixa.
        </div>
      )}
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveEquipment.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
