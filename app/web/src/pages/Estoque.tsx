import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import {
  useDeleteEquipment,
  useDeleteProduct,
  useEquipment,
  useEquipmentBaixa,
  useEquipmentComprar,
  useEquipmentDeleteImpact,
  useProductDeleteImpact,
  useProductEntrada,
  useProductInventario,
  useProducts,
  useProductVender,
} from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, fmtDateBR, moneyColor, UNIT_LABEL } from '../format';
import type { Equipment, Product } from '../api/types';
import ProductModal from '../components/ProductModal';
import EquipmentModal from '../components/EquipmentModal';
import PromptModal from '../components/PromptModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

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

/** Stock is fractional now (atendimentos take their grams off the pot), so
 *  "0.7999999" needs to read as "0,8". */
function fmtUn(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function EstoqueRow({ p }: { p: Product }) {
  const { isOwner } = useAuth();
  const entrada = useProductEntrada();
  const vender = useProductVender();
  const inventario = useProductInventario();
  const del = useDeleteProduct();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: impact, isPending: impactPending } = useProductDeleteImpact(confirmDelete ? p.id : null);
  const [prompt, setPrompt] = useState<'entrada' | 'venda' | 'contagem' | null>(null);
  const custo = p.avgCost || p.packageCost;
  const valor = p.stock * p.packageCost;
  const margemUnit = p.salePrice - custo;

  return (
    <div className="list-row">
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {fmtBRL(p.packageCost)} / pacote de {p.packageQty} {UNIT_LABEL[p.unit] || p.unit}
          {p.salePrice > 0 ? ` · venda ${fmtBRL(p.salePrice)}` : ''}
        </div>
      </div>
      <div className="row-stats">
        {p.stock <= p.lowStockAt && <span className="badge warning">estoque baixo</span>}
        <ExpiryBadge expiresAt={p.expiresAt} />
        <span style={{ fontSize: 14, fontWeight: 700 }} title={p.unit !== 'unidade' ? `≈ ${Math.round(p.stock * p.packageQty)} ${UNIT_LABEL[p.unit] || p.unit} no total` : undefined}>
          {fmtUn(p.stock)} un
          {p.unit !== 'unidade' && !Number.isInteger(Math.round(p.stock * 100) / 100) && (
            <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-muted)' }}> ≈{Math.round(p.stock * p.packageQty)} {UNIT_LABEL[p.unit] || p.unit}</span>
          )}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{fmtBRL(valor)}</span>
        {p.salePrice > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: moneyColor(margemUnit) }}>
            {fmtBRL(margemUnit)} ({Math.round((margemUnit / p.salePrice) * 100)}%)
          </span>
        )}
      </div>
      {isOwner && (
        <div className="row-actions">
          <button className="pill sm" onClick={() => setPrompt('entrada')}>
            + Entrada
          </button>
          <button className="pill sm accent" style={{ color: 'white', background: 'var(--accent)' }} onClick={() => setPrompt('venda')} disabled={p.stock <= 0}>
            Vender
          </button>
          <button className="pill ghost sm" onClick={() => setPrompt('contagem')}>
            Contagem
          </button>
          <button className="pill ghost sm" onClick={() => setEditing(true)}>
            editar
          </button>
          <button className="icon-btn" aria-label={`Excluir ${p.name}`} onClick={() => setConfirmDelete(true)}>
            ×
          </button>
        </div>
      )}
      {editing && <ProductModal onClose={() => setEditing(false)} editingProduct={p} />}

      {confirmDelete && (
        <ConfirmDeleteModal
          name={p.name}
          what="produto"
          impact={impact}
          loading={impactPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await del.mutateAsync(p.id);
            setConfirmDelete(false);
          }}
        />
      )}

      {prompt === 'entrada' && (
        <PromptModal
          title={`Entrada de estoque — ${p.name}`}
          description="Registra a chegada de novos pacotes e recalcula o custo médio."
          fields={[
            { key: 'qty', label: 'Quantos pacotes entraram', defaultValue: '1', kind: 'qty' },
            { key: 'unitCost', label: 'Custo de cada pacote (R$)', defaultValue: String(p.packageCost).replace('.', ','), kind: 'money' },
          ]}
          checkboxLabel="Lançar também como saída no caixa (compra)"
          checkboxDefault
          confirmLabel="Dar entrada"
          onCancel={() => setPrompt(null)}
          onConfirm={async (v, lancarNoCaixa) => {
            await entrada.mutateAsync({ id: p.id, qty: v.qty as number, unitCost: v.unitCost as number, lancarNoCaixa });
            setPrompt(null);
          }}
        />
      )}

      {prompt === 'contagem' && (
        <PromptModal
          title={`Ajuste de inventário — ${p.name}`}
          description={`O app diz ${fmtUn(p.stock)} un${p.unit !== 'unidade' ? ` (≈ ${Math.round(p.stock * p.packageQty)} ${UNIT_LABEL[p.unit] || p.unit})` : ''}. Conte na prateleira e digite o número real — pode usar fração, ex: 0,5 = meio pacote. A diferença é lançada no resultado como perda ou ganho de inventário (${fmtBRL(custo)} por unidade), sem mexer no caixa.`}
          fields={[
            { key: 'real', label: 'Contagem real (un)', defaultValue: fmtUn(p.stock), kind: 'count' },
            { key: 'note', label: 'Motivo (opcional)', kind: 'text', required: false },
          ]}
          confirmLabel="Ajustar"
          onCancel={() => setPrompt(null)}
          onConfirm={async (v) => {
            await inventario.mutateAsync({ id: p.id, real: v.real as number, note: (v.note as string) || undefined });
            setPrompt(null);
          }}
        />
      )}

      {prompt === 'venda' && (
        <PromptModal
          title={`Vender — ${p.name}`}
          description={`Em estoque: ${fmtUn(p.stock)} un · custo médio ${fmtBRL(custo)}`}
          fields={[
            { key: 'qty', label: 'Quantas unidades', defaultValue: '1', kind: 'qty', hint: `Máximo ${fmtUn(p.stock)}` },
            { key: 'unitPrice', label: 'Preço de venda por unidade (R$)', defaultValue: String(p.salePrice || p.packageCost).replace('.', ','), kind: 'money' },
          ]}
          confirmLabel="Registrar venda"
          onCancel={() => setPrompt(null)}
          onConfirm={async (v) => {
            const qty = v.qty as number;
            if (qty > p.stock) throw new Error(`Você só tem ${p.stock} un em estoque.`);
            await vender.mutateAsync({ id: p.id, qty, unitPrice: v.unitPrice as number });
            setPrompt(null);
          }}
        />
      )}
    </div>
  );
}

function EquipmentRow({ eq }: { eq: Equipment }) {
  const { isOwner } = useAuth();
  const comprar = useEquipmentComprar();
  const baixa = useEquipmentBaixa();
  const del = useDeleteEquipment();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: impact, isPending: impactPending } = useEquipmentDeleteImpact(confirmDelete ? eq.id : null);
  const [prompt, setPrompt] = useState<'compra' | 'baixa' | null>(null);
  const isMaq = (eq.kind || (eq.kwh > 0 ? 'maquina' : 'utensilio')) === 'maquina';
  const q = eq.qty;
  const usos = eq.usos || 0;
  const totalUsos = eq.usefulUses * q;
  const depPct = totalUsos > 0 ? Math.min(100, Math.round((usos / totalUsos) * 100)) : 0;
  const depColor = depPct >= 100 ? 'var(--expense)' : depPct >= 80 ? 'oklch(70% 0.11 70)' : 'var(--accent)';
  const bruto = eq.cost * q;
  const residual = Math.max(0, bruto - (eq.depreciacaoAcumulada || 0));
  const perUse = eq.usefulUses > 0 ? eq.cost / eq.usefulUses : 0;

  return (
    <div className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 10 }}>
      {/* 1 1 240px, not flex:1 — with minWidth 0 the actions squeezed this
          column to nothing and the description broke one word per line. */}
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{eq.name}</span>
          <span className="badge" style={isMaq ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' } : { background: 'var(--income-soft)', color: 'var(--income-text)' }}>
            {isMaq ? 'máquina' : 'utensílio'}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {q === 0 ? 'cadastrado — dê entrada com + Compra' : `${q} ${q === 1 ? 'unidade' : 'unidades'} · ${fmtBRL(bruto)} em ativo`}
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
        <div className="row-actions">
          <button className="pill sm" style={{ color: 'var(--income-text)', background: 'var(--income-soft)' }} onClick={() => setPrompt('compra')}>
            + Compra
          </button>
          {q > 0 && (
            <button className="pill sm expense" onClick={() => setPrompt('baixa')}>
              Dar baixa
            </button>
          )}
          <button className="pill ghost sm" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button className="icon-btn" aria-label={`Excluir ${eq.name}`} onClick={() => setConfirmDelete(true)}>
            ×
          </button>
        </div>
      )}
      {editing && <EquipmentModal onClose={() => setEditing(false)} editingEquipment={eq} />}

      {confirmDelete && (
        <ConfirmDeleteModal
          name={eq.name}
          what="bem"
          impact={impact}
          loading={impactPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await del.mutateAsync(eq.id);
            setConfirmDelete(false);
          }}
        />
      )}

      {prompt === 'compra' && (
        <PromptModal
          title={`Comprar — ${eq.name}`}
          description="Sai do caixa e entra como ativo (não é despesa no Resultado)."
          fields={[
            { key: 'qty', label: 'Quantas unidades', defaultValue: '1', kind: 'qty' },
            { key: 'unitCost', label: 'Preço pago por unidade (R$)', defaultValue: String(eq.cost).replace('.', ','), kind: 'money' },
          ]}
          confirmLabel="Registrar compra"
          onCancel={() => setPrompt(null)}
          onConfirm={async (v) => {
            await comprar.mutateAsync({ id: eq.id, qty: v.qty as number, unitCost: v.unitCost as number });
            setPrompt(null);
          }}
        />
      )}

      {prompt === 'baixa' && (
        <PromptModal
          title={`Dar baixa — ${eq.name}`}
          description={
            residual > 0.005
              ? `Você tem ${q} ${q === 1 ? 'unidade' : 'unidades'}. Ainda restam ${fmtBRL(residual)} não depreciados — a parte baixada vira perda no Balanço.`
              : `Você tem ${q} ${q === 1 ? 'unidade' : 'unidades'}, já 100% depreciadas.`
          }
          fields={[{ key: 'qty', label: 'Quantas unidades baixar', defaultValue: String(q), kind: 'qty', hint: `Máximo ${q}` }]}
          confirmLabel="Dar baixa"
          onCancel={() => setPrompt(null)}
          onConfirm={async (v) => {
            const qty = v.qty as number;
            if (qty > q) throw new Error(`Você só tem ${q} ${q === 1 ? 'unidade' : 'unidades'}.`);
            await baixa.mutateAsync({ id: eq.id, qty });
            setPrompt(null);
          }}
        />
      )}
    </div>
  );
}

export default function Estoque() {
  const { data: products = [] } = useProducts();
  const { data: equipment = [] } = useEquipment();
  const { isOwner } = useAuth();
  const [modal, setModal] = useState<'product-op' | 'product-desc' | 'equipment' | null>(null);

  const operacionais = products.filter((p) => p.kind !== 'descartavel');
  const descartaveis = products.filter((p) => p.kind === 'descartavel');

  const totalValor = products.reduce((a, p) => a + p.stock * p.packageCost, 0);
  const totalVenda = products.reduce((a, p) => a + p.stock * p.salePrice, 0);
  const totalMargem = products.reduce((a, p) => (p.salePrice > 0 ? a + p.stock * (p.salePrice - (p.avgCost || p.packageCost)) : a), 0);
  const totalAtivos = equipment.reduce((a, eq) => a + Math.max(0, eq.cost * eq.qty - (eq.depreciacaoAcumulada || 0)), 0);

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
            <div className="section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Estoque operacional
                </div>
                <div className="section-hint">Insumos usados na ficha técnica dos atendimentos (cremes, séruns, etc.).</div>
              </div>
              {isOwner && (
                <button className="pill accent sm" onClick={() => setModal('product-op')}>
                  + Produto
                </button>
              )}
            </div>
            {operacionais.length > 0 ? (
              <div className="list">
                {operacionais.map((p) => (
                  <EstoqueRow key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>Nenhum produto operacional cadastrado.</span>
                {isOwner && (
                  <button className="btn-primary" onClick={() => setModal('product-op')}>
                    + Produto
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  Descartáveis
                </div>
                <div className="section-hint">Luvas, algodão, agulhas e outros itens de uso único.</div>
              </div>
              {isOwner && (
                <button className="pill accent sm" onClick={() => setModal('product-desc')}>
                  + Descartável
                </button>
              )}
            </div>
            {descartaveis.length > 0 ? (
              <div className="list">
                {descartaveis.map((p) => (
                  <EstoqueRow key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhum descartável cadastrado ainda.</div>
            )}
          </div>

          <div>
            <div className="section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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
              <div className="list">
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
      {modal === 'product-op' && <ProductModal onClose={() => setModal(null)} fixedKind="operacional" />}
      {modal === 'product-desc' && <ProductModal onClose={() => setModal(null)} fixedKind="descartavel" />}
      {modal === 'equipment' && <EquipmentModal onClose={() => setModal(null)} />}
    </>
  );
}
