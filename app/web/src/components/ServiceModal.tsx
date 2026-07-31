import { useMemo, useState } from 'react';
import Modal from './Modal';
import { useCategories, useEquipment, useProducts, useResultadoReport, useSaveService, useSettings } from '../api/hooks';
import type { Service } from '../api/types';
import { fmtBRL, numOr0, UNIT_LABEL } from '../format';
import { computeServiceCostPreview } from '../calcPreview';

interface ItemRow {
  id: string;
  kind: 'product' | 'equipment';
  refId: string;
  qty: string;
}
let seq = 0;
const nextId = () => 'svcitem_' + ++seq;

export default function ServiceModal({ onClose, editingService }: { onClose: () => void; editingService?: Service | null }) {
  const { data: products = [] } = useProducts();
  const { data: equipment = [] } = useEquipment();
  // Managed in the Categorias tab (type 'servico') — create/rename/expand there.
  const { data: categories = [] } = useCategories();
  const { data: settings } = useSettings();
  const { data: resultado } = useResultadoReport('month', 0, 0);
  const saveService = useSaveService();

  const [name, setName] = useState(editingService?.name || '');
  const [category, setCategory] = useState(editingService?.category || '');
  const [price, setPrice] = useState(editingService ? String(editingService.price).replace('.', ',') : '');
  const [items, setItems] = useState<ItemRow[]>(
    editingService?.items.map((it) => ({ id: nextId(), kind: it.kind, refId: (it.productId || it.equipmentId)!, qty: String(it.qty) })) ||
      (products[0] ? [{ id: nextId(), kind: 'product', refId: products[0].id, qty: '' }] : [])
  );
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    const kind = products[0] ? 'product' : 'equipment';
    const refId = products[0]?.id || equipment[0]?.id || '';
    setItems((cur) => [...cur, { id: nextId(), kind, refId, qty: '' }]);
  }
  function updateItem(id: string, patch: Partial<ItemRow>) {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(id: string) {
    setItems((cur) => cur.filter((it) => it.id !== id));
  }
  function itemQtyUnit(it: ItemRow) {
    if (it.kind === 'equipment') {
      const eq = equipment.find((x) => x.id === it.refId);
      const isMaq = eq && (eq.kind || (eq.kwh > 0 ? 'maquina' : 'utensilio')) === 'maquina';
      return isMaq ? 'min' : 'un';
    }
    const p = products.find((x) => x.id === it.refId);
    return p ? UNIT_LABEL[p.unit] || p.unit : '';
  }

  const cost = useMemo(() => computeServiceCostPreview(items.map((it) => ({ kind: it.kind, refId: it.refId, qty: it.qty })), products, equipment, settings), [items, products, equipment, settings]);
  const despPorAtend = resultado?.despPorAtend || 0;
  const precoMinimo = cost + despPorAtend;

  async function onSave() {
    if (!name.trim()) {
      setError('Informe o nome do serviço.');
      return;
    }
    try {
      await saveService.mutateAsync({
        id: editingService?.id,
        name: name.trim(),
        category: category.trim() || null,
        price: numOr0(price),
        items: items.filter((it) => it.refId && numOr0(it.qty) > 0).map((it) => ({ kind: it.kind, refId: it.refId, qty: numOr0(it.qty) })),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Modal title={editingService ? 'Editar serviço' : 'Novo serviço'} onClose={onClose} wide>
      <div className="field-row">
        <label className="field">
          Nome
          <input className="input" placeholder="Ex: Limpeza básica" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Categoria (opcional)
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Sem categoria</option>
            {/* An old free-typed name that isn't in the managed list anymore
                still shows, so editing doesn't silently drop it. */}
            {category && !categories.some((c) => c.type === 'servico' && c.name === category) && <option value={category}>{category}</option>}
            {categories
              .filter((c) => c.type === 'servico')
              .map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>
          <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-muted)' }}>Pra criar ou renomear categorias, use a aba Categorias.</span>
        </label>
      </div>
      <label className="field">
        Preço cobrado (R$)
        <input className="input" inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>

      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>Ficha técnica (produtos e bens usados)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="input"
                style={{ flex: 'none', width: 96, padding: '8px 8px', fontSize: 12.5 }}
                value={it.kind}
                onChange={(e) => {
                  const kind = e.target.value as 'product' | 'equipment';
                  const list = kind === 'product' ? products : equipment;
                  updateItem(it.id, { kind, refId: list[0]?.id || '' });
                }}
              >
                <option value="product">Produto</option>
                <option value="equipment">Equipam.</option>
              </select>
              <select className="input" style={{ flex: 1, minWidth: 0, padding: '8px 8px', fontSize: 12.5 }} value={it.refId} onChange={(e) => updateItem(it.id, { refId: e.target.value })}>
                {(it.kind === 'product' ? products : equipment).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
              <input className="input" style={{ width: 56, flex: 'none', padding: '8px 10px', fontSize: 12.5 }} inputMode="decimal" placeholder="0" value={it.qty} onChange={(e) => updateItem(it.id, { qty: e.target.value })} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 'none', width: 26 }}>{itemQtyUnit(it)}</span>
              <button className="icon-btn" aria-label="Remover item da ficha" onClick={() => removeItem(it.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="pill ghost sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={addItem}>
          + Adicionar item
        </button>
      </div>

      <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>Custo variável</span>
          <span style={{ fontWeight: 600 }}>{fmtBRL(cost)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>Preço mínimo (custo + rateio de despesas)</span>
          <span style={{ fontWeight: 600 }}>{fmtBRL(precoMinimo)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          50%: {fmtBRL(precoMinimo / 0.5)} · 60%: {fmtBRL(precoMinimo / 0.4)} · 70%: {fmtBRL(precoMinimo / 0.3)}
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveService.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
