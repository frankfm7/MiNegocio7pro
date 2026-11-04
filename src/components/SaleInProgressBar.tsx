import { ShoppingCart, X } from 'lucide-react';
import { useStore } from '../store';
import { startQuickScanMode, stopQuickScanMode } from '../actions';
import { formatUSD } from '../lib/format';

/**
 * Botón flotante de la venta en curso: se ve mientras haya productos agregados
 * (o un recibo al que se le están sumando productos) y se cierra solo al
 * finalizar la venta o si el usuario la descarta con la ✕.
 */
export default function SaleInProgressBar() {
  const items = useStore(s => s.quickScanItems);
  const carry = useStore(s => s.receiptCarry);
  const discount = useStore(s => s.quickScanDiscount);
  const hidden = useStore(s => !!(s.modals['quick-scan-modal'] || s.modals['sale-receipt-modal'] || s.modals['sale-modal']));
  const welcome = useStore(s => s.welcomeVisible);
  const selecting = useStore(s => s.notaSel.length > 0);
  if ((!items.length && !carry) || hidden || welcome || selecting) return null;
  const count = items.reduce((a, i) => a + i.quantity, 0);
  const total = items.reduce((a, i) => a + i.price * i.quantity, 0) - discount + (carry ? carry.total : 0);
  return (
    <div id="sale-in-progress" className="sale-progress fixed z-[45] left-3 right-3 mx-auto max-w-md rounded-2xl bg-[#166534] text-white shadow-2xl flex items-center gap-2 p-2 pl-3">
      <ShoppingCart className="w-5 h-5 flex-shrink-0" />
      <button type="button" onClick={startQuickScanMode} className="flex-1 min-w-0 text-left">
        <p className="text-[11px] opacity-85 leading-tight">{carry ? 'Agregando a la venta' : 'Venta en curso'} · {count} {count === 1 ? 'producto' : 'productos'}{carry ? ' nuevos' : ''}</p>
        <p className="font-bold text-sm leading-tight truncate">Total {formatUSD(total)}</p>
      </button>
      <button type="button" onClick={startQuickScanMode} className="px-3 py-2 rounded-xl bg-white text-[#166534] font-bold text-sm flex-shrink-0">Finalizar venta</button>
      <button type="button" onClick={() => stopQuickScanMode()} className="w-8 h-8 rounded-full bg-white/15 grid place-items-center flex-shrink-0" aria-label="Descartar venta en curso" title="Descartar"><X className="w-4 h-4" /></button>
    </div>
  );
}
