import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { useCategories, useClients, useDeleteTransaction, useEquipment, useProducts, useSaveTransaction, useServices, useSettings, useTransaction } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import type { PaymentMethod, Transaction } from '../api/types';
import { fmtBRL, numOr0, parseNumberBR, PAYMENT_LABEL, todayStr, UNIT_LABEL } from '../format';
import { computeServiceCostPreview, feePctForPreview } from '../calcPreview';

type Mode = 'despesa' | 'receita' | 'socio';

interface ItemRow {
  id: string;
  kind: 'product' | 'equipment';
  refId: string;
  qty: string;
}
interface SaleRow {
  id: string;
  productId: string;
  qty: string;
}

let rowSeq = 0;
const nextRowId = () => 'row_' + ++rowSeq;

function TransactionForm({
  onClose,
  editingTx,
  defaultType,
  defaultClientId,
  lockType,
}: {
  onClose: () => void;
  editingTx?: Transaction | null;
  defaultType?: 'receita' | 'despesa';
  defaultClientId?: string;
  lockType?: boolean;
}) {
  const { data: categories = [] } = useCategories();
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useServices();
  const { data: products = [] } = useProducts();
  const { data: equipment = [] } = useEquipment();
  const { data: settings } = useSettings();
  const saveTx = useSaveTransaction();
  const deleteTx = useDeleteTransaction();
  const { isOwner } = useAuth();

  const [mode, setMode] = useState<Mode>(editingTx?.capital ? 'socio' : (editingTx?.type as Mode) || defaultType || 'despesa');
  const [amount, setAmount] = useState(editingTx ? String(editingTx.amount).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState(editingTx?.categoryId || '');
  const [clientId, setClientId] = useState(editingTx?.clientId || defaultClientId || '');
  const [serviceId, setServiceId] = useState(editingTx?.serviceId || '');
  const [date, setDate] = useState(editingTx?.date || todayStr());
  const [note, setNote] = useState(editingTx?.note || '');
  const [items, setItems] = useState<ItemRow[]>(
    editingTx?.items.map((it) => ({ id: nextRowId(), kind: it.kind, refId: (it.productId || it.equipmentId)!, qty: String(it.qty) })) || []
  );
  const [sales, setSales] = useState<SaleRow[]>(editingTx?.sales.map((sl) => ({ id: nextRowId(), productId: sl.productId, qty: String(sl.qty) })) || []);
  const [distanciaKm, setDistanciaKm] = useState(editingTx?.distanciaKm ? String(editingTx.distanciaKm) : '');
  const [payment, setPayment] = useState(editingTx?.payment || 'pix');
  const [capital, setCapital] = useState<'aporte' | 'pagamento'>(editingTx?.capital || 'aporte');
  const [capitalKind, setCapitalKind] = useState<'capital' | 'emprestimo'>(editingTx?.capitalKind || 'capital');
  const [socio, setSocio] = useState(editingTx?.socio || '');
  const [error, setError] = useState<string | null>(null);

  const despesaCats = categories.filter((c) => c.type === 'despesa');
  const receitaCats = categories.filter((c) => c.type === 'receita');
  const catOptions = mode === 'receita' ? receitaCats : despesaCats;

  // Keeps categoryId valid whenever categories finish loading or the mode
  // changes — covers both "opened directly in receita mode" (no tab click
  // ever fires) and "categories weren't cached yet when the modal mounted".
  useEffect(() => {
    if (mode === 'socio') return;
    const opts = mode === 'receita' ? receitaCats : despesaCats;
    if (opts.length && !opts.some((c) => c.id === categoryId)) {
      setCategoryId(opts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, categories]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    if (next === 'despesa') {
      setCategoryId((c) => (despesaCats.some((x) => x.id === c) ? c : despesaCats[0]?.id || ''));
      setServiceId('');
      setItems([]);
    } else if (next === 'receita') {
      setCategoryId((c) => (receitaCats.some((x) => x.id === c) ? c : receitaCats[0]?.id || ''));
    }
  }

  function onSelectService(id: string) {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) {
      if (!amount) setAmount(String(svc.price).replace('.', ','));
      setItems(svc.items.map((it) => ({ id: nextRowId(), kind: it.kind, refId: (it.productId || it.equipmentId)!, qty: String(it.qty) })));
    } else {
      setItems([]);
    }
  }

  function addItem() {
    const kind = products[0] ? 'product' : 'equipment';
    const refId = products[0]?.id || equipment[0]?.id || '';
    setItems((cur) => [...cur, { id: nextRowId(), kind, refId, qty: '' }]);
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

  const sellableProducts = products.filter((p) => numOr0(p.salePrice) > 0);
  function addSale() {
    if (!sellableProducts[0]) {
      window.alert('Cadastre um produto com preço de venda no Catálogo primeiro.');
      return;
    }
    setSales((cur) => [...cur, { id: nextRowId(), productId: sellableProducts[0].id, qty: '1' }]);
  }
  function updateSale(id: string, patch: Partial<SaleRow>) {
    setSales((cur) => {
      const next = cur.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl));
      applySalesDelta(cur, next);
      return next;
    });
  }
  function removeSale(id: string) {
    setSales((cur) => {
      const next = cur.filter((sl) => sl.id !== id);
      applySalesDelta(cur, next);
      return next;
    });
  }
  function salesTotal(list: SaleRow[]) {
    return list.reduce((a, sl) => {
      const p = products.find((x) => x.id === sl.productId);
      return a + numOr0(sl.qty) * (p ? numOr0(p.salePrice) : 0);
    }, 0);
  }
  function applySalesDelta(prev: SaleRow[], next: SaleRow[]) {
    const diff = salesTotal(next) - salesTotal(prev);
    setAmount((cur) => {
      const novo = Math.max(0, Math.round((numOr0(cur) + diff) * 100) / 100);
      return novo ? String(novo).replace('.', ',') : '';
    });
  }

  const variableCostPreview = useMemo(
    () => computeServiceCostPreview(items.map((it) => ({ kind: it.kind, refId: it.refId, qty: it.qty })), products, equipment, settings) + numOr0(distanciaKm) * numOr0(settings?.costPerKm),
    [items, products, equipment, settings, distanciaKm]
  );
  const feePct = feePctForPreview(payment, settings);
  const feeVal = (numOr0(amount) * feePct) / 100;
  const salesTotalNow = salesTotal(sales);

  async function onSave() {
    setError(null);
    // Parse once and reject bad input explicitly — silently coercing a typo to
    // 0 (or to a truncated amount) would write a wrong number into the ledger.
    const parsedAmount = parseNumberBR(amount);
    if (parsedAmount == null || parsedAmount <= 0) {
      setError(amount.trim() === '' ? 'Preencha o valor.' : `Valor inválido: "${amount}". Use apenas números, ex: 1.500,00`);
      return;
    }
    try {
      if (mode === 'socio') {
        if (!socio.trim()) {
          setError('Preencha o nome do sócio.');
          return;
        }
        await saveTx.mutateAsync({ id: editingTx?.id, type: 'receita', amount: parsedAmount, date, note, capital, capitalKind, socio: socio.trim() });
      } else {
        if (!categoryId) {
          setError('Escolha a categoria.');
          return;
        }
        await saveTx.mutateAsync({
          id: editingTx?.id,
          type: mode,
          amount: parsedAmount,
          categoryId,
          clientId: clientId || null,
          serviceId: mode === 'receita' ? serviceId || null : null,
          date,
          note,
          items: mode === 'receita' ? items.filter((it) => it.refId && numOr0(it.qty) > 0).map((it) => ({ kind: it.kind, refId: it.refId, qty: numOr0(it.qty) })) : [],
          sales: mode === 'receita' ? sales.filter((sl) => sl.productId && numOr0(sl.qty) > 0).map((sl) => ({ productId: sl.productId, qty: numOr0(sl.qty) })) : [],
          distanciaKm: mode === 'receita' ? numOr0(distanciaKm) : 0,
          payment: mode === 'receita' ? payment : null,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  async function onDelete() {
    if (!editingTx) return;
    if (!window.confirm('Excluir este lançamento?')) return;
    await deleteTx.mutateAsync(editingTx.id);
    onClose();
  }

  const titleFor = () => {
    if (editingTx) return 'Editar lançamento';
    if (lockType && defaultType === 'receita') return 'Registrar atendimento';
    if (lockType && defaultType === 'despesa') return 'Lançar despesa';
    return 'Novo lançamento';
  };

  return (
    <Modal title={titleFor()} onClose={onClose}>
      {!(lockType && !editingTx) && (
        <div className="tab-row">
          <button className={'tab' + (mode === 'despesa' ? ' active-expense' : '')} onClick={() => switchMode('despesa')}>
            Despesa
          </button>
          <button className={'tab' + (mode === 'receita' ? ' active-income' : '')} onClick={() => switchMode('receita')}>
            Receita
          </button>
          <button className={'tab' + (mode === 'socio' ? ' active-accent' : '')} onClick={() => switchMode('socio')}>
            Sócio
          </button>
        </div>
      )}

      {mode === 'socio' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="tab-row">
            <button className={'tab' + (capital === 'aporte' ? ' active-income' : '')} onClick={() => setCapital('aporte')}>
              Aporte (entra dinheiro)
            </button>
            <button className={'tab' + (capital === 'pagamento' ? ' active-expense' : '')} onClick={() => setCapital('pagamento')}>
              Pagar sócio (sai dinheiro)
            </button>
          </div>
          <label className="field">
            Sócio
            <input className="input" placeholder="Nome do sócio" value={socio} onChange={(e) => setSocio(e.target.value)} />
          </label>
          <label className="field">
            Valor
            <input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="field">
            O dinheiro será devolvido?
            <div className="tab-row">
              <button className={'tab' + (capitalKind === 'capital' ? ' active-income' : '')} onClick={() => setCapitalKind('capital')}>
                Não — vira capital (PL)
              </button>
              <button className={'tab' + (capitalKind === 'emprestimo' ? ' active-expense' : '')} onClick={() => setCapitalKind('emprestimo')}>
                Sim — empréstimo (passivo)
              </button>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Aportes e pagamentos de sócio entram no caixa, mas ficam fora do resultado (DRE), da meta e do pró-labore.
          </div>
        </div>
      ) : (
        <>
          {mode === 'receita' && (
            <label className="field">
              Forma de pagamento
              <select className="input" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-muted)' }}>
                {feePct <= 0 ? 'Sem taxa — entra 100% no caixa.' : `Taxa de ${feePct}%${feeVal > 0 ? ` = ${fmtBRL(feeVal)} lançados como despesa` : ''}`}
              </span>
            </label>
          )}

          {mode === 'receita' && (
            <label className="field">
              Serviço prestado (opcional)
              <select className="input" value={serviceId} onChange={(e) => onSelectService(e.target.value)}>
                <option value="">Nenhum / outro</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'receita' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>Itens usados neste atendimento</div>
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
                    <input
                      className="input"
                      style={{ width: 56, flex: 'none', padding: '8px 10px', fontSize: 12.5 }}
                      inputMode="decimal"
                      placeholder="0"
                      value={it.qty}
                      onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 'none', width: 26 }}>{itemQtyUnit(it)}</span>
                    <button className="icon-btn" aria-label="Remover item" onClick={() => removeItem(it.id)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button className="pill ghost sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={addItem}>
                + Adicionar item (ex: creme a mais)
              </button>
              <label className="field" style={{ marginTop: 12 }}>
                Distância até o cliente (km, opcional)
                <input className="input" inputMode="decimal" placeholder="0" value={distanciaKm} onChange={(e) => setDistanciaKm(e.target.value)} />
              </label>
              {(items.length > 0 || numOr0(distanciaKm) > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10, marginTop: 10 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Custo variável estimado (itens + desloc.)</span>
                  <span style={{ fontWeight: 600 }}>{fmtBRL(variableCostPreview)}</span>
                </div>
              )}
            </div>
          )}

          <label className="field">
            Valor
            <input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>

          {mode === 'receita' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>Produtos vendidos (opcional)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sales.map((sl) => {
                  const p = products.find((x) => x.id === sl.productId);
                  const total = numOr0(sl.qty) * (p ? numOr0(p.salePrice) : 0);
                  return (
                    <div key={sl.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="input" style={{ flex: 1, minWidth: 0, padding: '8px 8px', fontSize: 12.5 }} value={sl.productId} onChange={(e) => updateSale(sl.id, { productId: e.target.value })}>
                        {sellableProducts.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name} — {fmtBRL(opt.salePrice)}
                          </option>
                        ))}
                      </select>
                      <input className="input" style={{ width: 56, flex: 'none', padding: '8px 10px', fontSize: 12.5 }} inputMode="decimal" placeholder="qtd" value={sl.qty} onChange={(e) => updateSale(sl.id, { qty: e.target.value })} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 'none', width: 80 }}>{fmtBRL(total)}</span>
                      <button className="icon-btn" aria-label="Remover produto vendido" onClick={() => removeSale(sl.id)}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <button className="pill ghost sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={addSale}>
                + Vender produto (baixa do estoque)
              </button>
              {sales.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10, marginTop: 10 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total das vendas (já somado no valor)</span>
                  <span style={{ fontWeight: 600 }}>{fmtBRL(salesTotalNow)}</span>
                </div>
              )}
            </div>
          )}

          <label className="field">
            Categoria
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

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
        </>
      )}

      <label className="field">
        Data
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        Nota (opcional)
        <input className="input" placeholder="Ex: creme + descartáveis" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <div className="auth-error">{error}</div>}

      <div className="modal-actions">
        {isOwner && editingTx && (
          <button className="btn-danger-text" onClick={onDelete}>
            Excluir
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-secondary" onClick={onClose}>
          {isOwner ? 'Cancelar' : 'Fechar'}
        </button>
        {isOwner && (
          <button className="btn-primary" onClick={onSave} disabled={saveTx.isPending}>
            Salvar
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Public entry point — accepts either an id to edit (fetched on demand) or nothing for a new transaction. */
export default function TransactionModal({
  onClose,
  editingTxId,
  defaultType,
  defaultClientId,
  lockType,
}: {
  onClose: () => void;
  editingTxId?: string | null;
  defaultType?: 'receita' | 'despesa';
  defaultClientId?: string;
  lockType?: boolean;
}) {
  const { data: editingTx, isLoading } = useTransaction(editingTxId);
  if (editingTxId && isLoading) return null;
  return <TransactionForm onClose={onClose} editingTx={editingTx} defaultType={defaultType} defaultClientId={defaultClientId} lockType={lockType} />;
}
