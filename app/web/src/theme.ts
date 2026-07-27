export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'rikari-theme';

export function getStoredTheme(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function setTheme(pref: ThemePref) {
  if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}

export function isEffectivelyDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
