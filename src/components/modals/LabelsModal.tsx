import { useEffect, useMemo, useState } from 'react';
import { Loader, Printer } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, setState, toast, useStore } from '../../store';
import { LABEL_PRESETS, buildLabelsPDF } from '../../lib/labels';
import { getLowStockProducts } from '../../lib/selectors';

type Scope = 'one' | 'catalog' | 'all' | 'low';

/** Imprimir etiquetas con QR + código de barras (hoja A4 o impresora térmica) */
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope(productId ? 'one' : 'all');
    setCatalogId(catalogs[0]?.id || '');
  }, [open, productId, catalogs]);

  const preset = LABEL_PRESETS.find(p => p.id === presetId) || LABEL_PRESETS[0];
  const list = useMemo(() => {
    if (scope === 'one') return records.filter(r => r.id === productId);
    if (scope === 'catalog') return records.filter(r => r.catalog_id === catalogId);
    if (scope === 'low') return getLowStockProducts(records, lowDefault);
    return records;
  }, [scope, records, productId, catalogId, lowDefault]);
  const total = list.reduce((a, r) => a + (copies === 'stock' ? Math.max(1, Math.min(Number(r.stock) || 1, 200)) : 1), 0);

  const close = () => { setState({ labelProductId: null }); closeModal('labels-modal'); };
  const generate = async () => {
    if (!list.length) { toast('No hay productos para imprimir'); return; }
    setBusy(true);
    try {
      localStorage.setItem('mc7_label_preset', preset.id);
      const { doc, count } = await buildLabelsPDF(list, { preset, copies, showPrice, showBarcode, showBorder });
      doc.save(`etiquetas_${preset.id}_${Date.now()}.pdf`);
      toast(`✅ PDF con ${count} etiquetas listo para imprimir`);
    } catch (e) {
      console.error(e); toast('No se pudo generar las etiquetas');
    }
    setBusy(false);
  };

  const chip = (active: boolean) => `px-3 py-2 rounded-xl border-2 text-xs font-bold ${active ? 'border-[#7c43ba] bg-[#f6f1f8] text-[#7c43ba]' : 'border-[#e8dfec] text-[#756c7e]'}`;

  return (
    <Modal id="labels-modal" className="z-[60] bg-[#1e1427]/60" onClose={() => setState({ labelProductId: null })}>
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Etiquetas imprimibles</h2><CloseButton onClick={close} /></div>
        <p className="text-xs text-[#756c7e] mb-4">Cada etiqueta lleva un QR (al escanearlo se abre el producto en la app), nombre, precio y código de barras.</p>

        <label className="block text-xs font-bold mb-1.5">¿Qué productos?</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {productId && <button type="button" className={chip(scope === 'one')} onClick={() => setScope('one')}>Solo este producto</button>}
          <button type="button" className={chip(scope === 'all')} onClick={() => setScope('all')}>Todos</button>
          <button type="button" className={chip(scope === 'catalog')} onClick={() => setScope('catalog')}>Un catálogo</button>
          <button type="button" className={chip(scope === 'low')} onClick={() => setScope('low')}>Stock bajo</button>
        </div>
        {scope === 'catalog' && (
          <select value={catalogId} onChange={e => setCatalogId(e.target.value)} className="w-full input-field rounded-xl p-3 mb-3">{catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        )}

        <label className="block text-xs font-bold mb-1.5">Tamaño de etiqueta</label>
        <select value={presetId} onChange={e => setPresetId(e.target.value)} className="w-full input-field rounded-xl p-3 mb-1">{LABEL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <p className="text-[11px] text-[#756c7e] mb-3">{preset.grid ? 'Imprime en hoja A4 al 100 % (sin “ajustar a la página”).' : 'Una etiqueta por página: elige ese tamaño en la configuración de tu impresora térmica.'}</p>

        <label className="block text-xs font-bold mb-1.5">Cantidad</label>
        <div className="flex gap-2 mb-3">
          <button type="button" className={chip(copies === 'one')} onClick={() => setCopies('one')}>1 por producto</button>
          <button type="button" className={chip(copies === 'stock')} onClick={() => setCopies('stock')}>Una por cada unidad en stock</button>
        </div>

        <div className="space-y-2 mb-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} className="accent-[#7c43ba]" /> Mostrar precio</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showBarcode} onChange={e => setShowBarcode(e.target.checked)} className="accent-[#7c43ba]" /> Código de barras {preset.h < 28 && <span className="text-[11px] text-[#756c7e]">(no cabe en este tamaño)</span>}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showBorder} onChange={e => setShowBorder(e.target.checked)} className="accent-[#7c43ba]" /> Borde de recorte</label>
        </div>

        <button type="button" disabled={busy || !list.length} onClick={generate} className="w-full py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <><Loader className="w-4 h-4 animate-spin" /> Generando...</> : <><Printer className="w-4 h-4" /> Generar PDF ({total} etiquetas)</>}
        </button>
      </article>
    </Modal>
  );
}
