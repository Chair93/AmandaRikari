// Client-side mirrors of app/server/src/calc.ts, used only for instant preview
// inside forms — the backend recomputes the authoritative values on save.
import type { Equipment, Product, Settings } from './api/types';
import { numOr0 } from './format';

function isMaquina(eq: Equipment): boolean {
  return (eq.kind || (eq.kwh > 0 ? 'maquina' : 'utensilio')) === 'maquina';
}

export function computeServiceCostPreview(
  items: { kind: string; refId: string; qty: number | string }[],
  products: Product[],
  equipment: Equipment[],
  settings: Settings | undefined
): number {
  const energyPrice = numOr0(settings?.energyPricePerKwh);
  return items.reduce((sum, it) => {
    if (it.kind === 'product') {
      const p = products.find((x) => x.id === it.refId);
      if (!p) return sum;
      const base = numOr0(p.avgCost) || numOr0(p.packageCost);
      const perUnit = numOr0(p.packageQty) > 0 ? base / numOr0(p.packageQty) : 0;
      return sum + perUnit * numOr0(it.qty);
    }
    const eq = equipment.find((x) => x.id === it.refId);
    if (!eq) return sum;
    const porUso = numOr0(eq.usefulUses) > 0 ? numOr0(eq.cost) / numOr0(eq.usefulUses) : 0;
    if (isMaquina(eq)) {
      const minutos = numOr0(it.qty);
      return sum + porUso + numOr0(eq.kwh) * (minutos / 60) * energyPrice;
    }
    const usos = Math.max(1, numOr0(it.qty));
    return sum + porUso * usos;
  }, 0);
}

export function feePctForPreview(method: string | null | undefined, settings: Settings | undefined): number {
  if (!settings) return 0;
  if (method === 'credito') return numOr0(settings.taxaCredito);
  if (method === 'debito') return numOr0(settings.taxaDebito);
  if (method === 'pix') return numOr0(settings.taxaPix);
  return 0;
}
