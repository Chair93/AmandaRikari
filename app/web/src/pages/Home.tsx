import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDayAgenda, useHomeReport, useSettings } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { todayStr } from '../format';
import { comLinkConfirmacao, fillNome, fillWaTemplate, waLink, WA_NIVER_PADRAO } from '../waTemplate';
import GuideModal from '../components/GuideModal';
import TransactionModal from '../components/TransactionModal';
import ClientModal from '../components/ClientModal';
import BillModal from '../components/BillModal';
import PackageModal from '../components/PackageModal';
import AppointmentModal from '../components/AppointmentModal';
import VendaModal from '../components/VendaModal';

type ModalKind = 'tx-receita' | 'tx-despesa' | 'client' | 'bill' | 'package' | 'appointment' | 'sell-product' | null;
type ActionKey = Exclude<ModalKind, null>;

/** The trailing chevron on a row that goes somewhere. Hidden above the phone
 *  breakpoint, where the cards read as cards rather than list rows. */
function Chevron() {
  return (
    <svg className="cell-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
      <path d="M1.5 1.5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tints follow the iOS convention of one saturated colour per row, so the
 *  icon is what the eye lands on when scanning the list. */
const ACTIONS: { key: ActionKey; title: string; desc: string; tint: string; primary?: boolean; icon: ReactNode }[] = [
  {
    key: 'tx-receita',
    title: 'Registrar atendimento',
    desc: 'Receita, serviço e produtos usados',
    tint: '#b0475f',
    primary: true,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'appointment',
    title: 'Agendar atendimento',
    desc: 'Marca dia e horário na Agenda',
    tint: '#c2803f',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M5.7 10.2l1.6 1.6 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'sell-product',
    title: 'Vender produto',
    desc: 'Baixa no estoque e margem na hora',
    tint: '#2f9e5f',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 5h11l-1 8.5h-9L2.5 5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M5.8 5V3.6A2.2 2.2 0 018 2a2.2 2.2 0 012.2 1.6V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'package',
    title: 'Vender pacote',
    desc: 'À vista ou parcelado, com sessões',
    tint: '#7a5cd0',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2l6 3-6 3-6-3 6-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M2 8.5l6 3 6-3M2 11.5l6 3 6-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'tx-despesa',
    title: 'Lançar despesa',
    desc: 'Compra, insumo, transporte, conta',
    tint: '#d1742e',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3v9M4.5 8.5L8 12l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'bill',
    title: 'Anotar conta',
    desc: 'A receber ou a pagar, com vencimento',
    tint: '#3b7dd8',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'client',
    title: 'Novo cliente',
    desc: 'Telefone, aniversário e histórico',
    tint: '#2f9e9e',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 13.5c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { data } = useHomeReport();
  const { data: settings } = useSettings();
  const { data: hoje } = useDayAgenda(todayStr());
  const amanhaStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { data: amanha } = useDayAgenda(amanhaStr);
  const { isOwner } = useAuth();
  const [modal, setModal] = useState<ModalKind>(null);
  const [guide, setGuide] = useState(false);

  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const dataLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const alertRoute: Record<string, string> = { bill: '/contas', stock: '/estoque', client: '/clientes', appointment: '/agenda' };

  function runAction(key: ActionKey) {
    setModal(key);
  }

  return (
    <div className="scroll-area">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, maxWidth: 900, width: '100%', margin: '0 auto', paddingTop: 26 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', padding: '6px 0 2px' }}>
          <img src="/ar-mark-t.png" alt="Amanda Rikari" style={{ width: 158, height: 'auto', display: 'block' }} />
          <div className="serif brand-name" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '0.04em', lineHeight: 1.1, color: 'var(--text)' }}>
            Amanda Rikari
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.26em', color: 'var(--accent-text)', textTransform: 'uppercase' }}>Biomédica</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
            {saudacao} — {dataLabel}
          </div>
        </div>

        {hoje && hoje.appointments.length > 0 && (
          <div>
            <div className="eyebrow">AGENDA DE HOJE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hoje.appointments.map((a) => (
                <button key={a.id} className="pill block" onClick={() => navigate('/agenda')} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, flex: 'none', width: 44 }}>{a.time}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.client.name}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {a.services?.length ? a.services.map((x) => x.service.name).join(' + ') : a.service?.name || 'Atendimento'}</span>
                  </span>
                  {a.tx ? (
                    <span className="badge" style={{ background: 'var(--income-soft)', color: 'var(--income-text)', flex: 'none' }}>✓ atendido</span>
                  ) : a.confirmou ? (
                    <span className="badge" style={{ flex: 'none' }}>confirmou</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {isOwner && amanha && amanha.appointments.length > 0 && (
          <div>
            <div className="eyebrow">LEMBRETES DE AMANHÃ — UM TOQUE POR CLIENTE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {amanha.appointments.map((a) => {
                const msg = comLinkConfirmacao(
                  fillWaTemplate(settings?.waTemplate || '', { clientName: a.client.name, date: a.date, time: a.time, serviceName: a.services?.length ? a.services.map((x) => x.service.name).join(' + ') : a.service?.name || null }),
                  a.confirmToken
                );
                return (
                  <div key={a.id} className="pill block" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'default' }}>
                    <span style={{ fontWeight: 700, flex: 'none', width: 44 }}>{a.time}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.client.name}
                      {a.confirmou && <span style={{ color: 'var(--income-text)', fontWeight: 600 }}> · já confirmou</span>}
                    </span>
                    {a.client.phone ? (
                      <a
                        className="pill sm"
                        style={{ textDecoration: 'none', background: 'var(--income-soft)', color: 'var(--income-text)', flex: 'none' }}
                        href={waLink(a.client.phone, msg)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Lembrar 💬
                      </a>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 'none' }}>sem telefone</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isOwner && (
          <div>
            <div className="eyebrow">O QUE VOCÊ QUER FAZER</div>
            <div className="action-grid">
              {ACTIONS.map((a) => (
                <button key={a.key} className={'action-card' + (a.primary ? ' primary' : '')} onClick={() => runAction(a.key)}>
                  <span className="cell-icon" style={{ background: a.tint }}>
                    {a.icon}
                  </span>
                  <span className="cell-body">
                    <span className="title">{a.title}</span>
                    <span className="desc">{a.desc}</span>
                  </span>
                  <Chevron />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="eyebrow">CONSULTAR</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill ghost" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => navigate('/caixa')}>
              Caixa do mês
            </button>
            <button className="pill ghost" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => navigate('/contas')}>
              Contas
            </button>
            <button className="pill ghost" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => navigate('/resultado')}>
              Relatórios
            </button>
            <button className="pill ghost" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => navigate('/clientes')}>
              Clientes
            </button>
            <button className="pill ghost" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => navigate('/lancamentos')}>
              Lançamentos
            </button>
            <button className="pill ghost" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => setGuide(true)}>
              ❓ Como usar
            </button>
          </div>
        </div>

        {data && data.alerts.length > 0 && (
          <div>
            <div className="eyebrow">LEMBRETES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.alerts.map((a) =>
                a.kind === 'birthday' ? (
                  <div key={a.id} className="pill block" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{a.text}</span>
                    {a.phone && settings && (
                      <a
                        className="pill sm"
                        style={{ textDecoration: 'none', background: 'var(--income-soft)', color: 'var(--income-text)', flex: 'none' }}
                        href={waLink(a.phone, fillNome(settings.waBirthday, WA_NIVER_PADRAO, a.clientName || ''))}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Dar parabéns 🎉
                      </a>
                    )}
                  </div>
                ) : (
                  <button
                    key={a.id}
                    onClick={() => navigate(alertRoute[a.kind] || '/')}
                    className={'pill block' + (a.overdue ? ' expense' : '')}
                  >
                    {a.text}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {(modal === 'tx-receita' || modal === 'tx-despesa') && (
        <TransactionModal onClose={() => setModal(null)} defaultType={modal === 'tx-receita' ? 'receita' : 'despesa'} lockType />
      )}
      {modal === 'client' && <ClientModal onClose={() => setModal(null)} />}
      {modal === 'bill' && <BillModal onClose={() => setModal(null)} defaultKind="receber" />}
      {modal === 'package' && <PackageModal onClose={() => setModal(null)} />}
      {modal === 'appointment' && <AppointmentModal onClose={() => setModal(null)} defaultDate={todayStr()} />}
      {modal === 'sell-product' && <VendaModal onClose={() => setModal(null)} />}
      {guide && <GuideModal onClose={() => setGuide(false)} />}
    </div>
  );
}
