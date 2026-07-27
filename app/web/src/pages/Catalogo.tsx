import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useDeleteEquipment, useDeleteProduct, useDeleteService, useDuplicateService, useEquipmentBaixa, useEquipmentComprar, useEquipment, useProducts, useServices } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, moneyColor, numOr0, UNIT_LABEL } from '../format';
import ProductModal from '../components/ProductModal';
import EquipmentModal from '../components/EquipmentModal';
import ServiceModal from '../components/ServiceModal';
import type { Equipment, Product, Service } from '../api/types';

function EquipmentRow({ eq }: { eq: Equipment }) {
  const { isOwner } = useAuth();
  const comprar = useEquipmentComprar();
  const baixa = useEquipmentBaixa();
  const del = useDeleteEquipment();
  const [editing, setEditing] = useState(false);
  const isMaq = (eq.kind || (eq.kwh > 0 ? 'maquina' : 'utensilio')) === 'maquina';
  const q = eq.qty || 1;
  const usos = eq.usos || 0;
  const totalUsos = eq.usefulUses * q;
  const depPct = totalUsos > 0 ? Math.min(100, Math.round((usos / totalUsos) * 100)) : 0;
  const depColor = depPct >= 100 ? 'var(--expense)' : depPct >= 80 ? 'oklch(70% 0.11 70)' : 'var(--accent)';
  const bruto = eq.cost * q;
  const residual = Math.max(0, bruto - (eq.depreciacaoAcumulada || 0));
  const perUse = eq.usefulUses > 0 ? eq.cost / eq.usefulUses : 0;

  async function onComprar() {
    const qtdStr = window.prompt(`Quantas unidades de "${eq.name}" você comprou?`, '1');
    if (!qtdStr) return;
    const qty = numOr0(qtdStr);
    if (qty <= 0) return;
    const precoStr = window.prompt('Preço pago por unidade (R$)', String(eq.cost).replace('.', ','));
    if (precoStr === null) return;
    const unitCost = numOr0(precoStr) || eq.cost;
    if (!window.confirm(`Comprar ${qty} × ${eq.name} por ${fmtBRL(qty * unitCost)}?\n\nSai do caixa e entra como ativo (não é despesa no Resultado).`)) return;
    await comprar.mutateAsync({ id: eq.id, qty, unitCost });
  }

  async function onBaixa() {
    const qtdStr = window.prompt(`Dar baixa em quantas unidades de "${eq.name}"? (você tem ${q})`, String(q));
    if (!qtdStr) return;
    const qty = Math.min(numOr0(qtdStr), q);
    if (qty <= 0) return;
    const resid = q > 0 ? residual * (qty / q) : 0;
    const msg = resid > 0.005 ? `Dar baixa em ${qty} × ${eq.name}?\n\nAinda restam ${fmtBRL(resid)} não depreciados — vira perda no Balanço.` : `Dar baixa em ${qty} × ${eq.name}? Já está 100% depreciado.`;
    if (!window.confirm(msg)) return;
    await baixa.mutateAsync({ id: eq.id, qty });
  }

  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{eq.name}</span>
          <span className="badge" style={isMaq ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' } : { background: 'var(--income-soft)', color: 'var(--income-text)' }}>
            {isMaq ? 'máquina' : 'utensílio'}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {q} {q === 1 ? 'unidade' : 'unidades'} · {fmtBRL(bruto)} em ativo
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {fmtBRL(perUse)} depreciação/uso · {eq.usefulUses} usos por unidade{isMaq && eq.kwh > 0 ? ` + ${String(eq.kwh).replace('.', ',')} kWh/hora` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, maxWidth: 340 }}>
          <div className="progress-track" style={{ flex: 1, minWidth: 70, height: 5 }}>
            <div className="progress-fill" style={{ width: `${depPct}%`, background: depColor }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {totalUsos > 0 ? `${usos} de ${totalUsos} usos · ${depPct}% depreciado` : `${usos} usos`} · resta {fmtBRL(residual)}
          </span>
        </div>
        {eq.baixas > 0 && <div style={{ fontSize: 11, color: 'var(--expense-text)', marginTop: 3 }}>{eq.baixas} unidade(s) baixada(s)</div>}
      </div>
      {isOwner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
          <button className="pill sm" style={{ color: 'var(--income-text)', background: 'var(--income-soft)' }} onClick={onComprar}>
            + Compra
          </button>
          {q > 0 && (
            <button className="pill sm expense" onClick={onBaixa}>
              Dar baixa
            </button>
          )}
          <button className="pill ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button className="icon-btn" onClick={() => del.mutate(eq.id)}>
            ×
          </button>
        </div>
      )}
      {editing && <EquipmentModal onClose={() => setEditing(false)} editingEquipment={eq} />}
    </div>
  );
}

function ServiceRow({ sv }: { sv: Service }) {
  const { isOwner } = useAuth();
  const del = useDeleteService();
  const duplicate = useDuplicateService();
  const [editing, setEditing] = useState(false);
  const margin = sv.price - sv.cost;
  const marginPct = sv.price > 0 ? (margin / sv.price) * 100 : 0;
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{sv.name}</span>
          {sv.category && <span className="badge">{sv.category}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
          {sv.items.length} {sv.items.length === 1 ? 'item na ficha técnica' : 'itens na ficha técnica'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Custo variável</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(sv.cost)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Preço sugerido</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(sv.price)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Margem</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: moneyColor(margin) }}>
            {fmtBRL(margin)} ({Math.round(marginPct)}%)
          </div>
        </div>
        {isOwner && (
          <>
            <button className="pill ghost sm" onClick={() => duplicate.mutate(sv.id)} disabled={duplicate.isPending}>
              Duplicar
            </button>
            <button className="pill ghost sm" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button className="icon-btn" onClick={() => del.mutate(sv.id)}>
              ×
            </button>
          </>
        )}
      </div>
      {editing && <ServiceModal onClose={() => setEditing(false)} editingService={sv} />}
    </div>
  );
}

function ProductRow({ p }: { p: Product }) {
  const { isOwner } = useAuth();
  const del = useDeleteProduct();
  const [editing, setEditing] = useState(false);
  const perUnit = p.packageQty > 0 ? p.packageCost / p.packageQty : 0;
  return (
    <div className="list-row">
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {fmtBRL(perUnit)} / {UNIT_LABEL[p.unit] || p.unit}
        </div>
      </div>
      {isOwner && (
        <>
          <button className="pill ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button className="icon-btn" onClick={() => del.mutate(p.id)}>
            ×
          </button>
        </>
      )}
      {editing && <ProductModal onClose={() => setEditing(false)} editingProduct={p} />}
    </div>
  );
}

function PriceSimulator() {
  const { data: services = [] } = useServices();
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
  const sugerido = m < 95 ? c / (1 - m / 100) : c;

  return (
    <div style={{ background: 'linear-gradient(135deg, var(--surface-2), var(--surface))', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '18px 20px' }}>
      <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>
        Simulador de preço
      </div>
      <div className="section-hint" style={{ marginBottom: 14 }}>
        Quanto cobrar para sobrar a margem que você quer — e quanto sobra no preço que você já cobra.
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
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: p > 0 ? moneyColor(p - c) : 'var(--text)' }}>
            {p > 0 ? `${fmtBRL(p - c)} (${Math.round(((p - c) / p) * 100)}%)` : '—'}
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
  const { data: products = [] } = useProducts();
  const { data: equipment = [] } = useEquipment();
  const { data: services = [] } = useServices();
  const { isOwner } = useAuth();
  const [modal, setModal] = useState<'product' | 'equipment' | 'service' | null>(null);

  return (
    <>
      <PageHeader title="Produtos e serviços" subtitle="Produtos, equipamentos e serviços para calcular custo e margem" />
      <div className="scroll-area">
        <div className="page">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="section-title">Produtos e insumos</div>
              {isOwner && (
                <button className="pill accent sm" onClick={() => setModal('product')}>
                  + Produto
                </button>
              )}
            </div>
            {products.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--divider)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                {products.map((p) => (
                  <ProductRow key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhum produto cadastrado. Cadastre cremes, séruns e outros insumos com o custo por ml/g/unidade.</div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Bens e utensílios
                </div>
                <div className="section-hint">Coisas que duram e se gastam com o uso. A compra é ativo, não despesa.</div>
              </div>
              {isOwner && (
                <button className="pill accent sm" onClick={() => setModal('equipment')}>
                  + Bem
                </button>
              )}
            </div>
            {equipment.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--divider)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                {equipment.map((eq) => (
                  <EquipmentRow key={eq.id} eq={eq} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                Nada cadastrado. Cadastre potinhos, frascos e pinças como <strong>utensílio</strong> (custo dividido pelos usos) e aparelhos que ligam na tomada como <strong>máquina</strong> (usos + energia por minuto).
              </div>
            )}
          </div>

          <PriceSimulator />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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
      {modal === 'product' && <ProductModal onClose={() => setModal(null)} />}
      {modal === 'equipment' && <EquipmentModal onClose={() => setModal(null)} />}
      {modal === 'service' && <ServiceModal onClose={() => setModal(null)} />}
    </>
  );
}
