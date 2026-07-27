import { useState } from 'react';
import Modal from './Modal';
import { fmtBRL, fmtDateBR, PAYMENT_LABEL } from '../format';

export default function ReceiptModal({
  onClose,
  clientName,
  clientPhone,
  date,
  serviceName,
  amount,
  payment,
}: {
  onClose: () => void;
  clientName: string;
  clientPhone: string | null;
  date: string;
  serviceName: string;
  amount: number;
  payment: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const lines = [
    'Rikari — Comprovante de atendimento',
    '',
    `Cliente: ${clientName}`,
    `Data: ${fmtDateBR(date)}`,
    `Serviço: ${serviceName}`,
    `Valor: ${amount > 0 ? fmtBRL(amount) : 'sessão de pacote (já paga)'}`,
    payment ? `Pagamento: ${PAYMENT_LABEL[payment] || payment}` : '',
    '',
    'Obrigada pela confiança!',
  ].filter(Boolean);
  const text = lines.join('\n');
  const fone = clientPhone ? clientPhone.replace(/\D/g, '') : '';
  const numero = fone ? (fone.length <= 11 ? '55' + fone : fone) : '';
  const whatsLink = `https://api.whatsapp.com/send?${numero ? `phone=${numero}&` : ''}text=${encodeURIComponent(text)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // clipboard API unavailable — user can still select the text manually
    }
  }

  return (
    <Modal title="Comprovante" onClose={onClose}>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 14, padding: '14px 16px' }}>{text}</div>
      {!numero && <div style={{ fontSize: 11.5, color: 'var(--expense-text)', lineHeight: 1.45 }}>Essa cliente não tem telefone cadastrado — o WhatsApp vai abrir sem destinatário.</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={onClose}>
          Fechar
        </button>
        <button className="pill" onClick={copy}>
          {copied ? 'Copiado!' : 'Copiar texto'}
        </button>
        <a className="btn-primary" style={{ background: 'oklch(58% 0.13 150)', textDecoration: 'none' }} href={whatsLink} target="_blank" rel="noopener noreferrer">
          Abrir WhatsApp
        </a>
      </div>
    </Modal>
  );
}
