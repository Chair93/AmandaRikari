import type { ReactNode } from 'react';

/** ⌘ on Apple hardware, Ctrl elsewhere — the chip should teach the real key. */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export default function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="app-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* The palette existed before this chip, but an invisible shortcut is
            one nobody discovers. The chip teaches it just by being there.
            Hidden on phones via CSS — no keyboard to reach for. */}
        <button className="kbd-hint" onClick={() => window.dispatchEvent(new CustomEvent('rikari:cmdk'))}>
          Buscar <kbd>{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        {right}
      </div>
    </header>
  );
}
