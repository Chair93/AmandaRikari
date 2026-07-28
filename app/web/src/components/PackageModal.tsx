import { useState } from 'react';
import Modal from './Modal';
import { useClients, useSavePackage, useServices } from '../api/hooks';
import { fmtBRL, numOr0, parseNumberBR, PAYMENT_LABEL, todayStr } from '../format';

export default function PackageModal({ onClose, defaultClientId }: { onClose: () => void; defaultClientId?: string }) {
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useServices();
  const savePackage = useSavePackage();

  const [clientId, setClientId] = useState(defaultClientId || '');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [sessions, setSessions] = useState('5');
  const [amount, setAmount] = useState('');
  const [payment, setPayment] = useState('pix');
  const [mode, setMode] = useState<'avista' | 'prazo'>('avista');
  const [parcelas, setParcelas] = useState('3');
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [primeiroVenc, setPrimeiroVenc] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);

  const n = Math.round(numOr0(sessions));
  const v = numOr0(amount);
  const sv = services.find((s) => s.id === serviceId);
  const avulso = sv ? sv.price * n : 0;
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
        serviceId: serviceId || null,
        sessions: n,
        amount: parsedAmount,
        payment,
        mode,
        parcelas: mode === 'prazo' ? Math.max(1, Math.round(numOr0(parcelas))) : undefined,
        parcelasCartao: mode === 'avista' && payment === 'credito' ? parcelasCartao : undefined,
        primeiroVenc: mode === 'prazo' ? primeiroVenc : undefined,
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
      <label className="field">
        Serviço do pacote
        <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          Nº de sessões
          <input className="input" inputMode="numeric" placeholder="5" value={sessions} onChange={(e) => setSessions(e.target.value)} />
        </label>
        <label className="field">
          Valor total (R$)
          <input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
            <input className="input" type="date" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value)} />
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
