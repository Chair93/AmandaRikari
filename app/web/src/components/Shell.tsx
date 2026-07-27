import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
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
      { to: '/catalogo', label: 'Produtos e serviços', icon: IconTag },
      { to: '/categorias', label: 'Categorias', icon: IconLines },
      { to: '/ajustes', label: 'Ajustes', icon: IconGear },
    ],
  },
];

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div style={{ width: 54, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <img src="/ar-mark-t.png" alt="AR" style={{ width: '100%', height: 'auto' }} />
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
        <div style={{ flex: 1 }} />
        <ThemeToggle />
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}
