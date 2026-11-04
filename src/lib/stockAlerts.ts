import { useMemo } from 'react';
import { getState, setState, toast, useStore } from '../store';
import { getLowStockProducts, getOutOfStockProducts } from './selectors';

// ==========================================
// AVISOS DE AGOTADOS Y STOCK BAJO QUE SE PUEDEN OCULTAR
// ==========================================
// Al ocultar un aviso se guardan los productos que había en ese momento. Si después
// otro producto se agota (o uno repuesto vuelve a bajar), el aviso aparece de nuevo
// solo por ese producto. Las listas de Agotados y Stock bajo siempre muestran todo.

const HIDDEN_KEY = 'mn7_stock_hidden';
type Kind = 'out' | 'low';

function save(hidden: { out: string[]; low: string[] }) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); } catch { /* sin espacio */ }
  setState({ stockHidden: hidden });
}

/** Cantidades: total y "nuevos" (sin ocultar) de agotados y stock bajo */
export function useStockAlerts() {
  const records = useStore(s => s.records);
  const lowDefault = useStore(s => s.lowStockDefault);
  const hidden = useStore(s => s.stockHidden);
  return useMemo(() => {
    const out = getOutOfStockProducts(records).map(r => r.id);
    const low = getLowStockProducts(records, lowDefault).map(r => r.id);
    const ho = new Set(hidden.out), hl = new Set(hidden.low);
    const outNew = out.filter(id => !ho.has(id)).length;
    const lowNew = low.filter(id => !hl.has(id)).length;
    return { out: out.length, low: low.length, outNew, lowNew, newTotal: outNew + lowNew };
  }, [records, lowDefault, hidden]);
}

/** Oculta el aviso de los productos que hoy están agotados y/o con stock bajo */
export function hideStockAlerts(kinds: Kind[] = ['out', 'low'], silent = false) {
  const { records, lowStockDefault, stockHidden } = getState();
  const next = { ...stockHidden };
  if (kinds.includes('out')) next.out = getOutOfStockProducts(records).map(r => r.id);
  if (kinds.includes('low')) next.low = getLowStockProducts(records, lowStockDefault).map(r => r.id);
  save(next);
  if (!silent) toast('🔕 Aviso ocultado. Te avisaremos si otro producto se agota o baja de stock.', 3500);
}

/** Vuelve a mostrar los avisos ocultos */
export function showStockAlertsAgain(kinds: Kind[] = ['out', 'low']) {
  const next = { ...getState().stockHidden };
  kinds.forEach(k => { next[k] = []; });
  save(next);
  toast('🔔 Avisos visibles otra vez');
}
