import { useState } from 'react';
import Modal from './Modal';
import DateField from './DateField';
import { useClients, useSavePackage, useServices } from '../api/hooks';
import { fmtBRL, numOr0, parseNumberBR, PAYMENT_LABEL, todayStr } from '../format';

/** Accent-insensitive matcher so "radio" finds "Radiofrequência". */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function PackageModal({ onClose, defaultClientId }: { onClose: () => void; defaultClientId?: string }) {
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useServices();
  const savePackage = useSavePackage();

  const [clientId, setClientId] = useState(defaultClientId || '');
  // Combo packages: each session delivers every marked procedure.
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [sessions, setSessions] = useState('5');
  const [amount, setAmount] = useState('');
  const [payment, setPayment] = useState('pix');
  const [mode, setMode] = useState<'avista' | 'prazo'>('avista');
  const [parcelas, setParcelas] = useState('3');
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [primeiroVenc, setPrimeiroVenc] = useState(todayStr());
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);

  const n = Math.round(numOr0(sessions));
  const v = numOr0(amount);
  const selecionados = services.filter((s) => serviceIds.includes(s.id));
  const avulso = selecionados.reduce((a, s) => a + numOr0(s.price), 0) * n;

  // Same hybrid picker as the Agenda: pill wall up to 8 services, search past
  // that, marked ones pinned to the front while searching.
  const muitos = services.length > 8;
  const buscando = muitos && busca.trim().length > 0;
  const naoSelecionados = services.filter((s) => !serviceIds.includes(s.id) && norm(s.name).includes(norm(busca)));
  const pillList = buscando ? [...selecionados, ...naoSelecionados] : services;
  function toggleService(id: string) {
    setServiceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  let preview = 'Preencha sessões e valor.';
  if (n > 0 && v > 0) {
    const desconto = avulso > 0 ? ` · desconto de ${Math.round((1 - v / avulso) * 100)}% sobre o avulso (${fmtBRL(avulso)})` : '';
    preview = `${fmtBRL(v / n)} por sessão${desconto}`;
    if (mode === 'prazo') {
      const p = Math.max(1, Math.round(numOr0(parcelas)));
      preview += ` — ${p}x de ${fmtBRL(v / p)}, vão para Contas a receber, uma por mês.`;
    }
  }

  async function onSave() {
    if (!clientId || n <= 0) {
      setError('Escolha o cliente e o número de sessões.');
      return;
    }
    const parsedAmount = parseNumberBR(amount);
    if (parsedAmount == null || parsedAmount <= 0) {
      setError(amount.trim() === '' ? 'Preencha o valor total.' : `Valor inválido: "${amount}". Use apenas números, ex: 1.500,00`);
      return;
    }
    try {
      await savePackage.mutateAsync({
        clientId,
        serviceIds,
        serviceId: serviceIds[0] || null,
        sessions: n,
        amount: parsedAmount,
        payment,
        mode,
        parcelas: mode === 'prazo' ? Math.max(1, Math.round(numOr0(parcelas))) : undefined,
        parcelasCartao: mode === 'avista' && payment === 'credito' ? parcelasCartao : undefined,
        primeiroVenc: mode === 'prazo' ? primeiroVenc : undefined,
        date: date || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Modal title="Vender pacote" onClose={onClose}>
      <label className="field">
        Cliente
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Escolha</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        Serviços do pacote (toque pra marcar — pode mais de um)
        {muitos && <input className="input" placeholder="Buscar serviço..." value={busca} onChange={(e) => setBusca(e.target.value)} />}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pillList.map((s) => {
            const on = serviceIds.includes(s.id);
            return (
              <button key={s.id} className={'pill sm' + (on ? ' active' : '')} onClick={() => toggleService(s.id)}>
                {on ? '✓ ' : ''}
                {s.name}
                {numOr0(s.price) > 0 && <span style={{ opacity: 0.65 }}> · {fmtBRL(s.price)}</span>}
              </button>
            );
          })}
          {buscando && naoSelecionados.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Nenhum serviço com esse nome.</span>}
        </div>
        {selecionados.length > 1 && (
          <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-muted)' }}>Cada sessão inclui: {selecionados.map((s) => s.name).join(' + ')}</span>
        )}
      </div>
      <div className="field-row">
        <label className="field">
          Nº de sessões
          <input className="input" inputMode="numeric" placeholder="5" value={sessions} onChange={(e) => setSessions(e.target.value)} />
        </label>
        <label className="field">
          Valor total (R$)
          <input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          Data da venda
          <DateField value={date} onChange={setDate} />
        </label>
      </div>
      <div className="field">
        Como o cliente vai pagar
        <div className="tab-row">
          <button className={'tab' + (mode === 'avista' ? ' active-accent' : '')} onClick={() => setMode('avista')}>
            À vista
          </button>
          <button className={'tab' + (mode === 'prazo' ? ' active-accent' : '')} onClick={() => setMode('prazo')}>
            A prazo (parcelado)
          </button>
        </div>
      </div>
      {mode === 'avista' ? (
        <label className="field">
          Forma de pagamento
          <select className="input" value={payment} onChange={(e) => setPayment(e.target.value)}>
            {Object.entries(PAYMENT_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          {payment === 'credito' && (
            <select className="input" style={{ marginTop: 6 }} value={parcelasCartao} onChange={(e) => setParcelasCartao(Number(e.target.value))}>
              <option value={1}>1x — à vista (ou juros por conta do cliente)</option>
              {Array.from({ length: 11 }, (_, i) => i + 2).map((x) => (
                <option key={x} value={x}>
                  {x}x — taxa sua
                </option>
              ))}
            </select>
          )}
        </label>
      ) : (
        <div className="field-row">
          <label className="field">
            Nº de parcelas
            <input className="input" inputMode="numeric" placeholder="3" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
          </label>
          <label className="field">
            1º vencimento
            <DateField value={primeiroVenc} onChange={setPrimeiroVenc} />
          </label>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{preview}</div>
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={savePackage.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
