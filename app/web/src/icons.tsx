import type { ReactNode } from 'react';

type IconProps = { size?: number; color?: string };

/** The nav set shares one geometry contract: a 24px grid, a single 1.75px
 *  stroke, integer-friendly coordinates. The old set mixed four stroke
 *  weights (1.5–1.8) and was drawn on a 20 grid but displayed at 21/24, so
 *  nothing ever landed on the pixel grid — that's why it read as soft.
 *
 *  Layers inside each icon:
 *  - .ic-st   the stroke drawing (always visible)
 *  - .ic-duo  an accent-toned area CSS fades in on the active rail item
 *  - .ic-fl   a solid variant CSS swaps in on the phone's active tab
 */
function Base({ size, color, duo, st, fl }: { size: number; color: string; duo?: ReactNode; st: ReactNode; fl?: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={fl ? 'has-fl' : undefined}
      aria-hidden="true"
    >
      {duo}
      <g className="ic-st">{st}</g>
      {fl && (
        <g className="ic-fl" fill="currentColor" stroke="none">
          {fl}
        </g>
      )}
    </svg>
  );
}

const duoPath = (d: string) => <path className="ic-duo" d={d} fill="currentColor" stroke="none" />;

export function IconHome({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M9 21v-6h6v6z')}
      st={<path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5Z" />}
      fl={<path fillRule="evenodd" d="M12 3.2l8.8 7.7c.13.12.2.3.2.6v8a2.5 2.5 0 0 1-2.5 2.5H15a1 1 0 0 1-1-1v-5h-4v5a1 1 0 0 1-1 1H5.5A2.5 2.5 0 0 1 3 19.5v-8c0-.3.07-.48.2-.6z" />}
    />
  );
}

export function IconCalendar({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M4 10h16v7.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z')}
      st={
        <>
          <rect x="4" y="5" width="16" height="15" rx="2.5" />
          <path d="M4 10h16M8 3v4M16 3v4" />
          <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
        </>
      }
      fl={
        <>
          <path fillRule="evenodd" d="M3.5 10h17v7.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5zM12 13.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z" />
          <path d="M3.5 8.2V7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5v.7zM8 2.8a1 1 0 0 1 1 1V5H7V3.8a1 1 0 0 1 1-1zM16 2.8a1 1 0 0 1 1 1V5h-2V3.8a1 1 0 0 1 1-1z" />
        </>
      }
    />
  );
}

/** Lançamentos — a receipt with a deckled edge, instead of a generic doc. */
export function IconList({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z')}
      st={
        <>
          <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V3z" />
          <path d="M9.5 8.5h5M9.5 12.5h5" />
        </>
      }
      fl={<path fillRule="evenodd" d="M5.5 2.5h13V21l-2.2-1.6-2.15 1.6-2.15-1.6L9.85 21 7.7 19.4 5.5 21zM9 7.5h6v2H9zm0 4h6v2H9z" />}
    />
  );
}

export function IconUsers({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M3 20c.4-3.7 3-5.5 6.5-5.5S15.6 16.3 16 20z')}
      st={
        <>
          <circle cx="9.5" cy="8" r="3.5" />
          <path d="M3 20c.4-3.7 3-5.5 6.5-5.5s6.1 1.8 6.5 5.5" />
          <path d="M16 5.1a3.5 3.5 0 0 1 0 5.8M18.7 15.6c1.5.9 2.2 2.4 2.3 4.4" />
        </>
      }
      fl={
        <>
          <circle cx="9.5" cy="7.5" r="4" />
          <path d="M2.5 20.5c.4-4 3.2-6 7-6s6.6 2 7 6z" />
          <path d="M16.5 3.9a4 4 0 0 1 0 7.6c1.9-2.3 1.9-5.3 0-7.6zM18.4 15.1c2 .9 3 2.7 3.1 5.4h-2.7c-.1-2.2-.6-3.9-1.7-5z" opacity="0.55" />
        </>
      }
    />
  );
}

/** Caixa — a wallet. The old banknote glyph read like a 1995 cash register. */
export function IconCash({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M16.75 11H21v4.5h-4.25a2.25 2.25 0 0 1 0-4.5z')}
      st={
        <>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M21 11h-4.25a2.25 2.25 0 0 0 0 4.5H21" />
          <circle cx="16.75" cy="13.25" r="1.1" fill="currentColor" stroke="none" />
        </>
      }
      fl={<path fillRule="evenodd" d="M2.5 8A2.5 2.5 0 0 1 5 5.5h14A2.5 2.5 0 0 1 21.5 8v9a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 17zm14.25 2.5a2.75 2.75 0 0 0 0 5.5h4.75v-5.5z" />}
    />
  );
}

export function IconCalendarCheck({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M4 10h16v7.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z')}
      st={
        <>
          <rect x="4" y="5" width="16" height="15" rx="2.5" />
          <path d="M4 10h16M8 3v4M16 3v4" />
          <path d="M8.75 14.5l2.25 2.25L15.5 12" />
        </>
      }
    />
  );
}

/** Relatórios — solid bars. The old opacity ramp (35%/60%/100%) was soft by
 *  construction; state should come from geometry, not transparency. */
export function IconBarChart({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      st={
        <>
          <rect x="5.25" y="13" width="3.5" height="6" rx="0.9" fill="currentColor" stroke="none" />
          <rect x="10.25" y="9" width="3.5" height="10" rx="0.9" fill="currentColor" stroke="none" />
          <rect x="15.25" y="4.5" width="3.5" height="14.5" rx="0.9" fill="currentColor" stroke="none" />
          <path d="M4 21.5h16" />
        </>
      }
    />
  );
}

export function IconBox({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M12 3l8 4.2-8 4.2-8-4.2z')}
      st={
        <>
          <path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z" />
          <path d="M4 7.2l8 4.2 8-4.2M12 11.4V21" />
        </>
      }
    />
  );
}

export function IconTag({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M12.6 3H19a2 2 0 0 1 2 2v6.4L12.4 20a2.2 2.2 0 0 1-3.1 0L3 13.7a2.2 2.2 0 0 1 0-3.1z')}
      st={
        <>
          <path d="M12.6 3H19a2 2 0 0 1 2 2v6.4L12.4 20a2.2 2.2 0 0 1-3.1 0L3 13.7a2.2 2.2 0 0 1 0-3.1z" />
          <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
        </>
      }
    />
  );
}

/** Categorias — a 2×2 grid. Three shrinking lines read as "filter". */
export function IconLines({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      duo={duoPath('M13 13h7v5.2A1.8 1.8 0 0 1 18.2 20H13z')}
      st={
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.8" />
          <rect x="13" y="4" width="7" height="7" rx="1.8" />
          <rect x="4" y="13" width="7" height="7" rx="1.8" />
          <rect x="13" y="13" width="7" height="7" rx="1.8" />
        </>
      }
    />
  );
}

/** Ajustes — sliders. An 8-spoke gear turns to mush below 24px. */
export function IconGear({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Base
      size={size}
      color={color}
      st={
        <>
          <path d="M4 6h7.5M16.5 6H20M4 12h2.5M11 12h9M4 18h9.5M18.5 18H20" />
          <circle cx="14" cy="6" r="2.1" />
          <circle cx="8.5" cy="12" r="2.1" />
          <circle cx="16" cy="18" r="2.1" />
        </>
      }
    />
  );
}

/* Small utility glyphs. Drawn on their own grids because they render at
 * 14–17px, where a 24-grid 1.75 stroke would thin out to ~1px. */

export function IconSun({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="3.6" fill="none" stroke={color} strokeWidth="1.6" />
      <path
        d="M10 1.8v2.3M10 15.9v2.3M18.2 10h-2.3M4.1 10H1.8M15.5 4.5l-1.6 1.6M6.1 13.9l-1.6 1.6M15.5 15.5l-1.6-1.6M6.1 6.1L4.5 4.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function IconMoon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16.8 12.4A7 7 0 018.1 3.3a7.4 7.4 0 105.6 12.6c1.2-.6 2.2-1.5 3.1-3.5z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
export function IconChevronLeft({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M9 2L4 7l5 5" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconChevronRight({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M5 2l5 5-5 5" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
