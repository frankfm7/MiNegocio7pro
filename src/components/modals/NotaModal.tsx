import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, FileText, Minus, Plus, Save, Share2, ShoppingBag, Trash2, X } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import NumField from '../NumField';
import PaymentPicker from '../PaymentPicker';
import { closeModal, getState, openModal, setState, toast, useStore } from '../../store';
import { deleteSelectedProducts, duplicateSelectedProducts, processNota, shareSelectedProducts } from '../../actions';
import { computeNota, floorOf, type DiscType, type NotaGlobal, type NotaLine } from '../../lib/nota';
import { datasetId } from '../../lib/db';
import { cardImage, formatUSD } from '../../lib/format';

// ==========================================
// NOTA DE VENTA (borrador de venta con descuentos)
// ==========================================

interface Draft { id: string; date: string; lines: { id: string; qty: number; discType: DiscType; discValue: number }[]; global: NotaGlobal; note?: string; total: number }
const draftsKey = () => `mn7_notas_${datasetId()}`;
const loadDrafts = (): Draft[] => { try { return JSON.parse(localStorage.getItem(draftsKey()) || '[]'); } catch { return []; } };
const saveDrafts = (d: Draft[]) => { try { localStorage.setItem(draftsKey(), JSON.stringify(d.slice(0, 50))); } catch { /* sin espacio */ } };

/** Barra flotante: aparece al elegir productos (pulsación larga) */
export function NotaBar() {
  const sel = useStore(s => s.notaSel);
  const open = useStore(s => !!s.modals['nota-modal']);
  const isAdmin = useStore(s => s.isAdmin());
  if (!sel.length || open) return null;
  const btn = 'py-2 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5';
  return (
    <div id="nota-bar" className="nota-bar fixed z-[46] left-3 right-3 mx-auto max-w-md rounded-2xl bg-[#201728] text-white shadow-2xl p-2">
      <div className="flex items-center gap-2 px-1 pb-2">
        <ShoppingBag className="w-4 h-4 flex-shrink-0" />
        <p className="flex-1 min-w-0 text-xs font-bold">{sel.length} {sel.length === 1 ? 'producto elegido' : 'productos elegidos'}<span className="font-normal opacity-75"> · toca otros para agregar o quitar</span></p>
        <button type="button" onClick={() => setState({ notaSel: [] })} className="w-7 h-7 rounded-full bg-white/15 grid place-items-center flex-shrink-0" aria-label="Quitar selección"><X className="w-4 h-4" /></button>
      </div>
      <div className={`grid ${isAdmin ? 'grid-cols-4' : 'grid-cols-2'} gap-1.5`}>
        {isAdmin && <button type="button" onClick={deleteSelectedProducts} className={`${btn} bg-[#a43658]`}><Trash2 className="w-4 h-4" /> Eliminar</button>}
        {isAdmin && <button type="button" onClick={duplicateSelectedProducts} className={`${btn} bg-white/15`}><Copy className="w-4 h-4" /> Duplicar</button>}
        <button type="button" onClick={shareSelectedProducts} className={`${btn} bg-white/15`}><Share2 className="w-4 h-4" /> Compartir</button>
        <button type="button" onClick={() => openModal('nota-modal')} className={`${btn} bg-[#7c43ba]`}><FileText className="w-4 h-4" /> Nota de venta</button>
      </div>
    </div>
  );
}

export default function NotaModal() {
  const open = useStore(s => !!s.modals['nota-modal']);
  const sel = useStore(s => s.notaSel);
  const records = useStore(s => s.records);
  const [lines, setLines] = useState<NotaLine[]>([]);
  const [global, setGlobal] = useState<NotaGlobal>({ type: 'percent', value: 0 });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);

  const lineFor = (id: string, prev?: Partial<NotaLine>): NotaLine | null => {
    const p = records.find(r => r.id === id);
    if (!p) return null;
    return { id, name: p.name, price: Number(p.sale_price) || 0, floor: floorOf(p), stock: Number(p.stock) || 0, qty: prev?.qty ?? 1, discType: prev?.discType ?? 'percent', discValue: prev?.discValue ?? 0 };
  };

  // Al abrir: las líneas siguen a la selección (se conservan cantidades y descuentos ya escritos)
  useEffect(() => {
    if (!open) return;
    setDrafts(loadDrafts());
    setLines(prev => sel.map(id => lineFor(id, prev.find(l => l.id === id))).filter(Boolean) as NotaLine[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel, records]);

  const res = useMemo(() => computeNota(lines, global), [lines, global]);
  const patch = (id: string, p: Partial<NotaLine>) => setLines(ls => ls.map(l => (l.id === id ? { ...l, ...p } : l)));
  const remove = (id: string) => setState({ notaSel: getState().notaSel.filter(x => x !== id) });
  const close = () => closeModal('nota-modal');
  const clearAll = () => { setState({ notaSel: [] }); setLines([]); setGlobal({ type: 'percent', value: 0 }); setDraftId(null); };

  const saveDraft = () => {
    if (!lines.length) { toast('La nota está vacía'); return; }
    const d: Draft = { id: draftId || 'nota_' + Date.now().toString(36), date: new Date().toISOString(), lines: lines.map(l => ({ id: l.id, qty: l.qty, discType: l.discType, discValue: l.discValue })), global, total: res.total };
    const list = [d, ...loadDrafts().filter(x => x.id !== d.id)];
    saveDrafts(list); setDrafts(list);
    toast('💾 Nota guardada como borrador');
    clearAll(); close();
  };
  const loadDraft = (d: Draft) => {
    setState({ notaSel: d.lines.map(l => l.id).filter(id => records.some(r => r.id === id)) });
    setLines(d.lines.map(l => lineFor(l.id, l)).filter(Boolean) as NotaLine[]);
    setGlobal(d.global); setDraftId(d.id);
  };
  const deleteDraft = (id: string) => { const list = loadDrafts().filter(x => x.id !== id); saveDrafts(list); setDrafts(list); if (draftId === id) setDraftId(null); };

  const sell = async () => {
    if (!res.rows.some(r => r.qty > 0)) { toast('Agrega al menos un producto con cantidad'); return; }
    setBusy(true);
    try {
      const ok = await processNota(res);
      if (ok) { if (draftId) deleteDraft(draftId); clearAll(); close(); }
    } finally { setBusy(false); }
  };

  return (
    <Modal id="nota-modal" className="z-[60] bg-[#1e1427]/60">
      <article className="modal-card w-full max-w-xl bg-white rounded-3xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#ede7f0] flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-xl hero-title flex items-center gap-2"><FileText className="w-5 h-5 text-[#7c43ba]" /> Nota de venta</h2>
            <p className="text-xs text-[#756c7e]">Prepara el detalle y los descuentos; todavía no se vende.{draftId ? ' · borrador abierto' : ''}</p>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
          {!lines.length && <p className="text-center text-sm text-[#756c7e] py-6">Mantén presionado un producto del catálogo para agregarlo a la nota.</p>}
          {res.rows.map(r => {
            const p = records.find(x => x.id === r.id);
            return (
              <div key={r.id} className={`nota-line rounded-2xl border p-3 ${r.itemBlocked ? 'border-[#fca5a5] bg-[#fff7f7]' : 'border-[#ede7f0]'}`}>
                <div className="flex items-start gap-3">
                  {p && <img src={cardImage(p)} alt="" className="w-12 h-12 rounded-xl object-contain product-photo-frame flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-snug line-clamp-2">{r.name}</p>
                    <p className="text-[11px] text-[#756c7e]">{formatUSD(r.price)} c/u · <span className="sensitive-data text-[#a43658] font-bold">mínimo {formatUSD(r.floor)} · </span>stock {r.stock}</p>
                  </div>
                  <button type="button" onClick={() => remove(r.id)} className="w-8 h-8 rounded-full hover:bg-[#fff0f3] grid place-items-center text-[#a43658] flex-shrink-0" aria-label="Quitar de la nota"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                  <div>
                    <p className="text-[10px] font-bold text-[#756c7e] mb-0.5">Cantidad</p>
                    <div className="flex items-center border border-[#e8dfec] rounded-xl overflow-hidden">
                      <button type="button" onClick={() => patch(r.id, { qty: Math.max(1, r.qty - 1) })} className="px-2.5 py-1.5 bg-[#f6f1f8]" aria-label="Menos"><Minus className="w-4 h-4" /></button>
                      <span className="w-9 text-center font-bold text-sm">{r.qty}</span>
                      <button type="button" onClick={() => { if (r.qty < r.stock) patch(r.id, { qty: r.qty + 1 }); else toast('No hay más stock'); }} className="px-2.5 py-1.5 bg-[#f6f1f8]" aria-label="Más"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#756c7e] mb-0.5">Descuento del producto</p>
                    <div className="flex items-center gap-1">
                      <NumField value={r.discValue || null} onValue={n => patch(r.id, { discValue: n ?? 0 })} label={`Descuento de ${r.name}`} className="w-20 input-field rounded-lg px-2 py-1.5 text-sm" />
                      <select value={r.discType} onChange={e => patch(r.id, { discType: e.target.value as DiscType })} className="input-field rounded-lg px-1.5 py-1.5 text-xs" aria-label="Tipo de descuento">
                        <option value="percent">%</option>
                        <option value="amount">monto</option>
                      </select>
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    {r.itemDisc + r.globalDisc > 0 && <p className="text-[11px] text-[#9b8fa5] line-through">{formatUSD(r.subtotal)}</p>}
                    <p className="font-bold text-[#7c43ba]">{formatUSD(r.total)}</p>
                    <p className="text-[10px] text-[#756c7e]">{formatUSD(r.unit)} c/u</p>
                  </div>
                </div>
                {r.itemBlocked && <p className="mt-2 text-[11px] font-bold text-[#a43658] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> No puede bajar del costo mínimo: se aplicó solo {formatUSD(r.itemDisc)}.</p>}
                {!r.itemBlocked && r.atFloor && <p className="mt-1 text-[10px] font-bold text-[#92400e]">En su costo mínimo</p>}
              </div>
            );
          })}

          {lines.length > 0 && (
            <div className="rounded-2xl bg-[#f6f1f8] p-3">
              <p className="text-xs font-bold mb-1.5">Descuento global (a todos los productos)</p>
              <div className="flex items-center gap-1.5">
                <NumField value={global.value || null} onValue={n => setGlobal({ ...global, value: n ?? 0 })} label="Descuento global" className="w-24 input-field rounded-lg px-2 py-1.5 text-sm" />
                <select value={global.type} onChange={e => setGlobal({ ...global, type: e.target.value as DiscType })} className="input-field rounded-lg px-1.5 py-1.5 text-xs" aria-label="Tipo de descuento global">
                  <option value="percent">%</option>
                  <option value="amount">monto</option>
                </select>
                <span className="sensitive-data text-[11px] text-[#756c7e]">máx. posible {formatUSD(res.globalMax)}</span>
              </div>
              {res.globalBlocked && <p className="mt-2 text-[11px] font-bold text-[#a43658] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Bloqueado: el descuento global no puede bajar ningún producto de su costo mínimo. Se aplicó {formatUSD(res.globalApplied)}.</p>}
            </div>
          )}

          {lines.length > 0 && (
            <div>
              <p className="text-xs font-bold mb-1.5">Método de pago (para procesar la venta)</p>
              <PaymentPicker />
            </div>
          )}

          {drafts.length > 0 && (
            <details className="rounded-2xl border border-[#ede7f0] p-3">
              <summary className="text-xs font-bold cursor-pointer">Borradores guardados ({drafts.length})</summary>
              <div className="space-y-1.5 mt-2">
                {drafts.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-xs">
                    <p className="flex-1 min-w-0 truncate">{new Date(d.date).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {d.lines.length} prod. · <b>{formatUSD(d.total)}</b></p>
                    <button type="button" onClick={() => loadDraft(d)} className="px-2 py-1 rounded-lg btn-ghost font-bold">Abrir</button>
                    <button type="button" onClick={() => deleteDraft(d.id)} className="w-7 h-7 rounded-lg hover:bg-[#fff0f3] grid place-items-center text-[#a43658]" aria-label="Borrar borrador"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="border-t-2 border-[#ede7f0] bg-[#faf7fb] p-4">
          <div className="flex justify-between text-sm"><span className="text-[#756c7e]">Subtotal</span><span id="nota-subtotal" className="font-bold">{formatUSD(res.subtotal)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-[#756c7e]">Descuento aplicado</span><span id="nota-discount" className="font-bold text-[#d97706]">{res.discount > 0 ? `-${formatUSD(res.discount)}` : formatUSD(0)}</span></div>
          <div className="flex justify-between text-xl mt-1"><span className="font-bold">Total final</span><span id="nota-total" className="font-bold text-[#7c43ba] hero-title">{formatUSD(res.total)}</span></div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button id="nota-save" type="button" onClick={saveDraft} disabled={!lines.length} className="py-3 rounded-xl btn-ghost font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"><Save className="w-4 h-4" /> Guardar borrador</button>
            <button id="nota-sell" type="button" onClick={sell} disabled={!lines.length || busy} className="py-3 rounded-xl btn-success font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"><ShoppingBag className="w-4 h-4" /> {busy ? 'Procesando...' : 'Procesar venta'}</button>
          </div>
        </div>
      </article>
    </Modal>
  );
}
