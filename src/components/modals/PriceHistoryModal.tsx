import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, History } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, useStore } from '../../store';
import { supabaseClient } from '../../lib/supabase';
import { formatUSD } from '../../lib/format';
import type { PriceChange } from '../../types';

const FIELD: Record<PriceChange['field'], string> = { sale_price: 'Precio de venta', min_price: 'Precio mínimo', cost_price: 'Costo' };

/** Quién cambió un precio, cuándo y de cuánto a cuánto */
export default function PriceHistoryModal() {
  const p = useStore(s => s.priceHistoryProduct);
  const open = useStore(s => !!s.modals['price-history-modal']);
  const mode = useStore(s => s.mode);
  const storeId = useStore(s => s.activeStore?.store_id);
  const local = useStore(s => s.priceHistory);
  const [rows, setRows] = useState<PriceChange[] | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || !p) return;
    setNote('');
    if (mode !== 'cloud') { setRows(local.filter(r => r.product_id === p.id)); return; }
    setRows(null);
    if (!supabaseClient || !storeId) { setRows([]); return; }
    let live = true;
    supabaseClient.from('price_history').select('*').eq('store_id', storeId).eq('product_id', p.id).order('changed_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setRows([]); setNote('Falta ejecutar supabase/5-mejoras-v4.sql en Supabase para activar el historial.'); return; }
        setRows((data || []) as PriceChange[]);
      });
    return () => { live = false; };
  }, [open, p, mode, storeId, local]);

  return (
    <Modal id="price-history-modal" className="z-[60] bg-[#1e1427]/60">
      {p && (
        <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-3"><h2 className="font-bold text-xl hero-title flex items-center gap-2"><History className="w-5 h-5 text-[#7c43ba]" /> Historial de precios</h2><CloseButton onClick={() => closeModal('price-history-modal')} /></div>
          <p className="font-bold text-sm">{p.name}</p>
          <p className="text-xs text-[#756c7e] mb-4">Ahora: venta {formatUSD(p.sale_price)} · mínimo {formatUSD(p.min_price || 0)} · costo {formatUSD(p.cost_price)}</p>
          {rows === null && <p className="text-sm text-[#756c7e] text-center py-6">Cargando...</p>}
          {note && <p className="text-xs text-[#92400e] bg-[#fffbeb] border border-[#fde68a] rounded-xl p-3 mb-3">{note}</p>}
          {rows && rows.length === 0 && !note && <p className="text-sm text-[#756c7e] text-center py-6">Este producto aún no tiene cambios de precio.</p>}
          <div className="space-y-2">
            {rows?.map(r => {
              const up = Number(r.new_value) > Number(r.old_value);
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#faf7fc]">
                  <span className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 ${up ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fff0f3] text-[#a43658]'}`}>{up ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{FIELD[r.field]}: {formatUSD(r.old_value)} → {formatUSD(r.new_value)}</p>
                    <p className="text-[11px] text-[#756c7e]">{new Date(r.changed_at).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{r.changed_by_name ? ` · ${r.changed_by_name}` : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      )}
    </Modal>
  );
}
