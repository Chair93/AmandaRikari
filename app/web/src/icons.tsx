type IconProps = { size?: number; color?: string };

export function IconHome({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M3 8.6l7-5.6 7 5.6V17a1 1 0 01-1 1h-3.6v-4.6H7.6V18H4a1 1 0 01-1-1z" fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
export function IconList({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="3.5" y="2.5" width="13" height="15" rx="2.2" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M6.5 7h7M6.5 10.4h7M6.5 13.8h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export function IconUsers({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <circle cx="8" cy="7" r="3.2" fill="none" stroke={color} strokeWidth="1.7" />
      <path d="M2.5 17.5c0-3.3 2.5-5.4 5.5-5.4 1 0 1.9.24 2.7.66" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="14.6" cy="8.6" r="2.3" fill="none" stroke={color} strokeWidth="1.5" />
      <path d="M11.8 17.5c0-2.2 1.3-3.7 3-3.7 1.6 0 2.9 1.3 3 3.3" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export function IconCash({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="1.8" y="5.4" width="16.4" height="9.6" rx="2.2" fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="10" cy="10.2" r="2.5" fill="none" stroke={color} strokeWidth="1.5" />
      <path d="M4.6 8.2v4M15.4 8.2v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export function IconCalendarCheck({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="2.6" y="4" width="14.8" height="13.4" rx="2.4" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M2.6 8h14.8M6.6 2.6v3M13.4 2.6v3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 12.6l1.7 1.7 3.4-3.6" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconBarChart({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M2.6 17.4h14.8" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4" y="11" width="3.1" height="5.2" rx="1" fill={color} opacity="0.35" />
      <rect x="8.5" y="8" width="3.1" height="8.2" rx="1" fill={color} opacity="0.6" />
      <rect x="13" y="4.4" width="3.1" height="11.8" rx="1" fill={color} />
    </svg>
  );
}
export function IconBox({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M10 2.4l7 3.4v8.4l-7 3.4-7-3.4V5.8z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 5.8l7 3.4 7-3.4M10 9.2v8.4" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
export function IconTag({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M9.4 2.6H16a1.4 1.4 0 011.4 1.4v6.6l-7.4 7.4a1.4 1.4 0 01-2 0L3.4 12a1.4 1.4 0 010-2z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="13.4" cy="6.6" r="1.5" fill={color} />
    </svg>
  );
}
export function IconLines({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M2.6 4.4h14.8M4.8 9.4h10.4M7.4 14.4h5.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
export function IconGear({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="2.8" fill="none" stroke={color} strokeWidth="1.7" />
      <path
        d="M10 1.8v2.6M10 15.6v2.6M2.2 10h2.6M15.2 10h2.6M4.3 4.3l1.9 1.9M13.8 13.8l1.9 1.9M15.7 4.3l-1.9 1.9M6.2 13.8l-1.9 1.9"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function IconCalendar({ size = 21, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="2.6" y="4" width="14.8" height="13.4" rx="2.4" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M2.6 8h14.8M6.6 2.6v3M13.4 2.6v3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6.9" cy="11.6" r="1" fill={color} />
      <circle cx="10" cy="11.6" r="1" fill={color} />
      <circle cx="13.1" cy="11.6" r="1" fill={color} />
    </svg>
  );
}
export function IconSun({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
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
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M16.8 12.4A7 7 0 018.1 3.3a7.4 7.4 0 105.6 12.6c1.2-.6 2.2-1.5 3.1-3.5z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
export function IconChevronLeft({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14">
      <path d="M9 2L4 7l5 5" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconChevronRight({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14">
      <path d="M5 2l5 5-5 5" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
