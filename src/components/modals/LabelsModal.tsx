import { useEffect, useMemo, useState } from 'react';
import { Check, Loader, Minus, Plus, Printer, Search } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, setState, toast, useStore } from '../../store';
import { AUTO_PRESET_ID, LABEL_PRESETS, autoPreset, buildLabelsPDF, type LabelLayout } from '../../lib/labels';
import { getLowStockProducts } from '../../lib/selectors';
import { datasetId } from '../../lib/db';
import { formatContent } from '../../lib/format';
import { searchProducts } from '../../lib/search';

type Scope = 'one' | 'catalog' | 'all' | 'low';

/** Productos a los que ya se les imprimió etiqueta (en este dispositivo): id → fecha */
const printedKey = () => `mn7_labels_printed_${datasetId()}`;
const loadPrinted = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(printedKey()) || '{}'); } catch { return {}; } };
const savePrinted = (m: Record<string, string>) => { try { localStorage.setItem(printedKey(), JSON.stringify(m)); } catch { /* sin espacio */ } };

/** Imprimir etiquetas con QR + código de barras (hoja A4 o impresora térmica), eligiendo producto por producto */
export default function LabelsModal() {
  const open = useStore(s => !!s.modals['labels-modal']);
  const productId = useStore(s => s.labelProductId);
  const records = useStore(s => s.records);
  const catalogs = useStore(s => s.catalogs);
  const lowDefault = useStore(s => s.lowStockDefault);
  const [scope, setScope] = useState<Scope>('all');
  const [catalogId, setCatalogId] = useState('');
  const [presetId, setPresetId] = useState(() => localStorage.getItem('mc7_label_preset') || 'a4-24');
  const [copies, setCopies] = useState<'one' | 'stock'>('one');
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showBorder, setShowBorder] = useState(true);
  const [layout, setLayout] = useState<LabelLayout>(() => (localStorage.getItem('mn7_label_layout') as LabelLayout) || 'full');
  const [textPos, setTextPos] = useState<'top' | 'bottom'>(() => (localStorage.getItem('mn7_label_textpos') as 'top' | 'bottom') || 'bottom');
  const [qrMm, setQrMm] = useState(() => Number(localStorage.getItem('mn7_label_qrmm')) || 15);
  const [busy, setBusy] = useState(false);
  const [printed, setPrinted] = useState<Record<string, string>>({});
  /** Elegidos y cuántas etiquetas de cada uno */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setScope(productId ? 'one' : 'all');
    setCatalogId(catalogs[0]?.id || '');
    setPrinted(loadPrinted());
    setQ('');
  }, [open, productId, catalogs]);

  const preset = LABEL_PRESETS.find(p => p.id === presetId) || LABEL_PRESETS[0];
  const list = useMemo(() => {
    const base = scope === 'one' ? records.filter(r => r.id === productId)
      : scope === 'catalog' ? records.filter(r => r.catalog_id === catalogId)
        : scope === 'low' ? getLowStockProducts(records, lowDefault) : records;
    return base.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [scope, records, productId, catalogId, lowDefault]);
  const perStock = (stock: number) => Math.max(1, Math.min(Number(stock) || 1, 200));

  // Al cambiar la lista o la cantidad: se marcan los que AÚN NO tienen etiqueta impresa
  useEffect(() => {
    if (!open) return;
    const pr = loadPrinted();
    const fresh = list.filter(r => !pr[r.id]);
    const pick = scope === 'one' || !fresh.length ? list : fresh;
    setCounts(Object.fromEntries(pick.map(r => [r.id, copies === 'stock' ? perStock(r.stock) : 1])));
  }, [open, list, copies, scope]);

  const shown = useMemo(() => (q.trim() ? searchProducts(list, q) : list), [list, q]);
  const chosen = list.filter(r => (counts[r.id] || 0) > 0);
  const total = chosen.reduce((a, r) => a + counts[r.id], 0);
  const toggle = (id: string, stock: number) => setCounts(c => { const n = { ...c }; if (n[id]) delete n[id]; else n[id] = copies === 'stock' ? perStock(stock) : 1; return n; });
  const setN = (id: string, n: number) => setCounts(c => { const x = { ...c }; if (n <= 0) delete x[id]; else x[id] = Math.min(n, 500); return x; });
  const selectAll = () => setCounts(Object.fromEntries(list.map(r => [r.id, counts[r.id] || (copies === 'stock' ? perStock(r.stock) : 1)])));
  const selectNone = () => setCounts({});
  const selectUnprinted = () => setCounts(Object.fromEntries(list.filter(r => !printed[r.id]).map(r => [r.id, copies === 'stock' ? perStock(r.stock) : 1])));
  const unprintedCount = list.filter(r => !printed[r.id]).length;

  const close = () => { setState({ labelProductId: null }); closeModal('labels-modal'); };
  const generate = async () => {
    if (!chosen.length) { toast('Elige al menos un producto'); return; }
    setBusy(true);
    try {
      localStorage.setItem('mc7_label_preset', preset.id);
      localStorage.setItem('mn7_label_layout', layout); localStorage.setItem('mn7_label_textpos', textPos); localStorage.setItem('mn7_label_qrmm', String(qrMm));
      const { doc, count } = await buildLabelsPDF(chosen, { preset, copies, showPrice, showBarcode, showBorder, counts, layout, textPos, qrMm });
      doc.save(`etiquetas_${preset.id}_${Date.now()}.pdf`);
      const now = new Date().toISOString();
      const next = { ...loadPrinted(), ...Object.fromEntries(chosen.map(r => [r.id, now])) };
      savePrinted(next); setPrinted(next);
      toast(`✅ PDF con ${count} etiquetas listo para imprimir`);
    } catch (e) {
      console.error(e); toast('No se pudo generar las etiquetas');
    }
    setBusy(false);
  };

  const chip = (active: boolean) => `px-3 py-2 rounded-xl border-2 text-xs font-bold ${active ? 'border-[#7c43ba] bg-[#f6f1f8] text-[#7c43ba]' : 'border-[#e8dfec] text-[#756c7e]'}`;

  return (
    <Modal id="labels-modal" className="z-[60] bg-[#1e1427]/60" onClose={() => setState({ labelProductId: null })}>
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-5 max-h-[94vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3"><h2 className="font-bold text-xl hero-title">Etiquetas con QR</h2><CloseButton onClick={close} /></div>
        <p className="text-xs text-[#756c7e] mb-4">Cada etiqueta lleva un QR (al escanearlo se abre el producto en la app), nombre, precio y código de barras. Elige de qué productos y cuántas.</p>

        <label className="block text-xs font-bold mb-1.5">¿De dónde?</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {productId && <button type="button" className={chip(scope === 'one')} onClick={() => setScope('one')}>Solo este producto</button>}
          <button type="button" className={chip(scope === 'all')} onClick={() => setScope('all')}>Todos</button>
          <button type="button" className={chip(scope === 'catalog')} onClick={() => setScope('catalog')}>Un catálogo</button>
          <button type="button" className={chip(scope === 'low')} onClick={() => setScope('low')}>Stock bajo</button>
        </div>
        {scope === 'catalog' && (
          <select value={catalogId} onChange={e => setCatalogId(e.target.value)} className="w-full input-field rounded-xl p-3 mb-3">{catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        )}

        <label className="block text-xs font-bold mb-1.5">Cantidad por producto</label>
        <div className="flex gap-2 mb-3">
          <button type="button" className={chip(copies === 'one')} onClick={() => setCopies('one')}>1 de cada uno</button>
          <button type="button" className={chip(copies === 'stock')} onClick={() => setCopies('stock')}>Una por cada unidad en stock</button>
        </div>

        <div id="labels-picker" className="rounded-2xl border border-[#ede7f0] mb-4">
          <div className="p-2.5 border-b border-[#f1ecf4] flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold mr-auto">{chosen.length} de {list.length} productos · {total} etiquetas</span>
            <button type="button" onClick={selectAll} className="px-2.5 py-1 rounded-full btn-ghost text-[11px] font-bold">Todos</button>
            <button type="button" onClick={selectNone} className="px-2.5 py-1 rounded-full btn-ghost text-[11px] font-bold">Ninguno</button>
            {Object.keys(printed).length > 0 && <button type="button" id="labels-unprinted" onClick={selectUnprinted} className="px-2.5 py-1 rounded-full bg-[#f6f1f8] text-[#7c43ba] text-[11px] font-bold">Sin imprimir ({unprintedCount})</button>}
          </div>
          {list.length > 8 && (
            <label className="mx-2.5 mt-2 flex items-center gap-2 input-field rounded-xl px-3"><Search className="w-4 h-4 text-[#756c7e]" /><input value={q} onChange={e => setQ(e.target.value)} className="flex-1 py-2 bg-transparent outline-none text-sm" placeholder="Buscar en la lista" /></label>
          )}
          <div className="max-h-[38vh] overflow-y-auto divide-y divide-[#f6f1f8]">
            {shown.map(r => {
              const n = counts[r.id] || 0;
              const when = printed[r.id];
              return (
                <div key={r.id} className={`label-row flex items-center gap-2 px-2.5 py-2 ${n ? '' : 'opacity-60'}`}>
                  <button type="button" onClick={() => toggle(r.id, r.stock)} aria-pressed={!!n} className={`w-6 h-6 rounded-md border-2 flex-shrink-0 grid place-items-center ${n ? 'bg-[#7c43ba] border-[#7c43ba] text-white' : 'border-[#cbbdd6]'}`}>{n > 0 && <Check className="w-4 h-4" />}</button>
                  <button type="button" onClick={() => toggle(r.id, r.stock)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold truncate">{r.name}</p>
                    <p className="text-[10px] text-[#756c7e] truncate">{[r.brand, formatContent(r)].filter(Boolean).join(' · ')} · stock {r.stock}{when ? <span className="text-[#23805d] font-bold"> · ✓ impresa {new Date(when).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span> : ''}</p>
                  </button>
                  <div className="flex items-center rounded-lg border border-[#e8dfec] overflow-hidden flex-shrink-0">
                    <button type="button" onClick={() => setN(r.id, n - 1)} className="w-7 h-7 grid place-items-center bg-[#f6f1f8]" aria-label="Una menos"><Minus className="w-3 h-3" /></button>
                    <span className="w-7 text-center text-xs font-bold">{n}</span>
                    <button type="button" onClick={() => setN(r.id, n + 1)} className="w-7 h-7 grid place-items-center bg-[#f6f1f8]" aria-label="Una más"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              );
            })}
            {!shown.length && <p className="text-xs text-[#756c7e] text-center py-6">No hay productos</p>}
          </div>
        </div>

        <label className="block text-xs font-bold mb-1.5">Diseño</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button type="button" id="layout-full" className={chip(layout === 'full')} onClick={() => { setLayout('full'); if (presetId === AUTO_PRESET_ID) setPresetId('a4-32'); }}>Completa<span className="block font-normal text-[10px]">QR + nombre + precio + barras</span></button>
          <button type="button" id="layout-qrname" className={chip(layout === 'qrname')} onClick={() => { setLayout('qrname'); if (layout !== 'qrname' && !['a4-55', 'a4-65', 'a4-40', AUTO_PRESET_ID].includes(presetId)) setPresetId(AUTO_PRESET_ID); }}>Solo QR + nombre<span className="block font-normal text-[10px]">nombre, marca y ml / g</span></button>
        </div>
        {layout === 'qrname' && (
          <div className="flex gap-2 mb-2">
            <button type="button" className={chip(textPos === 'top')} onClick={() => setTextPos('top')}>Nombre arriba del QR</button>
            <button type="button" className={chip(textPos === 'bottom')} onClick={() => setTextPos('bottom')}>Nombre abajo del QR</button>
          </div>
        )}
        <label className="block text-xs font-bold mb-1">Tamaño del QR: <span id="qr-mm-label" className="text-[#7c43ba]">{(qrMm / 10).toFixed(1)} cm ({qrMm} mm)</span></label>
        <input id="qr-mm" type="range" min={10} max={30} step={1} value={qrMm} onChange={e => setQrMm(Number(e.target.value))} className="w-full accent-[#7c43ba] mb-0.5" />
        <p className="text-[10px] text-[#756c7e] mb-3">Si no entra en la etiqueta elegida, se achica solo lo necesario. Recomendado: 1,5 cm (se lee bien con cualquier celular).</p>

        <label className="block text-xs font-bold mb-1.5">Tamaño de etiqueta</label>
        <select value={presetId} onChange={e => setPresetId(e.target.value)} className="w-full input-field rounded-xl p-3 mb-1">{LABEL_PRESETS.filter(p => layout === 'qrname' || p.id !== AUTO_PRESET_ID).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {preset.id === AUTO_PRESET_ID && (() => { const a = autoPreset(qrMm); return <p id="auto-info" className="text-[11px] font-bold text-[#7c43ba] mb-1">{a.grid!.cols} por fila · {a.grid!.cols * a.grid!.rows} por hoja · cada etiqueta {a.w.toFixed(1)} × {a.h.toFixed(1)} mm</p>; })()}
        <p className="text-[11px] text-[#756c7e] mb-3">{preset.grid ? 'Imprime en hoja A4 al 100 % (sin “ajustar a la página”).' : 'Una etiqueta por página: elige ese tamaño en la configuración de tu impresora térmica.'}</p>

        {layout === 'full' && <div className="space-y-2 mb-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} className="accent-[#7c43ba]" /> Mostrar precio</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showBarcode} onChange={e => setShowBarcode(e.target.checked)} className="accent-[#7c43ba]" /> Código de barras {preset.h < 24 && <span className="text-[11px] text-[#756c7e]">(no cabe en este tamaño)</span>}</label>
        </div>}
        <label className="flex items-center gap-2 mb-4 text-sm"><input type="checkbox" checked={showBorder} onChange={e => setShowBorder(e.target.checked)} className="accent-[#7c43ba]" /> Borde de recorte</label>

        <button type="button" id="labels-generate" disabled={busy || !chosen.length} onClick={generate} className="w-full py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <><Loader className="w-4 h-4 animate-spin" /> Generando...</> : <><Printer className="w-4 h-4" /> Generar PDF ({total} etiquetas)</>}
        </button>
        <p className="text-[10px] text-[#756c7e] text-center mt-2">Los productos ya impresos quedan marcados con ✓ para que la próxima vez solo imprimas los nuevos.</p>
      </article>
    </Modal>
  );
}
