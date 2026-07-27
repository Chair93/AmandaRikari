import { NavLink } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import {
  IconHome,
  IconList,
  IconUsers,
  IconCash,
  IconCalendar,
  IconCalendarCheck,
  IconBarChart,
  IconBox,
  IconTag,
  IconLines,
  IconGear,
} from '../icons';
import ThemeToggle from './ThemeToggle';

const NAV = [
  {
    section: 'Dia a dia',
    items: [
      { to: '/', label: 'Início', icon: IconHome, end: true },
      { to: '/agenda', label: 'Agenda', icon: IconCalendar },
      { to: '/lancamentos', label: 'Lançamentos', icon: IconList },
      { to: '/clientes', label: 'Clientes', icon: IconUsers },
    ],
  },
  {
    section: 'Financeiro',
    items: [
      { to: '/caixa', label: 'Caixa', icon: IconCash },
      { to: '/contas', label: 'Contas', icon: IconCalendarCheck },
      { to: '/resultado', label: 'Relatórios', icon: IconBarChart },
    ],
  },
  {
    section: 'Cadastros',
    items: [
      { to: '/estoque', label: 'Estoque', icon: IconBox },
      { to: '/catalogo', label: 'Serviços', icon: IconTag },
      { to: '/categorias', label: 'Categorias', icon: IconLines },
      { to: '/ajustes', label: 'Ajustes', icon: IconGear },
    ],
  },
];

const COLLAPSE_KEY = 'rikari.navCollapsed';

export default function Shell({ children }: { children: ReactNode }) {
  // Desktop only — the phone nav is a bottom tab strip and ignores this.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode — the choice just doesn't persist */
    }
  }, [collapsed]);

  return (
    <div className={'app-shell' + (collapsed ? ' nav-collapsed' : '')}>
      <nav className="app-nav">
        <div className="nav-brand">
          <img src="/ar-mark-t.png" alt="AR" />
        </div>
        {NAV.map((group) => (
          <div key={group.section} style={{ display: 'contents' }}>
            <div className="nav-section-label">{group.section.toUpperCase()}</div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')}>
                <span className="nav-bar" />
                <item.icon color="currentColor" size={24} />
                <span className="label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <button
        className="nav-collapse"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Deliberately a sibling of the nav, not a child. The mobile nav sets
          backdrop-filter, which makes it the containing block for any fixed
          descendant — the toggle ended up pinned inside the tab bar instead
          of the top of the screen. */}
      <ThemeToggle />
      <main className="app-main">{children}</main>
    </div>
  );
}
