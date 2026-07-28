import { useState } from 'react';

const KEY = 'rikari.showValues';

/** The privacy toggle ("Margem oculta/visível") used to reset on every page
 *  switch — each screen kept its own useState(false), so hiding values on
 *  Caixa and opening Relatórios showed them again. One stored preference,
 *  shared by every screen that masks money. */
export function useMaskPref(): [boolean, (v: boolean) => void] {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setShow(v);
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* private mode — the choice just doesn't persist */
    }
  };
  return [show, set];
}
