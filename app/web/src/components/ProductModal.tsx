import { useState } from 'react';
import Modal from './Modal';
import { useSaveProduct } from '../api/hooks';
import type { Product } from '../api/types';
import { fmtBRL, numOr0, UNIT_LABEL } from '../format';

export default function ProductModal({ onClose, editingProduct }: { onClose: () => void; editingProduct?: Product | null }) {
  const saveProduct = useSaveProduct();
  const [name, setName] = useState(editingProduct?.name || '');
  const [unit, setUnit] = useState(editingProduct?.unit || 'ml');
  const [packageCost, setPackageCost] = useState(editingProduct ? String(editingProduct.packageCost).replace('.', ',') : '');
  const [packageQty, setPackageQty] = useState(editingProduct ? String(editingProduct.packageQty).replace('.', ',') : '');
  const [salePrice, setSalePrice] = useState(editingProduct?.salePrice ? String(editingProduct.salePrice).replace('.', ',') : '');
  const [kind, setKind] = useState<'operacional' | 'descartavel'>(editingProduct?.kind || 'operacional');
  const [expiresAt, setExpiresAt] = useState(editingProduct?.expiresAt || '');
  const [error, setError] = useState<string | null>(null);

  const perUnit = numOr0(packageQty) > 0 ? numOr0(packageCost) / numOr0(packageQty) : 0;

  async function onSave() {
    if (!name.trim() || numOr0(packageQty) <= 0) {
      setError('Preencha o nome e a quantidade no pacote.');
      return;
    }
    try {
      await saveProduct.mutateAsync({
        id: editingProduct?.id,
        name: name.trim(),
        unit,
        packageCost: numOr0(packageCost),
        packageQty: numOr0(packageQty),
        salePrice: numOr0(salePrice),
        kind,
        expiresAt: expiresAt || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Modal title={editingProduct ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <div className="tab-row">
        <button className={'tab' + (kind === 'operacional' ? ' active-income' : '')} onClick={() => setKind('operacional')}>
          Estoque operacional
        </button>
        <button className={'tab' + (kind === 'descartavel' ? ' active-accent' : '')} onClick={() => setKind('descartavel')}>
          Descartável
        </button>
      </div>
      <label className="field">
        Nome
        <input className="input" placeholder="Ex: Creme hidratante" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          Unidade
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Product['unit'])}>
            <option value="ml">ml</option>
            <option value="g">g</option>
            <option value="unidade">unidade</option>
          </select>
        </label>
        <label className="field">
          Qtd no pacote
          <input className="input" inputMode="decimal" value={packageQty} onChange={(e) => setPackageQty(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Custo do pacote (R$)
        <input className="input" inputMode="decimal" placeholder="0,00" value={packageCost} onChange={(e) => setPackageCost(e.target.value)} />
      </label>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        {fmtBRL(perUnit)} / {UNIT_LABEL[unit] || unit}
      </div>
      <label className="field">
        Preço de venda (opcional — se vender esse produto pronto)
        <input className="input" inputMode="decimal" placeholder="0,00" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
      </label>
      {!editingProduct && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          O produto entra cadastrado com estoque zerado — use o botão <strong>+ Entrada</strong> no Estoque pra registrar a primeira compra (e lançar como saída no caixa, se quiser).
        </div>
      )}
      <label className="field">
        Validade (opcional)
        <input className="input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveProduct.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
