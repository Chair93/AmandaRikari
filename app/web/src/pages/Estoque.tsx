import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useProductEntrada, useProducts, useProductVender } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { fmtBRL, fmtDateBR, moneyColor, numOr0, UNIT_LABEL } from '../format';
import type { Product } from '../api/types';
import ProductModal from '../components/ProductModal';
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

export default function Estoque() {
  const { data: products = [] } = useProducts();
  const navigate = useNavigate();
  const totalValor = products.reduce((a, p) => a + p.stock * p.packageCost, 0);
  const totalVenda = products.reduce((a, p) => a + p.stock * p.salePrice, 0);
  const totalMargem = products.reduce((a, p) => (p.salePrice > 0 ? a + p.stock * (p.salePrice - (p.avgCost || p.packageCost)) : a), 0);

  return (
    <>
      <PageHeader title="Estoque" subtitle="Produtos em estoque e valor imobilizado" />
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
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
              Comprar estoque não é prejuízo: o dinheiro sai do caixa e vira ativo aqui. O custo só entra no Resultado quando o produto é vendido ou usado num atendimento.
            </div>
          </div>

          {products.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--divider)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
              {products.map((p) => (
                <EstoqueRow key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span>Nenhum produto cadastrado. Cadastre no Catálogo com preço de venda para controlar o estoque aqui.</span>
              <button className="btn-primary" onClick={() => navigate('/catalogo')}>
                Abrir catálogo
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
