import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useDeleteEquipment, useEquipment, useEquipmentBaixa, useEquipmentComprar, useProductEntrada, useProducts, useProductVender } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, fmtDateBR, moneyColor, numOr0, UNIT_LABEL } from '../format';
import type { Equipment, Product } from '../api/types';
import ProductModal from '../components/ProductModal';
import EquipmentModal from '../components/EquipmentModal';
import { useNavigate } from 'react-router-dom';

function daysUntil(iso: string): number {
  const DAY = 86400000;
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((new Date(iso + 'T00:00:00').getTime() - today) / DAY);
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const dias = daysUntil(expiresAt);
  if (dias < 0) return <span className="badge expense">vencido há {-dias}d</span>;
  if (dias <= 30) return <span className="badge warning">vence em {dias}d ({fmtDateBR(expiresAt)})</span>;
  return <span className="badge">validade {fmtDateBR(expiresAt)}</span>;
}

function EstoqueRow({ p }: { p: Product }) {
  const { isOwner } = useAuth();
  const entrada = useProductEntrada();
  const vender = useProductVender();
  const [editing, setEditing] = useState(false);
  const custo = p.avgCost || p.packageCost;
  const valor = p.stock * p.packageCost;
  const margemUnit = p.salePrice - custo;

  async function onEntrada() {
    const qtdStr = window.prompt(`Quantos pacotes de "${p.name}" entraram no estoque?`, '1');
    if (!qtdStr) return;
    const qty = numOr0(qtdStr);
    if (qty <= 0) return;
    const precoStr = window.prompt('Quanto custou cada pacote agora? (R$)', String(p.packageCost).replace('.', ','));
    const unitCost = numOr0(precoStr) || p.packageCost;
    const lancar = window.confirm(`Lançar também a compra de ${fmtBRL(qty * unitCost)} como saída no caixa?`);
    await entrada.mutateAsync({ id: p.id, qty, unitCost, lancarNoCaixa: lancar });
  }

  async function onVender() {
    if (p.stock <= 0) {
      window.alert(`Sem estoque de "${p.name}".`);
      return;
    }
    const qtdStr = window.prompt(`Quantas unidades de "${p.name}" foram vendidas? (em estoque: ${p.stock})`, '1');
    if (!qtdStr) return;
    const qty = Math.min(numOr0(qtdStr), p.stock);
    if (qty <= 0) return;
    const precoPadrao = p.salePrice || p.packageCost;
    const precoStr = window.prompt('Preço de venda por unidade (R$)', String(precoPadrao).replace('.', ','));
    if (precoStr === null) return;
    const unitPrice = numOr0(precoStr) || precoPadrao;
    if (!window.confirm(`Vender ${qty} × ${p.name} por ${fmtBRL(qty * unitPrice)}?\nMargem: ${fmtBRL(qty * (unitPrice - custo))}`)) return;
    await vender.mutateAsync({ id: p.id, qty, unitPrice });
  }

  return (
    <div className="list-row" style={{ flexWrap: 'wrap', rowGap: 8 }}>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {fmtBRL(p.packageCost)} / pacote de {p.packageQty} {UNIT_LABEL[p.unit] || p.unit}
          {p.salePrice > 0 ? ` · venda ${fmtBRL(p.salePrice)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 'none' }}>
        {p.stock <= 1 && <span className="badge warning">estoque baixo</span>}
        <ExpiryBadge expiresAt={p.expiresAt} />
        <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{p.stock} un</span>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'right' }}>{fmtBRL(valor)}</span>
        {p.salePrice > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', color: moneyColor(margemUnit) }}>
            {fmtBRL(margemUnit)} ({Math.round((margemUnit / p.salePrice) * 100)}%)
          </span>
        )}
        {isOwner && (
          <>
            <button className="pill sm" onClick={onEntrada}>
              + Entrada
            </button>
            <button className="pill sm accent" style={{ color: 'white', background: 'var(--accent)' }} onClick={onVender}>
              Vender
            </button>
            <button className="pill ghost sm" onClick={() => setEditing(true)}>
              editar
            </button>
          </>
        )}
      </div>
      {editing && <ProductModal onClose={() => setEditing(false)} editingProduct={p} />}
    </div>
  );
}

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

export default function Estoque() {
  const { data: products = [] } = useProducts();
  const { data: equipment = [] } = useEquipment();
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const [modal, setModal] = useState<'product' | 'equipment' | null>(null);

  const operacionais = products.filter((p) => p.kind !== 'descartavel');
  const descartaveis = products.filter((p) => p.kind === 'descartavel');

  const totalValor = products.reduce((a, p) => a + p.stock * p.packageCost, 0);
  const totalVenda = products.reduce((a, p) => a + p.stock * p.salePrice, 0);
  const totalMargem = products.reduce((a, p) => (p.salePrice > 0 ? a + p.stock * (p.salePrice - (p.avgCost || p.packageCost)) : a), 0);
  const totalAtivos = equipment.reduce((a, eq) => a + Math.max(0, eq.cost * (eq.qty || 1) - (eq.depreciacaoAcumulada || 0)), 0);

  return (
    <>
      <PageHeader title="Estoque" subtitle="Estoque operacional, descartáveis e ativos" />
      <div className="scroll-area">
        <div className="page">
          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 26 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Valor imobilizado em estoque</div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 600 }}>
                {fmtBRL(totalValor)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Se vender tudo</div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 600 }}>
                {fmtBRL(totalVenda)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Margem embutida</div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: 'var(--income)' }}>
                {fmtBRL(totalMargem)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Ativos (valor residual)</div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 600 }}>
                {fmtBRL(totalAtivos)}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.5 }}>
              Comprar estoque não é prejuízo: o dinheiro sai do caixa e vira ativo aqui. O custo só entra no Resultado quando o produto é vendido ou usado num atendimento.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Estoque operacional
                </div>
                <div className="section-hint">Insumos usados na ficha técnica dos atendimentos (cremes, séruns, etc.).</div>
              </div>
              {isOwner && (
                <button className="pill accent sm" onClick={() => setModal('product')}>
                  + Produto
                </button>
              )}
            </div>
            {operacionais.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--divider)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                {operacionais.map((p) => (
                  <EstoqueRow key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>Nenhum produto operacional cadastrado.</span>
                {isOwner ? (
                  <button className="btn-primary" onClick={() => setModal('product')}>
                    + Produto
                  </button>
                ) : (
                  <button className="btn-primary" onClick={() => navigate('/catalogo')}>
                    Abrir catálogo
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Descartáveis
                </div>
                <div className="section-hint">Luvas, algodão, agulhas e outros itens de uso único.</div>
              </div>
              {isOwner && (
                <button className="pill accent sm" onClick={() => setModal('product')}>
                  + Produto
                </button>
              )}
            </div>
            {descartaveis.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--divider)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                {descartaveis.map((p) => (
                  <EstoqueRow key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhum descartável cadastrado ainda.</div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Ativos (equipamentos)
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
        </div>
      </div>
      {modal === 'product' && <ProductModal onClose={() => setModal(null)} />}
      {modal === 'equipment' && <EquipmentModal onClose={() => setModal(null)} />}
    </>
  );
}
