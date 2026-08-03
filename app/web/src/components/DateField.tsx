import { useRef, type CSSProperties } from 'react';
import { fmtDateBR } from '../format';

/** Native date inputs render in the BROWSER's language, not the app's — on
 *  an English-language browser every date field shows month/day (08/03 =
 *  3 de agosto) and no CSS or lang attribute can change that. This wrapper
 *  keeps the native picker (great on phones) but paints the value itself,
 *  so it always reads dd/mm/aaaa. */
export default function DateField({
  value,
  onChange,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span
      className="input date-field"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', ...style }}
      onClick={() => {
        const el = ref.current;
        if (!el) return;
        try {
          el.showPicker?.();
        } catch {
          /* older Safari: focusing still opens the native wheel on touch */
        }
        el.focus();
      }}
    >
      <span style={{ whiteSpace: 'nowrap', color: value ? undefined : 'var(--text-muted)' }}>{value ? fmtDateBR(value) : 'dd/mm/aaaa'}</span>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: 'none', opacity: 0.55 }}>
        <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="date"
        aria-label={ariaLabel || 'Data'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, padding: 0, margin: 0 }}
      />
    </span>
  );
}
