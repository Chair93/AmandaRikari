import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PeriodNav, { type PeriodMode } from '../components/PeriodNav';
import { useResultadoReport } from '../api/hooks';
import { fmtBRL, maskable, monthLabelFromOffset, monthShortLabel, moneyColor } from '../format';

export default function Resultado() {
  const [mode, setMode] = useState<PeriodMode>('month');
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const [showMargin, setShowMargin] = useState(false);
  const { data } = useResultadoReport(mode, monthOffset, yearOffset);
  const mask = (label: string) => maskable(label, showMargin);
  const year = new Date().getFullYear() + yearOffset;

  if (!data) return null;
  const { dre, balance } = data;
  const receitaTotal = dre.receita;
  const shareVar = receitaTotal > 0 ? Math.max(0, Math.round(((dre.custoVar + dre.cmv) / receitaTotal) * 100)) : 0;
  const shareDesp = receitaTotal > 0 ? Math.max(0, Math.round(((dre.desp + dre.prolabore) / receitaTotal) * 100)) : 0;
  const shareLucro = receitaTotal > 0 ? Math.max(0, Math.round((dre.resultado / receitaTotal) * 100)) : 0;
  const maxLast6 = Math.max(1, ...data.last6.map((m) => Math.max(m.receita, Math.abs(m.lucro))));

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="DRE, balanço patrimonial e arquivos para o contador"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <PeriodNav mode={mode} onModeChange={setMode} monthOffset={monthOffset} onMonthOffsetChange={setMonthOffset} yearOffset={yearOffset} onYearOffsetChange={setYearOffset} monthLabel={monthLabelFromOffset(monthOffset)} yearLabel={String(year)} />
            <button className="pill" onClick={() => setShowMargin((v) => !v)}>
              {showMargin ? 'Margem visível' : 'Margem oculta'}
            </button>
          </div>
        }
      />
      <div className="scroll-area">
        <div className="page">
          {!showMargin && <div className="empty-state">Os valores estão ocultos. Toque em “Margem oculta” no topo para mostrar o resultado.</div>}

          <div className="info-banner" style={{ background: 'var(--banner-purple-bg)', border: '1px solid var(--banner-purple-border)', color: 'var(--banner-purple-text)' }}>
            <strong>Relatórios</strong>&nbsp;responde: <em>o trabalho dá lucro?</em> Só o que é da operação — compras de estoque, bens e aportes ficam de fora.
          </div>

          <div style={{ borderRadius: 22, padding: '26px 30px', background: 'oklch(31% 0.035 300)', color: 'white', boxShadow: '0 14px 36px oklch(31% 0.035 300 / 0.24)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12.5, opacity: 0.78, fontWeight: 500 }}>Lucro da operação · {mode === 'year' ? String(year) : monthLabelFromOffset(monthOffset)}</span>
            <span className="serif" style={{ fontSize: 42, fontWeight: 600 }}>
              {mask(fmtBRL(dre.resultado))}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Margem de contribuição {receitaTotal > 0 ? Math.round((dre.margem / receitaTotal) * 100) : 0}%</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>·</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Cada R$ 100 faturados viram {mask(fmtBRL(receitaTotal > 0 ? (dre.resultado / receitaTotal) * 100 : 0))} de lucro</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.14)' }}>
                <div style={{ width: `${shareVar}%`, background: 'oklch(66% 0.13 30)' }} />
                <div style={{ width: `${shareDesp}%`, background: 'oklch(72% 0.11 70)' }} />
                <div style={{ width: `${shareLucro}%`, background: 'oklch(72% 0.13 155)' }} />
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 9, flexWrap: 'wrap', fontSize: 11, opacity: 0.85 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(66% 0.13 30)' }} /> Custo dos atendimentos e produtos
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(72% 0.11 70)' }} /> Despesas e pró-labore
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(72% 0.13 155)' }} /> Lucro
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px 6px' }}>
              <div className="serif" style={{ fontSize: 19, fontWeight: 600 }}>
                Como chegou nesse lucro
              </div>
              <div className="section-hint">Da receita até o lucro, linha por linha.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 22px 18px' }}>
              <DreLine label="Receita de atendimentos" value={mask(fmtBRL(dre.serv))} />
              <DreLine label="Receita de vendas de produtos" value={mask(fmtBRL(dre.vendas))} />
              <DreLine label="Receita total" value={mask(fmtBRL(dre.receita))} bold />
              <DreLine label="(−) Custo variável dos atendimentos" value={mask(fmtBRL(dre.custoVar))} color="var(--expense-text)" />
              <DreLine label="(−) Custo dos produtos vendidos (CMV)" value={mask(fmtBRL(dre.cmv))} color="var(--expense-text)" />
              <DreLine label="= Margem de contribuição" value={`${mask(fmtBRL(dre.margem))} (${receitaTotal > 0 ? Math.round((dre.margem / receitaTotal) * 100) : 0}%)`} bold valueColor={moneyColor(dre.margem)} />
              <DreLine label="(−) Despesas operacionais" value={mask(fmtBRL(dre.desp))} color="var(--expense-text)" />
              {dre.prolabore > 0 && <DreLine label="(−) Pró-labore retirado" value={mask(fmtBRL(dre.prolabore))} color="var(--expense-text)" />}
              <DreLine label="= Resultado do período" value={mask(fmtBRL(dre.resultado))} bold big valueColor={moneyColor(dre.resultado)} />
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 26 }}>
            <Stat label="Atendimentos" value={String(dre.atendCount)} />
            <Stat label="Ticket médio" value={mask(fmtBRL(dre.atendCount > 0 ? dre.serv / dre.atendCount : 0))} />
            {data.breakEven != null && <Stat label="Ponto de equilíbrio" value={`${data.breakEven} atendimentos`} />}
          </div>

          <div className="card">
            <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
              Últimos 6 meses
            </div>
            <div className="section-hint" style={{ marginBottom: 16 }}>
              Faturamento e lucro lado a lado — pra ver se a tendência é de subida.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              {data.last6.map((m) => (
                <div key={m.monthKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
                    <div className="chart-bar" style={{ width: '38%', height: `${Math.max(2, Math.round((m.receita / maxLast6) * 100))}%`, minHeight: 2, borderRadius: '6px 6px 0 0', background: 'oklch(80% 0.055 30)' }} />
                    <div
                      className="chart-bar"
                      style={{ width: '38%', height: `${Math.max(2, Math.round((Math.abs(m.lucro) / maxLast6) * 100))}%`, minHeight: 2, borderRadius: '6px 6px 0 0', background: m.lucro < 0 ? 'oklch(58% 0.13 30)' : 'oklch(60% 0.12 155)' }}
                    />
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize', color: 'var(--text)' }}>{monthShortLabel(m.monthKey)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-soft)' }}>{mask(fmtBRL(m.receita))}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: moneyColor(m.lucro) }}>{mask(fmtBRL(m.lucro))}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-soft)' }}>margem {m.margemPct != null ? Math.round(m.margemPct) + '%' : '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {data.porServico.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 10 }}>
                Por serviço
              </div>
              <div className="list">
                {data.porServico.map((sv) => (
                  <div className="list-row" key={sv.name}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{sv.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 90, textAlign: 'right' }}>{sv.count} atend.</span>
                    <span style={{ fontSize: 12, width: 110, textAlign: 'right' }}>{mask(fmtBRL(sv.receita))}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, width: 130, textAlign: 'right', color: moneyColor(sv.margem) }}>{mask(fmtBRL(sv.margem))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.porProduto.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 10 }}>
                Vendas por produto
              </div>
              <div className="list">
                {data.porProduto.map((p) => (
                  <div className="list-row" key={p.name}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 70, textAlign: 'right' }}>{p.qty} un</span>
                    <span style={{ fontSize: 12, width: 110, textAlign: 'right' }}>{mask(fmtBRL(p.receita))}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, width: 130, textAlign: 'right', color: moneyColor(p.margem) }}>{mask(fmtBRL(p.margem))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="card" style={{ flex: 1, minWidth: 330 }}>
              <div className="serif" style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>
                Balanço patrimonial
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 4 }}>ATIVO</div>
              <BalanceLine label="Caixa acumulado" value={mask(fmtBRL(balance.caixa))} />
              <BalanceLine label="Contas a receber" value={mask(fmtBRL(balance.aReceber))} />
              <BalanceLine label="Estoque (custo médio)" value={mask(fmtBRL(balance.estoque))} />
              <BalanceLine label="Equipamentos (bruto)" value={mask(fmtBRL(balance.equipBruto))} />
              <BalanceLine label="(−) Depreciação acumulada" value={mask(fmtBRL(balance.depreciacao))} color="var(--expense-text)" />
              <BalanceLine label="Ativo total" value={mask(fmtBRL(balance.ativoTotal))} bold />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em', margin: '10px 0 4px' }}>PASSIVO</div>
              <BalanceLine label="Contas a pagar" value={mask(fmtBRL(balance.aPagar))} />
              <BalanceLine label="Empréstimo de sócios (a devolver)" value={mask(fmtBRL(balance.emprestimoSocios))} />
              {balance.receitaDiferida > 0.5 && <BalanceLine label="Receita diferida (pacotes não realizados)" value={mask(fmtBRL(balance.receitaDiferida))} />}
              <BalanceLine label="Passivo total" value={mask(fmtBRL(balance.passivoTotal))} bold />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em', margin: '10px 0 4px' }}>PATRIMÔNIO LÍQUIDO</div>
              {Math.abs(balance.capitalSocios) > 0.5 && <BalanceLine label="Capital investido pelos sócios" value={mask(fmtBRL(balance.capitalSocios))} />}
              <BalanceLine label="Lucros/prejuízos acumulados (DRE)" value={mask(fmtBRL(balance.lucrosAcumulados))} valueColor={moneyColor(balance.lucrosAcumulados)} bold />
              {balance.perdaBaixas > 0.005 && <BalanceLine label="(−) Perdas por baixa de bens" value={mask(fmtBRL(balance.perdaBaixas))} color="var(--expense-text)" />}
              {Math.abs(balance.resultadoARealizar) > 0.5 && <BalanceLine label="Resultado a realizar (a receber − a pagar)" value={mask(fmtBRL(balance.resultadoARealizar))} valueColor={moneyColor(balance.resultadoARealizar)} bold />}
              <BalanceLine label="PL (ativo − passivo)" value={mask(fmtBRL(balance.plLiquido))} valueColor={moneyColor(balance.plLiquido)} big bold />
              {Math.abs(balance.ajusteConciliar) > 0.5 && (
                <>
                  <BalanceLine label="Ajuste a conciliar" value={mask(fmtBRL(balance.ajusteConciliar))} color="var(--expense-text)" small />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>Tem bem cadastrado sem lançamento de compra. Lance a saída de caixa para o balanço fechar com a DRE.</div>
                </>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 250, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--accent-soft)', borderRadius: 16, padding: '16px 18px', fontSize: 12, color: 'var(--accent-dark)', lineHeight: 1.5 }}>
                O <strong>PL</strong> é o que sobraria se ela fechasse hoje: recebesse tudo, pagasse tudo e vendesse estoque e equipamentos pelo valor de livro. Ele cresce com lucro, não com faturamento.
              </div>
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
                  Exportar pro contador
                </div>
                <div className="section-hint">Arquivos em CSV (abrem no Excel) com tudo que o contador precisa para fechar o mês.</div>
                <ExportButtons scope={mode} monthOffset={monthOffset} yearOffset={yearOffset} />
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--accent-soft)', borderRadius: 14, padding: '14px 18px', fontSize: 12, color: 'var(--accent-dark)', lineHeight: 1.5 }}>
            Fase de startup: é normal o caixa ficar negativo nos primeiros meses (compra de estoque e equipamentos). O sinal de saúde é a <strong>margem de contribuição positiva e crescendo</strong> — cada atendimento pagando seus custos e sobrando algo pra cobrir o resto.
          </div>
        </div>
      </div>
    </>
  );
}

function DreLine({ label, value, bold, big, color, valueColor }: { label: string; value: string; bold?: boolean; big?: boolean; color?: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: big ? '12px 0 4px' : '9px 0', fontSize: big ? 15.5 : 13.5, fontWeight: bold ? 700 : 400, color, borderBottom: big ? 'none' : '1px solid var(--divider)' }}>
      <span>{label}</span>
      <span style={{ color: valueColor, fontWeight: bold ? 600 : undefined }}>{value}</span>
    </div>
  );
}

function BalanceLine({ label, value, bold, big, small, color, valueColor }: { label: string; value: string; bold?: boolean; big?: boolean; small?: boolean; color?: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: big ? '8px 0' : '6px 0', fontSize: big ? 14.5 : small ? 12.5 : 13, fontWeight: bold ? 700 : 400, color, borderBottom: bold ? 'none' : '1px solid var(--divider)' }}>
      <span>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: valueColor }}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function ExportButtons({ scope, monthOffset, yearOffset }: { scope: 'month' | 'year'; monthOffset: number; yearOffset: number }) {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
  const qs = `scope=${scope}&monthOffset=${monthOffset}&yearOffset=${yearOffset}`;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
      <a className="pill accent sm" href={`${API_BASE}/reports/export/dre.csv?${qs}`} target="_blank" rel="noreferrer">
        DRE do período
      </a>
      <a className="pill accent sm" href={`${API_BASE}/reports/export/balanco.csv`} target="_blank" rel="noreferrer">
        Balanço
      </a>
      <a className="pill sm" href={`${API_BASE}/reports/export/transactions.csv`} target="_blank" rel="noreferrer">
        Lançamentos
      </a>
    </div>
  );
}
