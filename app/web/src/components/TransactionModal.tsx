import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import PromptModal from './PromptModal';
import { useCategories, useClients, useDeleteTransaction, useDevolverTransacao, useEquipment, useProductInventario, useProducts, useSaveTransaction, useServices, useSettings, useTransaction } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import type { PaymentMethod, Product, Settings, Transaction } from '../api/types';
import { fmtBRL, numOr0, parseNumberBR, PAYMENT_LABEL, todayStr, UNIT_LABEL } from '../format';
import { computeServiceCostPreview, feePctForPreview } from '../calcPreview';

/** Option label with the registered rate: "3x — taxa 6,85%". */
function parcelaLabel(n: number, settings: Settings | undefined) {
  const pct = feePctForPreview('credito', settings, n >= 2 ? n : undefined);
  return `${n}x — ` + (pct > 0 ? `taxa ${String(pct).replace('.', ',')}%` : 'sem taxa cadastrada');
}


// Categories the app creates and manages by itself (sócio flows, machine
// fees, package machinery...). Picking one by hand only creates confusion —
// they stay out of the dropdown, except when editing an old entry that
// already uses one.
const INTERNAL_CATEGORIES = new Set([
  'Aporte de sócio',
  'Pagamento a sócio',
  'Pacote pré-pago',
  'Sessão de pacote',
  'Taxas de maquininha',
  'Uso de sala',
  'Perda de inventário',
  'Ganho de inventário',
  'Contas a pagar',
  'Contas a receber',
  'Sinal de agendamento',
  'Devoluções',
  'Brinde / uso interno',
  'Depreciação',
]);

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
  defaultServiceId,
  defaultServiceIds,
  defaultDate,
  appointmentId,
  sinalValor,
  onSaved,
  lockType,
}: {
  onClose: () => void;
  editingTx?: Transaction | null;
  defaultType?: 'receita' | 'despesa';
  defaultClientId?: string;
  /** Pre-fills service + items/price — used when registering from the Agenda. */
  defaultServiceId?: string;
  /** Agenda booking with several procedures: prices sum, fichas merge, the
   *  first one becomes the tx's serviceId and the note records the combo. */
  defaultServiceIds?: string[];
  defaultDate?: string;
  /** Agenda appointment to link the created atendimento to. */
  appointmentId?: string;
  /** Reservation deposit already received for this booking — the price
   *  prefill comes net of it and a banner explains the math. */
  sinalValor?: number;
  /** Called after a successful save (before closing) — the Agenda uses it
   *  to offer booking the next session. */
  onSaved?: () => void;
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
  const [date, setDate] = useState(editingTx?.date || defaultDate || todayStr());
  const [note, setNote] = useState(editingTx?.note || '');
  const [items, setItems] = useState<ItemRow[]>(
    editingTx?.items.map((it) => ({ id: nextRowId(), kind: it.kind, refId: (it.productId || it.equipmentId)!, qty: String(it.qty) })) || []
  );
  const [sales, setSales] = useState<SaleRow[]>(editingTx?.sales.map((sl) => ({ id: nextRowId(), productId: sl.productId, qty: String(sl.qty) })) || []);
  const [distanciaKm, setDistanciaKm] = useState(editingTx?.distanciaKm ? String(editingTx.distanciaKm) : '');
  const [payment, setPayment] = useState(editingTx?.payment || 'pix');
  const [parcelas, setParcelas] = useState(editingTx?.parcelas || 1);
  // Fiado: what actually enters the caixa today; the rest becomes a
  // receivable on the client's name.
  const [recebimento, setRecebimento] = useState<'agora' | 'depois' | 'parte'>('agora');
  const [valorRecebido, setValorRecebido] = useState('');
  const [fiadoVenc, setFiadoVenc] = useState('');
  // Split payment (misto): part of the total goes through a second method.
  const [dividir, setDividir] = useState(!!editingTx?.payment2);
  const [payment2, setPayment2] = useState<PaymentMethod>((editingTx?.payment2 as PaymentMethod) || 'credito');
  const [valor2, setValor2] = useState(editingTx?.valor2 ? String(editingTx.valor2).replace('.', ',') : '');
  const [parcelas2, setParcelas2] = useState(editingTx?.parcelas2 || 1);
  const [devolvendo, setDevolvendo] = useState(false);
  const devolver = useDevolverTransacao();
  // Sala alugada: mode and value live on the entry itself (Ajustes only keeps
  // the last used values as prefill). Editing recovers the mode from the fee
  // note ("Uso da sala — 20%" = pct) and the value from it or the fee amount.
  const salaNotePct = editingTx?.salaFeeNote?.match(/([\d.,]+)\s*%/);
  const [usarSala, setUsarSala] = useState(editingTx?.salaFee != null);
  const [salaModo, setSalaModo] = useState<'fixo' | 'pct'>(editingTx?.salaFee != null ? (salaNotePct ? 'pct' : 'fixo') : 'pct');
  const [salaValor, setSalaValor] = useState(editingTx?.salaFee != null ? (salaNotePct ? salaNotePct[1] : String(editingTx.salaFee).replace('.', ',')) : '');
  const [salaPrefilled, setSalaPrefilled] = useState(!!editingTx);
  useEffect(() => {
    // New entry: prefill with the last values used, once settings arrive.
    if (salaPrefilled || !settings) return;
    setSalaPrefilled(true);
    if (settings.salaMode === 'fixo' && settings.salaFixo > 0) {
      setSalaModo('fixo');
      setSalaValor(String(settings.salaFixo).replace('.', ','));
    } else if (settings.salaPct > 0) {
      setSalaModo('pct');
      setSalaValor(String(settings.salaPct).replace('.', ','));
    }
  }, [settings, salaPrefilled]);
  const [capital, setCapital] = useState<'aporte' | 'pagamento'>(editingTx?.capital || 'aporte');
  const [capitalKind, setCapitalKind] = useState<'capital' | 'emprestimo'>(editingTx?.capitalKind || 'capital');
  const [socio, setSocio] = useState(editingTx?.socio || '');
  const [error, setError] = useState<string | null>(null);
  // Products this atendimento just emptied — the save holds the modal open
  // to ask "acabou mesmo?" while the answer is fresh.
  const [esgotados, setEsgotados] = useState<Product[]>([]);

  const pickable = (c: { id: string; name: string }) => !INTERNAL_CATEGORIES.has(c.name) || c.id === categoryId;
  const despesaCats = categories.filter((c) => c.type === 'despesa' && pickable(c));
  const receitaCats = categories.filter((c) => c.type === 'receita' && pickable(c));
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

  // Coming from the Agenda: apply the appointment's service once services
  // arrive (they may still be loading when the modal mounts). Runs at most
  // once so it never clobbers what the user changed by hand.
  const [serviceApplied, setServiceApplied] = useState(false);
  useEffect(() => {
    const ids = defaultServiceIds?.length ? defaultServiceIds : defaultServiceId ? [defaultServiceId] : [];
    if (serviceApplied || ids.length === 0 || editingTx || services.length === 0) return;
    setServiceApplied(true);
    // Prices sum (netting out any sinal already paid), fichas merge, the
    // first service becomes the tx's serviceId, the note records the combo.
    const svcs = ids.map((id) => services.find((s) => s.id === id)).filter((s): s is (typeof services)[number] => !!s);
    setServiceId(ids[0]);
    if (!amount) {
      const bruto = Math.round(svcs.reduce((a, s) => a + numOr0(s.price), 0) * 100) / 100;
      const total = Math.max(0, Math.round((bruto - (sinalValor || 0)) * 100) / 100);
      if (total > 0) setAmount(String(total).replace('.', ','));
    }
    setItems(svcs.flatMap((s) => s.items.map((it) => ({ id: nextRowId(), kind: it.kind, refId: (it.productId || it.equipmentId)!, qty: String(it.qty) }))));
    const comboNote = svcs.length > 1 ? svcs.map((s) => s.name).join(' + ') : '';
    const sinalNote = sinalValor ? `sinal de ${fmtBRL(sinalValor)} abatido` : '';
    setNote((n) => n || [comboNote, sinalNote].filter(Boolean).join(' — '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, serviceApplied, defaultServiceId, defaultServiceIds, editingTx]);

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
  const feePct = feePctForPreview(payment, settings, payment === 'credito' ? parcelas : undefined);
  const v2 = numOr0(valor2);
  const mistoAtivo = mode === 'receita' && recebimento === 'agora' && dividir && v2 > 0 && v2 < numOr0(amount);
  const fee2Pct = feePctForPreview(payment2, settings, payment2 === 'credito' ? parcelas2 : undefined);
  const feeVal = mistoAtivo ? ((numOr0(amount) - v2) * feePct) / 100 + (v2 * fee2Pct) / 100 : (numOr0(amount) * feePct) / 100;
  const salesTotalNow = salesTotal(sales);
  const salaOn = settings && settings.salaMode !== 'off';
  const salaVal = salaModo === 'pct' ? Math.round(numOr0(amount) * numOr0(salaValor)) / 100 : numOr0(salaValor);
  const cobraSala = !!(salaOn && serviceId && usarSala);

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
        if (mode === 'receita' && !editingTx && recebimento === 'parte') {
          const vr = parseNumberBR(valorRecebido);
          if (vr == null || vr <= 0 || vr >= parsedAmount) {
            setError('Em "Recebi uma parte", informe quanto entrou agora — maior que zero e menor que o valor total.');
            return;
          }
        }
        if (mode === 'receita' && !editingTx && recebimento !== 'agora' && !clientId) {
          setError('Fiado precisa de um cliente escolhido — é no nome dele que fica a conta a receber.');
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
          parcelas: mode === 'receita' && payment === 'credito' ? parcelas : null,
          recebimento: mode === 'receita' && !editingTx ? recebimento : undefined,
          valorRecebido: mode === 'receita' && !editingTx && recebimento === 'parte' ? parseNumberBR(valorRecebido) : null,
          fiadoVenc: mode === 'receita' && !editingTx && recebimento !== 'agora' ? fiadoVenc || null : null,
          payment2: mistoAtivo ? payment2 : null,
          valor2: mistoAtivo ? v2 : null,
          parcelas2: mistoAtivo && payment2 === 'credito' ? parcelas2 : null,
          usarSala: mode === 'receita' && cobraSala,
          salaModo: mode === 'receita' && cobraSala ? salaModo : null,
          salaValor: mode === 'receita' && cobraSala ? numOr0(salaValor) : null,
          appointmentId: !editingTx && mode === 'receita' ? appointmentId || null : null,
        });
        // Did this atendimento's ficha usage cross any product to zero? Ask
        // now, while she's looking at the pot. Only on new entries — edits
        // reshuffle old numbers and the question would mislead.
        if (!editingTx && mode === 'receita') {
          const consumo: Record<string, number> = {};
          items.filter((it) => it.kind === 'product' && it.refId && numOr0(it.qty) > 0).forEach((it) => (consumo[it.refId] = (consumo[it.refId] || 0) + numOr0(it.qty)));
          const zeraram = products.filter((p) => consumo[p.id] && p.packageQty > 0 && p.stock > 0.005 && p.stock - consumo[p.id] / p.packageQty <= 0.005);
          if (zeraram.length > 0) {
            setEsgotados(zeraram);
            return; // finish (onSaved/onClose) after the prompts
          }
        }
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  async function onDelete() {
    if (!editingTx) return;
    if (!window.confirm('Excluir este lançamento?\n\nEle some do caixa e dos relatórios — e o que veio junto (taxa de maquininha, uso de sala) sai também.')) return;
    await deleteTx.mutateAsync(editingTx.id);
    onClose();
  }

  const titleFor = () => {
    if (editingTx) return 'Editar lançamento';
    if (lockType && defaultType === 'receita') return 'Registrar atendimento';
    if (lockType && defaultType === 'despesa') return 'Lançar despesa';
    return 'Novo lançamento';
  };

  if (esgotados.length > 0) {
    return (
      <EsgotadoPrompt
        products={esgotados}
        onDone={() => {
          setEsgotados([]);
          onSaved?.();
          onClose();
        }}
      />
    );
  }

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
          {/* Field order follows the checkout flow: who → what → when →
              price & payment → costs of delivering → extras → filing. */}
          {mode === 'despesa' && (
            <>
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
                Valor
                <input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="field">
                Data
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

          {mode === 'receita' && (
            <>
              {!editingTx && (sinalValor || 0) > 0 && (
                <div style={{ fontSize: 12.5, padding: '10px 12px', background: 'var(--income-soft)', color: 'var(--income-text)', borderRadius: 10, lineHeight: 1.5 }}>
                  💰 Sinal de <strong>{fmtBRL(sinalValor!)}</strong> já recebido antes — o valor abaixo já vem com ele descontado. Registre só o que falta receber hoje.
                </div>
              )}
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
              <div className="field-row">
                <label className="field">
                  Data
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="field">
                  Valor
                  <input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
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
                    <option value={1}>1x — à vista · {parcelaLabel(1, settings).split(' — ')[1]} (parcelado com juros é por conta do cliente)</option>
                    {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {parcelaLabel(n, settings)}
                      </option>
                    ))}
                  </select>
                )}
                <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {mistoAtivo
                    ? `Taxas das duas partes: ${fmtBRL(feeVal)} lançados como despesa`
                    : feePct <= 0
                      ? 'Sem taxa — entra 100% no caixa.'
                      : `Taxa de ${feePct}%${feeVal > 0 ? ` = ${fmtBRL(feeVal)} lançados como despesa` : ''}`}
                </span>
              </label>

              {recebimento === 'agora' && (
                <div className="field">
                  <button className="pill ghost sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setDividir((x) => !x)}>
                    {dividir ? '× Cancelar divisão' : '➗ Dividir em 2 formas de pagamento'}
                  </button>
                  {dividir && (
                    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12 }}>2ª forma:</span>
                        <select className="input" style={{ width: 150, padding: '8px 8px', fontSize: 12.5 }} value={payment2} onChange={(e) => setPayment2(e.target.value as PaymentMethod)}>
                          {Object.entries(PAYMENT_LABEL).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <span style={{ fontSize: 12 }}>valor:</span>
                        <input className="input" style={{ width: 90, padding: '8px 10px', fontSize: 12.5 }} inputMode="decimal" placeholder="0,00" value={valor2} onChange={(e) => setValor2(e.target.value)} />
                      </div>
                      {payment2 === 'credito' && (
                        <select className="input" style={{ fontSize: 12.5 }} value={parcelas2} onChange={(e) => setParcelas2(Number(e.target.value))}>
                          <option value={1}>1x — à vista</option>
                          {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                            <option key={n} value={n}>
                              {parcelaLabel(n, settings)}
                            </option>
                          ))}
                        </select>
                      )}
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {mistoAtivo
                          ? `${fmtBRL(numOr0(amount) - v2)} no ${PAYMENT_LABEL[payment as PaymentMethod] || payment} + ${fmtBRL(v2)} no ${PAYMENT_LABEL[payment2]}`
                          : 'Digite o valor da 2ª forma — o resto fica na 1ª.'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!editingTx && (
                <div className="field">
                  Recebimento
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className={'pill sm' + (recebimento === 'agora' ? ' active' : '')} onClick={() => setRecebimento('agora')}>
                      Recebi tudo
                    </button>
                    <button className={'pill sm' + (recebimento === 'parte' ? ' active' : '')} onClick={() => setRecebimento('parte')}>
                      Recebi uma parte
                    </button>
                    <button className={'pill sm' + (recebimento === 'depois' ? ' active' : '')} onClick={() => setRecebimento('depois')}>
                      Fica pra depois (fiado)
                    </button>
                  </div>
                  {recebimento !== 'agora' && (
                    <>
                      <div className="field-row">
                        {recebimento === 'parte' && (
                          <label className="field">
                            Quanto entrou agora (R$)
                            <input className="input" inputMode="decimal" placeholder="0,00" value={valorRecebido} onChange={(e) => setValorRecebido(e.target.value)} />
                          </label>
                        )}
                        <label className="field">
                          Combinado pra quando?
                          <input className="input" type="date" value={fiadoVenc} onChange={(e) => setFiadoVenc(e.target.value)} />
                        </label>
                      </div>
                      <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-muted)' }}>
                        O que faltar vira uma conta a receber no nome do cliente, na aba Contas — com botão de cobrar no WhatsApp. Sem data, fica pra daqui a 14 dias.
                      </span>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'receita' && salaOn && serviceId && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setUsarSala((v) => !v)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    flex: 'none',
                    borderRadius: 6,
                    border: '2px solid var(--accent)',
                    background: usarSala ? 'var(--accent)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--on-accent, white)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {usarSala ? '✓' : ''}
                </span>
                <span style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10, flex: 1, minWidth: 0, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text)' }}>
                    <strong>Usei a sala alugada</strong>
                    <span style={{ color: 'var(--text-muted)' }}> — soma na conta a pagar do mês</span>
                  </span>
                  {usarSala && <span style={{ fontWeight: 700, flex: 'none' }}>{fmtBRL(salaVal)}</span>}
                </span>
              </button>
              {usarSala && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className={'pill sm' + (salaModo === 'pct' ? ' active' : '')} onClick={() => setSalaModo('pct')}>
                    % do valor
                  </button>
                  <button className={'pill sm' + (salaModo === 'fixo' ? ' active' : '')} onClick={() => setSalaModo('fixo')}>
                    R$ fixo
                  </button>
                  <input
                    className="input"
                    style={{ width: 84, flex: 'none', padding: '8px 10px', fontSize: 12.5 }}
                    inputMode="decimal"
                    placeholder={salaModo === 'pct' ? 'Ex: 20' : 'Ex: 30,00'}
                    value={salaValor}
                    onChange={(e) => setSalaValor(e.target.value)}
                  />
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flex: 1, textAlign: 'right', minWidth: 70 }}>
                    {salaModo === 'pct' ? `${numOr0(salaValor)}% de ${fmtBRL(numOr0(amount))} = ${fmtBRL(salaVal)}` : `= ${fmtBRL(salaVal)}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {mode === 'receita' && numOr0(amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '10px 12px', background: 'var(--income-soft)', borderRadius: 10 }}>
              <span style={{ color: 'var(--income-text)' }}>
                💰 Sobra estimada <span style={{ opacity: 0.75 }}>(valor − produtos/energia − taxa{cobraSala ? ' − sala' : ''})</span>
              </span>
              <span style={{ fontWeight: 700, color: 'var(--income-text)', flex: 'none' }}>
                {fmtBRL(Math.max(0, numOr0(amount) - variableCostPreview - feeVal - (cobraSala ? salaVal : 0)))}
              </span>
            </div>
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
                  <span style={{ color: 'var(--text-muted)' }}>Custo estimado (produtos usados + deslocamento)</span>
                  <span style={{ fontWeight: 600 }}>{fmtBRL(variableCostPreview)}</span>
                </div>
              )}
            </div>
          )}

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

          {mode === 'receita' && (
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
          )}
        </>
      )}

      {mode === 'socio' && (
        <label className="field">
          Data
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
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
        {isOwner && editingTx && editingTx.type === 'receita' && !editingTx.capital && (
          <button className="pill ghost sm" onClick={() => setDevolvendo(true)}>
            ↩ Devolver
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
      {devolvendo && editingTx && (
        <PromptModal
          title="Registrar devolução"
          description="Devolveu dinheiro pra cliente? Isso lança uma despesa de 'Devoluções' hoje, sem apagar o atendimento original (nem a taxa de maquininha que já foi paga)."
          fields={[{ key: 'valor', label: 'Valor devolvido (R$)', defaultValue: String(editingTx.amount).replace('.', ','), kind: 'money' }]}
          confirmLabel="Registrar devolução"
          onCancel={() => setDevolvendo(false)}
          onConfirm={async (v) => {
            await devolver.mutateAsync({ id: editingTx.id, valor: v.valor as number });
            setDevolvendo(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

/** After an atendimento empties a pot (by the app's math), confirm against
 *  the shelf while she's standing next to it: really gone → inventory goes
 *  to zero; some left → she estimates and the app books the ganho. Every
 *  answer is an inventory adjustment on the product's record, which is what
 *  later powers the "fix the ficha técnica" suggestion. */
function EsgotadoPrompt({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const inventario = useProductInventario();
  const [idx, setIdx] = useState(0);
  const [perguntandoSobra, setPerguntandoSobra] = useState(false);
  const [sobra, setSobra] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const p = products[idx];
  const unidade = UNIT_LABEL[p.unit] || p.unit;

  function proximo() {
    setPerguntandoSobra(false);
    setSobra('');
    setErr(null);
    if (idx + 1 < products.length) setIdx(idx + 1);
    else onDone();
  }

  async function responder(real: number, note: string) {
    setErr(null);
    try {
      await inventario.mutateAsync({ id: p.id, real, note });
      proximo();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui ajustar.');
    }
  }

  return (
    <Modal title="Acabou o produto?" onClose={proximo}>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        Pelas contas do app, <strong>{p.name}</strong> chegou ao fim com esse atendimento. Dá uma olhada no pote:
      </div>
      {err && <div className="auth-error">{err}</div>}
      {!perguntandoSobra ? (
        <div className="modal-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={proximo}>
            Depois eu confiro
          </button>
          <button className="pill" onClick={() => setPerguntandoSobra(true)}>
            Ainda tem um pouco
          </button>
          <button className="btn-primary" onClick={() => responder(0, 'confirmado no fim do atendimento')} disabled={inventario.isPending}>
            Acabou mesmo
          </button>
        </div>
      ) : (
        <>
          <label className="field">
            Quanto sobra, mais ou menos? ({unidade})
            <input className="input" inputMode="decimal" placeholder={`Ex: ${Math.round(p.packageQty * 0.2)}`} value={sobra} onChange={(e) => setSobra(e.target.value)} autoFocus />
            <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-muted)' }}>Chute honesto serve — dá pra corrigir depois na Contagem do Estoque.</span>
          </label>
          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setPerguntandoSobra(false)}>
              Voltar
            </button>
            <button
              className="btn-primary"
              disabled={inventario.isPending}
              onClick={() => {
                const v = numOr0(sobra);
                if (v <= 0) {
                  setErr('Digite quanto sobra — ou volte e confirme que acabou.');
                  return;
                }
                responder(Math.round((v / p.packageQty) * 10000) / 10000, `sobra estimada no atendimento: ${sobra} ${unidade}`);
              }}
            >
              Ajustar estoque
            </button>
          </div>
        </>
      )}
      {products.length > 1 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
          {idx + 1} de {products.length}
        </div>
      )}
    </Modal>
  );
}

/** Public entry point — accepts either an id to edit (fetched on demand) or nothing for a new transaction. */
export default function TransactionModal({
  onClose,
  editingTxId,
  defaultType,
  defaultClientId,
  defaultServiceId,
  defaultServiceIds,
  defaultDate,
  appointmentId,
  sinalValor,
  onSaved,
  lockType,
}: {
  onClose: () => void;
  editingTxId?: string | null;
  defaultType?: 'receita' | 'despesa';
  defaultClientId?: string;
  defaultServiceId?: string;
  defaultServiceIds?: string[];
  defaultDate?: string;
  appointmentId?: string;
  sinalValor?: number;
  onSaved?: () => void;
  lockType?: boolean;
}) {
  const { data: editingTx, isLoading } = useTransaction(editingTxId);
  if (editingTxId && isLoading) return null;
  return (
    <TransactionForm
      onClose={onClose}
      editingTx={editingTx}
      defaultType={defaultType}
      defaultClientId={defaultClientId}
      defaultServiceId={defaultServiceId}
      defaultServiceIds={defaultServiceIds}
      defaultDate={defaultDate}
      appointmentId={appointmentId}
      sinalValor={sinalValor}
      onSaved={onSaved}
      lockType={lockType}
    />
  );
}
