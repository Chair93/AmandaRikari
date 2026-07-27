import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients, useProducts, useServices } from '../api/hooks';

interface Command {
  id: string;
  label: string;
  hint: string;
  group: string;
  run: () => void;
}

const PAGES: { label: string; hint: string; to: string }[] = [
  { label: 'Início', hint: 'Atalhos do dia', to: '/' },
  { label: 'Agenda', hint: 'Horários e agendamentos', to: '/agenda' },
  { label: 'Lançamentos', hint: 'Atendimentos e gastos', to: '/lancamentos' },
  { label: 'Clientes', hint: 'Cadastro e histórico', to: '/clientes' },
  { label: 'Caixa', hint: 'Entradas e saídas do mês', to: '/caixa' },
  { label: 'Contas', hint: 'A pagar e a receber', to: '/contas' },
  { label: 'Relatórios', hint: 'Resultado e balanço', to: '/resultado' },
  { label: 'Estoque', hint: 'Produtos, descartáveis e ativos', to: '/estoque' },
  { label: 'Serviços', hint: 'Preço, custo e margem', to: '/catalogo' },
  { label: 'Categorias', hint: 'Tipos de gasto e receita', to: '/categorias' },
  { label: 'Ajustes', hint: 'Configurações e backup', to: '/ajustes' },
];

/** Strips accents so "serum" finds "Sérum" — nobody types the accent when
 *  they are in a hurry, which is the whole point of this. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Ctrl+K / ⌘K search over everything: pages, clients, products, services.
 *  Desktop affordance — a phone has no keyboard to reach for. */
export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Only fetched while open, so the palette costs nothing until it is used.
  const { data: clients = [] } = useClients(open);
  const { data: products = [] } = useProducts(open);
  const { data: services = [] } = useServices(open);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    // The "Buscar ⌘K" chip in page headers opens the palette by mouse too.
    function onChip() {
      setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('rikari:cmdk', onChip);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('rikari:cmdk', onChip);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // The input mounts with the dialog, so focus after paint.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = PAGES.map((p) => ({
      id: 'page:' + p.to,
      label: p.label,
      hint: p.hint,
      group: 'Ir para',
      run: () => navigate(p.to),
    }));
    clients.forEach((c) =>
      out.push({ id: 'client:' + c.id, label: c.name, hint: c.phone || 'Cliente', group: 'Clientes', run: () => navigate('/clientes') })
    );
    services.forEach((s) =>
      out.push({ id: 'service:' + s.id, label: s.name, hint: s.category || 'Serviço', group: 'Serviços', run: () => navigate('/catalogo') })
    );
    products.forEach((p) =>
      out.push({ id: 'product:' + p.id, label: p.name, hint: `${p.stock} em estoque`, group: 'Estoque', run: () => navigate('/estoque') })
    );
    return out;
  }, [clients, services, products, navigate]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return commands.slice(0, 8);
    return commands.filter((c) => fold(c.label).includes(q) || fold(c.hint).includes(q)).slice(0, 12);
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  function choose(c: Command | undefined) {
    if (!c) return;
    c.run();
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[cursor]);
    }
  }

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Buscar" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Buscar cliente, produto, página…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Buscar"
        />
        <div className="cmdk-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmdk-empty">Nada encontrado para “{query}”.</div>
          ) : (
            results.map((c, i) => {
              const newGroup = i === 0 || results[i - 1].group !== c.group;
              return (
                <div key={c.id}>
                  {newGroup && <div className="cmdk-group">{c.group}</div>}
                  <button
                    className="cmdk-item"
                    data-active={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(c)}
                  >
                    <span className="cmdk-label">{c.label}</span>
                    <span className="cmdk-hint">{c.hint}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-foot">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>
  );
}
