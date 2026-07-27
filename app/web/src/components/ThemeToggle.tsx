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
      className="theme-toggle"
      onClick={() => setPref(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Mudar para o modo claro' : 'Mudar para o modo noturno'}
      title={pref === 'system' ? 'Seguindo o sistema — toque para fixar um tema' : dark ? 'Modo escuro' : 'Modo claro'}
    >
      {dark ? <IconMoon size={17} /> : <IconSun size={17} />}
    </button>
  );
}
