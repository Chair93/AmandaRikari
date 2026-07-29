import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';
import { useSettings } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, fmtDateBR, PAYMENT_LABEL } from '../format';
import { valorPorExtenso } from '../extenso';
import { pixPayload } from '../pix';

/** Full-form receipt ("Recibo") in the traditional Brazilian layout: issuer
 *  block, amount in words, city/date line and signature. The issuer fields
 *  come from Ajustes > Dados do recibo; anything left blank is simply
 *  omitted, so an unconfigured account still gets a usable receipt. */
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
  const [pixCopied, setPixCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const { data: settings } = useSettings();
  const { user } = useAuth();

  const emissor = user?.businessName || 'Rikari';
  const doc = settings?.receiptDoc?.trim() || '';
  const foneEmissor = settings?.receiptPhone?.trim() || '';
  const endereco = settings?.receiptAddress?.trim() || '';
  const cidade = settings?.receiptCity?.trim() || '';

  const cabecalho = [
    `RECIBO${amount > 0 ? ` — ${fmtBRL(amount)}` : ''}`,
    '',
    emissor,
    doc ? `CPF/CNPJ: ${doc}` : '',
    endereco,
    cidade && endereco ? '' : cidade, // city joins the address block when alone
    foneEmissor ? `Telefone: ${foneEmissor}` : '',
  ].filter((l, i) => l !== '' || i === 1);

  const corpo =
    amount > 0
      ? `Recebi de ${clientName} a importância de ${fmtBRL(amount)} (${valorPorExtenso(amount)}), referente a ${serviceName}.`
      : `Atendimento de ${clientName} referente a ${serviceName} — sessão de pacote já paga.`;

  const detalhes = [
    `Data do atendimento: ${fmtDateBR(date)}`,
    payment && amount > 0 ? `Forma de pagamento: ${PAYMENT_LABEL[payment] || payment}` : '',
  ].filter(Boolean);

  const rodape = [
    cidade ? `${cidade}, ${fmtDateBR(date)}.` : `${fmtDateBR(date)}.`,
    '',
    '____________________________',
    emissor + (doc ? ` — CPF/CNPJ ${doc}` : ''),
  ];

  const text = [...cabecalho, '', corpo, '', ...detalhes, ...(detalhes.length ? [''] : []), ...rodape].join('\n');

  // Pix: with a key configured and money owed, the receipt carries the exact
  // charge — copia-e-cola for pasting and a QR for pointing the camera.
  const pixKey = settings?.pixKey?.trim() || '';
  const pix = pixKey && amount > 0 ? pixPayload({ key: pixKey, name: emissor, city: cidade || 'Brasil', amount }) : null;
  useEffect(() => {
    let vivo = true;
    if (pix) QRCode.toDataURL(pix, { margin: 1, width: 220 }).then((url) => vivo && setQr(url)).catch(() => setQr(null));
    else setQr(null);
    return () => {
      vivo = false;
    };
  }, [pix]);

  const fone = clientPhone ? clientPhone.replace(/\D/g, '') : '';
  const numero = fone ? (fone.length <= 11 ? '55' + fone : fone) : '';
  const textoZap = pix ? `${text}\n\nPix copia e cola (${fmtBRL(amount)}):\n${pix}` : text;
  const whatsLink = `https://api.whatsapp.com/send?${numero ? `phone=${numero}&` : ''}text=${encodeURIComponent(textoZap)}`;

  const faltamDados = !doc || !cidade;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // clipboard API unavailable — user can still select the text manually
    }
  }

  /** Print-friendly window — the browser's own "save as PDF" does the rest,
   *  no PDF library needed. */
  function imprimir() {
    const w = window.open('', '_blank', 'width=640,height=800');
    if (!w) return;
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title><style>` +
        `body{font-family:Georgia,'Times New Roman',serif;color:#2a2220;margin:48px auto;max-width:520px;padding:0 24px}` +
        `pre{white-space:pre-wrap;font-family:inherit;font-size:15px;line-height:1.8}` +
        `</style></head><body><pre>${safe}</pre></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Modal title="Recibo" onClose={onClose}>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 14, padding: '14px 16px' }}>{text}</div>
      {faltamDados && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Dica: preencha CPF/CNPJ, endereço e cidade em Ajustes &gt; Dados do recibo para o recibo sair completo.
        </div>
      )}
      {pix && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'var(--surface-2)', borderRadius: 14, padding: '12px 16px', flexWrap: 'wrap' }}>
          {qr && <img src={qr} alt="QR Code Pix" style={{ width: 110, height: 110, borderRadius: 8, background: 'white', padding: 4 }} />}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Pix de {fmtBRL(amount)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 2 }}>
              A cliente aponta a câmera no QR ou cola o código no app do banco. Vai junto na mensagem do WhatsApp.
            </div>
            <button
              className="pill sm"
              style={{ marginTop: 8 }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pix);
                  setPixCopied(true);
                } catch {
                  // clipboard unavailable — the code still rides the WhatsApp message
                }
              }}
            >
              {pixCopied ? 'Copiado!' : 'Copiar código Pix'}
            </button>
          </div>
        </div>
      )}
      {!numero && <div style={{ fontSize: 11.5, color: 'var(--expense-text)', lineHeight: 1.45 }}>Esse cliente não tem telefone cadastrado — o WhatsApp vai abrir sem destinatário.</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={onClose}>
          Fechar
        </button>
        <button className="pill" onClick={copy}>
          {copied ? 'Copiado!' : 'Copiar texto'}
        </button>
        <button className="pill" onClick={imprimir}>
          Imprimir / PDF
        </button>
        <a className="btn-primary" style={{ background: 'oklch(58% 0.13 150)', textDecoration: 'none' }} href={whatsLink} target="_blank" rel="noopener noreferrer">
          Abrir WhatsApp
        </a>
      </div>
    </Modal>
  );
}
