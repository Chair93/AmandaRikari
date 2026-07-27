import { useEffect, useState } from 'react';
import { getStoredTheme, isEffectivelyDark, setTheme, type ThemePref } from '../theme';
import { IconMoon, IconSun } from '../icons';

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(getStoredTheme());

  useEffect(() => {
    setTheme(pref);
  }, [pref]);

  const dark = isEffectivelyDark(pref);

  return (
    <button
      onClick={() => setPref(dark ? 'light' : 'dark')}
      title={pref === 'system' ? 'Seguindo o sistema — toque para fixar um tema' : dark ? 'Modo escuro' : 'Modo claro'}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 999,
        color: 'var(--idle-color)',
        background: 'var(--surface-2)',
        flex: 'none',
      }}
    >
      {dark ? <IconMoon size={17} /> : <IconSun size={17} />}
    </button>
  );
}
