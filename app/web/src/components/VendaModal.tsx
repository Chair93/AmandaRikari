import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useClients, useProducts, useSaveTransaction, useSettings } from '../api/hooks';
import type { PaymentMethod } from '../api/types';
import { fmtBRL, numOr0, parseNumberBR, PAYMENT_LABEL, todayStr } from '../format';

const un = (v: number) => Math.round(v * 100) / 100;
import { feePctForPreview } from '../calcPreview';

interface Row {
  id: string;
  productId: string;
  qty: string;
  /** Charged unit price — starts at the registered salePrice; lowering it is the discount. */
  price: string;
}

let seq = 0;
const nextId = () => 'v' + ++seq;

/** Direct product sale: pick products, see the registered price and current
 *  stock, adjust price for discounts, choose payment — one save writes the
 *  receita ("Venda de produtos") and takes the units off the shelf. */
export default function VendaModal({ onClose }: { onClose: () => void }) {
  const { data: products = [] } = useProducts();
  const { data: clients = [] } = useClients();
  const { data: settings } = useSettings();
  const saveTx = useSaveTransaction();

  const sellable = products.filter((p) => numOr0(p.salePrice) > 0);
  const [rows, setRows] = useState<Row[]>([]);
  const [clientId, setClientId] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('pix');
  const [parcelas, setParcelas] = useState(1);
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);

  // Seed the first row once products arrive.
  useEffect(() => {
    if (rows.length === 0 && sellable.length > 0) {
      setRows([{ id: nextId(), productId: sellable[0].id, qty: '1', price: String(sellable[0].salePrice).replace('.', ',') }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  function addRow() {
    if (!sellable[0]) return;
    setRows((cur) => [...cur, { id: nextId(), productId: sellable[0].id, qty: '1', price: String(sellable[0].salePrice).replace('.', ',') }]);
  }
  function updateRow(id: string, patch: Partial<Row>) {
    setRows((cur) =>
      cur.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Picking another product resets the price to its registered one.
        if (patch.productId && patch.productId !== r.productId) {
          const p = products.find((x) => x.id === patch.productId);
          next.price = p ? String(p.salePrice).replace('.', ',') : '';
        }
        return next;
      })
    );
  }
  function removeRow(id: string) {
    setRows((cur) => cur.filter((r) => r.id !== id));
  }

  const totalTabela = rows.reduce((a, r) => {
    const p = products.find((x) => x.id === r.productId);
    return a + numOr0(r.qty) * (p ? numOr0(p.salePrice) : 0);
  }, 0);
  const total = rows.reduce((a, r) => a + numOr0(r.qty) * numOr0(r.price), 0);
  const desconto = Math.max(0, Math.round((totalTabela - total) * 100) / 100);
  const feePct = feePctForPreview(payment, settings, payment === 'credito' ? parcelas : undefined);
  const feeVal = (total * feePct) / 100;
  const semEstoque = rows.some((r) => {
    const p = products.find((x) => x.id === r.productId);
    return p && numOr0(r.qty) > numOr0(p.stock);
  });

  async function onSave() {
    setError(null);
    const validas = rows.filter((r) => r.productId && numOr0(r.qty) > 0);
    if (validas.length === 0) {
      setError('Adicione pelo menos um produto com quantidade.');
      return;
    }
    for (const r of validas) {
      if (parseNumberBR(r.price) == null) {
        setError(`Preço inválido: "${r.price}"`);
        return;
      }
    }
    if (total <= 0) {
      setError('O total da venda precisa ser maior que zero.');
      return;
    }
    try {
      await saveTx.mutateAsync({
        type: 'receita',
        amount: Math.round(total * 100) / 100,
        clientId: clientId || null,
        date,
        note: desconto > 0.005 ? `Venda com desconto de ${fmtBRL(desconto)}` : null,
        sales: validas.map((r) => ({ productId: r.productId, qty: numOr0(r.qty) })),
        payment,
        parcelas: payment === 'credito' ? parcelas : null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  if (products.length > 0 && sellable.length === 0) {
    return (
      <Modal title="Vender produto" onClose={onClose}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Nenhum produto tem <strong>preço de venda</strong> cadastrado ainda. Abra o produto no Estoque e preencha o campo "Preço de venda" — aí ele aparece aqui.
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Vender produto" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => {
          const p = products.find((x) => x.id === r.productId);
          const rowTotal = numOr0(r.qty) * numOr0(r.price);
          const estouro = p && numOr0(r.qty) > numOr0(p.stock);
          return (
            <div key={r.id} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className="input" style={{ flex: 1, minWidth: 0, padding: '8px 8px', fontSize: 12.5 }} value={r.productId} onChange={(e) => updateRow(r.id, { productId: e.target.value })}>
                  {sellable.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} — {fmtBRL(opt.salePrice)}
                    </option>
                  ))}
                </select>
                {rows.length > 1 && (
                  <button className="icon-btn" aria-label="Remover produto" onClick={() => removeRow(r.id)}>
                    ×
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Qtd
                  <input className="input" style={{ width: 52, padding: '7px 9px', fontSize: 12.5 }} inputMode="decimal" value={r.qty} onChange={(e) => updateRow(r.id, { qty: e.target.value })} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Preço un.
                  <input className="input" style={{ width: 78, padding: '7px 9px', fontSize: 12.5 }} inputMode="decimal" value={r.price} onChange={(e) => updateRow(r.id, { price: e.target.value })} />
                </label>
                <span style={{ fontSize: 12.5, fontWeight: 700, marginLeft: 'auto' }}>{fmtBRL(rowTotal)}</span>
              </div>
              {p && (
                <div style={{ fontSize: 11, color: estouro ? 'var(--expense-text)' : 'var(--text-muted)' }}>
                  {estouro ? `⚠️ Só ${un(numOr0(p.stock))} un em estoque — confira antes de vender ${numOr0(r.qty)}` : `${un(numOr0(p.stock))} un em estoque`}
                  {p.salePrice > 0 && numOr0(r.price) < p.salePrice - 0.005 && ` · desconto de ${fmtBRL((p.salePrice - numOr0(r.price)) * numOr0(r.qty))}`}
                </div>
              )}
            </div>
          );
        })}
        <button className="pill ghost sm" style={{ paddingLeft: 0, alignSelf: 'flex-start' }} onClick={addRow}>
          + Outro produto
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10 }}>
        <span style={{ color: 'var(--text-muted)' }}>
          Total{desconto > 0.005 && <span> · tabela {fmtBRL(totalTabela)} − desconto {fmtBRL(desconto)}</span>}
        </span>
        <span style={{ fontWeight: 700 }}>{fmtBRL(total)}</span>
      </div>

      <label className="field">
        Forma de pagamento
        <select className="input" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
          {Object.entries(PAYMENT_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {payment === 'credito' && (
          <select className="input" style={{ marginTop: 6 }} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
            <option value={1}>1x — à vista (ou parcelado com juros por conta do cliente)</option>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n}x — taxa sua
              </option>
            ))}
          </select>
        )}
        <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-muted)' }}>
          {feePct <= 0 ? 'Sem taxa — entra 100% no caixa.' : `Taxa de ${feePct}% = ${fmtBRL(feeVal)} lançados como despesa`}
        </span>
      </label>

      <div className="field-row">
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
        <label className="field">
          Data
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveTx.isPending}>
          {semEstoque ? 'Vender mesmo assim' : 'Registrar venda'}
        </button>
      </div>
    </Modal>
  );
}
