import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeReport } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import TransactionModal from '../components/TransactionModal';
import ClientModal from '../components/ClientModal';
import BillModal from '../components/BillModal';
import PackageModal from '../components/PackageModal';

type ModalKind = 'tx-receita' | 'tx-despesa' | 'client' | 'bill' | 'package' | null;

export default function Home() {
  const navigate = useNavigate();
  const { data } = useHomeReport();
  const { isOwner } = useAuth();
  const [modal, setModal] = useState<ModalKind>(null);

  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const dataLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const alertRoute: Record<string, string> = { bill: '/contas', stock: '/estoque', client: '/clientes' };

  return (
    <div className="scroll-area">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, maxWidth: 900, width: '100%', margin: '0 auto', paddingTop: 26 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', padding: '6px 0 2px' }}>
          <img src="/ar-mark-t.png" alt="Amanda Rikari" style={{ width: 158, height: 'auto', display: 'block' }} />
          <div className="serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '0.04em', lineHeight: 1.1, color: 'var(--text)' }}>
            Amanda Rikari
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.26em', color: 'var(--accent-text)', textTransform: 'uppercase' }}>Biomédica</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
            {saudacao} — {dataLabel}
          </div>
        </div>

        {isOwner && (
          <div>
            <div className="eyebrow">O QUE VOCÊ QUER FAZER</div>
            <div className="action-grid">
              <button className="action-card primary" onClick={() => setModal('tx-receita')}>
                <div className="title">Registrar atendimento</div>
                <div className="desc">Receita, serviço e produtos usados</div>
              </button>
              <button className="action-card" onClick={() => navigate('/estoque')}>
                <div className="title">Vender produto</div>
                <div className="desc">Baixa no estoque e margem na hora</div>
              </button>
              <button className="action-card" onClick={() => setModal('package')}>
                <div className="title">Vender pacote</div>
                <div className="desc">À vista ou parcelado, com sessões</div>
              </button>
              <button className="action-card" onClick={() => setModal('tx-despesa')}>
                <div className="title">Lançar despesa</div>
                <div className="desc">Compra, insumo, transporte, conta</div>
              </button>
              <button className="action-card" onClick={() => setModal('bill')}>
                <div className="title">Anotar conta</div>
                <div className="desc">A receber ou a pagar, com vencimento</div>
              </button>
              <button className="action-card" onClick={() => setModal('client')}>
                <div className="title">Nova cliente</div>
                <div className="desc">Telefone, aniversário e histórico</div>
              </button>
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
          </div>
        </div>

        {data && data.alerts.length > 0 && (
          <div>
            <div className="eyebrow">LEMBRETES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.alerts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(alertRoute[a.kind] || '/')}
                  className={'pill block' + (a.overdue ? ' expense' : '')}
                >
                  {a.text}
                </button>
              ))}
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
    </div>
  );
}
