import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useDeleteService, useDuplicateService, useServices, useSettings } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, moneyColor, numOr0 } from '../format';
import ServiceModal from '../components/ServiceModal';
import type { Service, Settings } from '../api/types';

/** What the rented room takes from one atendimento at this price — zero when
 *  no room is configured. Mirrors salaFeeAmount on the server. */
function salaCost(price: number, s: Settings | undefined): number {
  if (!s) return 0;
  if (s.salaMode === 'fixo') return s.salaFixo || 0;
  if (s.salaMode === 'pct') return (price * (s.salaPct || 0)) / 100;
  return 0;
}

function ServiceRow({ sv }: { sv: Service }) {
  const { isOwner } = useAuth();
  const del = useDeleteService();
  const duplicate = useDuplicateService();
  const { data: settings } = useSettings();
  const [editing, setEditing] = useState(false);
  const sala = salaCost(sv.price, settings);
  const margin = sv.price - sv.cost - sala;
  const marginPct = sv.price > 0 ? (margin / sv.price) * 100 : 0;
  return (
    <div className="card row-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', rowGap: 12 }}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{sv.name}</span>
          {sv.category && <span className="badge">{sv.category}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
          {sv.items.length} {sv.items.length === 1 ? 'item na ficha técnica' : 'itens na ficha técnica'}
        </div>
      </div>
      <div className="row-stats" style={{ gap: 18 }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Custo variável</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(sv.cost)}</div>
        </div>
        {sala > 0 && (
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Sala</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(sala)}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Preço sugerido</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(sv.price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Margem</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: moneyColor(margin) }}>
            {fmtBRL(margin)} ({Math.round(marginPct)}%)
          </div>
        </div>
      </div>
      {isOwner && (
        <div className="row-actions">
          <button className="pill ghost sm" onClick={() => duplicate.mutate(sv.id)} disabled={duplicate.isPending}>
            Duplicar
          </button>
          <button className="pill ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button className="icon-btn" aria-label="Excluir serviço" onClick={() => del.mutate(sv.id)}>
            ×
          </button>
        </div>
      )}
      {editing && <ServiceModal onClose={() => setEditing(false)} editingService={sv} />}
    </div>
  );
}

function PriceSimulator() {
  const { data: services = [] } = useServices();
  const { data: settings } = useSettings();
  const [selectedId, setSelectedId] = useState('');
  const [custo, setCusto] = useState('');
  const [margem, setMargem] = useState('70');
  const [preco, setPreco] = useState('');

  const selected = services.find((s) => s.id === selectedId) || null;
  // When a service is selected, custo/preço always reflect its live numbers
  // (ficha técnica + preço cadastrado) instead of a one-time copy, so editing
  // the service elsewhere keeps this simulator in sync automatically.
  const c = selected ? selected.cost : numOr0(custo);
  const p = selected ? selected.price : numOr0(preco);
  const m = Math.min(95, numOr0(margem));
  // The rented room eats into every price. Fixed rent adds to the cost;
  // percentage rent shrinks the share of the price that's actually yours,
  // so it comes out of the denominator: p = (c + fixo) / (1 - m% - sala%).
  const salaFixo = settings?.salaMode === 'fixo' ? settings.salaFixo || 0 : 0;
  const salaPctFrac = settings?.salaMode === 'pct' ? (settings.salaPct || 0) / 100 : 0;
  const denom = 1 - m / 100 - salaPctFrac;
  const sugerido = denom > 0.05 ? (c + salaFixo) / denom : c + salaFixo;
  const sobra = p - c - salaCost(p, settings);

  return (
    <div style={{ background: 'linear-gradient(135deg, var(--surface-2), var(--surface))', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '18px 20px' }}>
      <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
        Simulador de preço
      </div>
      <div className="section-hint" style={{ marginBottom: 14 }}>
        Quanto cobrar para sobrar a margem que você quer — e quanto sobra no preço que você já cobra.
        {settings?.salaMode !== 'off' && settings ? ' O custo da sala já está descontado.' : ''}
      </div>

      {services.length > 0 && (
        <label className="field" style={{ marginBottom: 12 }}>
          Ver serviço (opcional — preenche custo e preço automaticamente)
          <select className="input" style={{ background: 'var(--surface)' }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Personalizado (preencher manualmente)</option>
            {groupServicesByCategory(services).map(([category, group]) =>
              category ? (
                <optgroup key={category} label={category}>
                  {group.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ) : (
                group.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )
            )}
          </select>
        </label>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: 1, minWidth: 130 }}>
          Custo do atendimento (R$)
          <input
            className="input"
            style={{ background: 'var(--surface)' }}
            inputMode="decimal"
            placeholder="0,00"
            value={selected ? String(Math.round(selected.cost * 100) / 100).replace('.', ',') : custo}
            disabled={!!selected}
            onChange={(e) => setCusto(e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 130 }}>
          Margem desejada (%)
          <input className="input" style={{ background: 'var(--surface)' }} inputMode="numeric" placeholder="70" value={margem} onChange={(e) => setMargem(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 130 }}>
          Preço que você cobra (R$)
          <input
            className="input"
            style={{ background: 'var(--surface)' }}
            inputMode="decimal"
            placeholder="0,00"
            value={selected ? String(selected.price).replace('.', ',') : preco}
            disabled={!!selected}
            onChange={(e) => setPreco(e.target.value)}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180, background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>Cobre a partir de</div>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: 'var(--accent-text)' }}>
            {fmtBRL(sugerido)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 180, background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>No seu preço atual, sobra</div>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: p > 0 ? moneyColor(sobra) : 'var(--text)' }}>
            {p > 0 ? `${fmtBRL(sobra)} (${Math.round((sobra / p) * 100)}%)` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function groupServicesByCategory(services: Service[]): [string, Service[]][] {
  const groups = new Map<string, Service[]>();
  for (const sv of services) {
    const key = sv.category?.trim() || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sv);
  }
  const categorized = [...groups.entries()].filter(([k]) => k).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  const uncategorized = groups.get('');
  return uncategorized && uncategorized.length ? [...categorized, ['', uncategorized]] : categorized;
}

export default function Catalogo() {
  const { data: services = [] } = useServices();
  const { isOwner } = useAuth();
  const [modal, setModal] = useState<'service' | null>(null);

  return (
    <>
      <PageHeader title="Serviços" subtitle="Preço, custo e margem de cada atendimento" />
      <div className="scroll-area">
        <div className="page">
          <div className="info-banner" style={{ background: 'var(--accent-soft)', color: 'var(--accent-dark)' }}>
            Produtos, descartáveis e equipamentos ficam todos na aba <strong>Estoque</strong> — cadastro e controle de quantidade juntos, no mesmo lugar.
          </div>

          <PriceSimulator />

          <div>
            <div className="section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Serviços (ficha técnica)
                </div>
                <div className="section-hint">Monte cada serviço com os produtos/equipamentos usados para calcular o custo variável automaticamente.</div>
              </div>
              {isOwner && (
                <button className="pill accent sm" onClick={() => setModal('service')}>
                  + Serviço
                </button>
              )}
            </div>
            {services.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {groupServicesByCategory(services).map(([category, group]) => (
                  <div key={category}>
                    {category && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em', marginBottom: 8, textTransform: 'uppercase' }}>{category}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {group.map((sv) => (
                        <ServiceRow key={sv.id} sv={sv} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhum serviço cadastrado ainda.</div>
            )}
          </div>
        </div>
      </div>
      {modal === 'service' && <ServiceModal onClose={() => setModal(null)} />}
    </>
  );
}
