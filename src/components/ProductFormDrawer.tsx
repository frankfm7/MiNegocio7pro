import { useEffect, useState } from 'react';
import { Camera, Image as ImageIcon, ScanLine, X } from 'lucide-react';
import { getState, setState, toast, useStore } from '../store';
import { closeForm, openBarcodeScanner } from '../actions';
import { DB } from '../lib/db';
import { cardImage, formatUSD } from '../lib/format';
import { autoFrameProduct, compressImage } from '../lib/image';
import { captureFromCamera } from '../lib/camera';
import { CONTENT_UNITS } from '../lib/constants';
import type { Product } from '../types';

const empty = {
  name: '', brand: '', type: '', category: '', catalog_id: '', content_value: '', content_unit: 'ml', barcode: '', description: '',
  sale_price: '', min_price: '', cost_price: '', offer_text: '', stock: '1',
};
type FormState = typeof empty;

function fromProduct(r: Product): FormState {
  return {
    name: r.name || '', brand: r.brand || '', type: r.type || '', category: r.category || '', catalog_id: r.catalog_id || '',
    content_value: r.content_value || '', content_unit: r.content_unit || 'ml', barcode: r.barcode || '', description: r.description || '',
    sale_price: String(r.sale_price ?? ''), min_price: String(r.min_price || 0), cost_price: String(r.cost_price ?? ''),
    offer_text: r.offer_text || '', stock: String(r.stock ?? 0),
  };
}

export default function ProductFormDrawer() {
  const open = useStore(s => s.formOpen);
  const editing = useStore(s => s.editing);
  const catalogs = useStore(s => s.catalogs);
  const scanned = useStore(s => s.scannedBarcodeForForm);
  const [f, setF] = useState<FormState>(empty);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoFrame, setAutoFrame] = useState(() => localStorage.getItem('mc7_autoframe') !== 'false');

  useEffect(() => {
    if (!open) return;
    setF(editing ? fromProduct(editing) : { ...empty, catalog_id: getState().currentCatalogId || '' });
    setPreview(editing ? cardImage(editing) : null);
    setPendingImage(null);
  }, [open, editing]);

  useEffect(() => {
    if (open && scanned) { setF(prev => ({ ...prev, barcode: scanned })); setState({ scannedBarcodeForForm: null }); }
  }, [open, scanned]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const profit = (Number(f.sale_price) || 0) - (Number(f.cost_price) || 0);

  const applyImage = async (file: Blob, msg: string, frame = autoFrame) => {
    try {
      let data = await compressImage(file);
      if (frame) data = await autoFrameProduct(data);
      setPendingImage(data); setPreview(data); toast(msg);
    } catch { toast('Error al cargar imagen'); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.catalog_id) { toast('Selecciona un catálogo'); return; }
    setSaving(true);
    const data = {
      type: f.type, name: f.name.trim(), category: f.category.trim(), brand: f.brand.trim(), barcode: f.barcode.trim(),
      catalog_id: f.catalog_id, cost_price: Number(f.cost_price), sale_price: Number(f.sale_price), min_price: Number(f.min_price),
      stock: Number(f.stock), sold: editing ? editing.sold : false, image_url: pendingImage !== null ? pendingImage : (editing ? editing.image_url : ''),
      description: f.description.trim(), offer_text: f.offer_text.trim(),
      content_value: f.content_value.trim(), content_unit: f.content_value.trim() ? f.content_unit : '',
    };
    const result = editing ? await DB.updateRecord({ ...editing, ...data }) : await DB.createRecord(data);
    if (result.isOk) { closeForm(); toast(editing ? 'Actualizado ✓' : 'Guardado ✓'); }
    else toast('No se pudo guardar');
    setSaving(false);
  };

  return (
    <>
      <div id="drawer-backdrop" className={`backdrop fixed inset-0 bg-[#201429]/40 z-40 ${open ? 'open' : ''}`} onClick={closeForm} />
      <aside id="form-drawer" className={`drawer fixed top-0 right-0 bottom-0 z-50 bg-white w-[min(500px,100vw)] overflow-y-auto shadow-2xl ${open ? 'open' : ''}`}>
        <form id="product-form" className="p-6 sm:p-8" onSubmit={submit}>
          <div className="flex justify-between gap-3 mb-7">
            <div><p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e]">Gestión</p><h2 className="font-bold text-xl mt-1 hero-title">{editing ? 'Editar producto' : 'Añadir producto'}</h2></div>
            <button type="button" onClick={closeForm} className="w-10 h-10 rounded-full bg-[#f3eef6] grid place-items-center hover:bg-[#e8dfec]" aria-label="Cerrar"><X /></button>
          </div>
          <div className="space-y-4">
            <div><label className="block font-bold text-sm mb-1.5">Nombre *</label><input value={f.name} onChange={set('name')} required maxLength={80} className="w-full input-field rounded-xl p-3" type="text" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-bold text-sm mb-1.5">Marca *</label><input value={f.brand} onChange={set('brand')} required maxLength={50} className="w-full input-field rounded-xl p-3" type="text" /></div>
              <div><label className="block font-bold text-sm mb-1.5">Tipo *</label><input value={f.type} onChange={set('type')} required maxLength={50} className="w-full input-field rounded-xl p-3" type="text" placeholder="Ej: Perfume" /></div>
            </div>
            <div><label className="block font-bold text-sm mb-1.5">Categoría</label><input value={f.category} onChange={set('category')} maxLength={50} className="w-full input-field rounded-xl p-3" type="text" placeholder="Ej: Perfumes, Ropa..." /></div>
            <div>
              <label className="block font-bold text-sm mb-1.5">Catálogo *</label>
              <select value={f.catalog_id} onChange={set('catalog_id')} className="w-full input-field rounded-xl p-3">
                <option value="">Selecciona un catálogo</option>
                {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-sm mb-1.5">Contenido / Presentación</label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input value={f.content_value} onChange={set('content_value')} maxLength={30} className="w-full input-field rounded-xl p-3" type="text" inputMode="decimal" placeholder="Ej: 500, 1.5, 20x30" />
                <select value={f.content_unit} onChange={set('content_unit')} className="input-field rounded-xl p-3" aria-label="Unidad">
                  {CONTENT_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <p className="text-xs text-[#756c7e] mt-1">Litros, mililitros, gramos, kilos o medidas del producto</p>
            </div>
            <div>
              <label className="block font-bold text-sm mb-1.5">Código de barras (opcional)</label>
              <div className="flex gap-2">
                <input value={f.barcode} onChange={set('barcode')} maxLength={30} className="flex-1 input-field rounded-xl p-3" type="text" placeholder="Ej: 7501234567890" />
                <button type="button" onClick={() => openBarcodeScanner('form')} className="btn-ghost rounded-xl px-4 flex items-center gap-1"><ScanLine className="w-4 h-4" /> Escanear</button>
              </div>
            </div>
            <div><label className="block font-bold text-sm mb-1.5">Descripción</label><textarea value={f.description} onChange={set('description')} maxLength={300} rows={3} className="w-full input-field rounded-xl p-3" /></div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#f6f1f8] to-[#faf7fb] border border-[#ede7f0]">
              <p className="text-xs uppercase tracking-[.15em] font-bold text-[#704397] mb-3">Precios (USD)</p>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block font-bold text-xs mb-1.5">Precio venta máx. *</label><input value={f.sale_price} onChange={set('sale_price')} required min={0} step="0.01" className="w-full input-field rounded-xl p-2" type="number" /></div>
                <div><label className="block font-bold text-xs mb-1.5">Precio venta mín. *</label><input value={f.min_price} onChange={set('min_price')} required min={0} step="0.01" className="w-full input-field rounded-xl p-2" type="number" /></div>
                <div><label className="block font-bold text-xs mb-1.5">Costo *</label><input value={f.cost_price} onChange={set('cost_price')} required min={0} step="0.01" className="w-full input-field rounded-xl p-2" type="number" /></div>
              </div>
              <div className="mt-3 p-2 rounded-lg bg-white/60 text-center"><span className="text-xs text-[#756c7e]">Ganancia por unidad: </span><span className={`font-bold ${profit >= 0 ? 'text-[#166534]' : 'text-[#a43658]'}`}>{formatUSD(profit)}</span></div>
            </div>
            <div>
              <label className="block font-bold text-sm mb-1.5">Oferta (opcional)</label>
              <input value={f.offer_text} onChange={set('offer_text')} maxLength={50} className="w-full input-field rounded-xl p-3" type="text" placeholder="Ej: 2x15, 3x20, Lleve 3 pague 2" />
              <p className="text-xs text-[#756c7e] mt-1">Texto que aparecerá en el producto para indicar promociones</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-bold text-sm mb-1.5">Stock *</label><input value={f.stock} onChange={set('stock')} required min={0} className="w-full input-field rounded-xl p-3" type="number" /></div>
              <div>
                <label className="block font-bold text-sm mb-1.5">Imagen del producto</label>
                <div className="flex gap-2">
                  <label className="flex-1 btn-ghost rounded-xl px-3 py-2 flex items-center justify-center gap-1 cursor-pointer text-xs">
                    <ImageIcon className="w-4 h-4" /> Galería
                    <input accept="image/*" className="hidden" type="file" onChange={e => { const file = e.target.files?.[0]; if (file) applyImage(file, 'Imagen cargada ✓'); e.target.value = ''; }} />
                  </label>
                  <button type="button" onClick={async () => {
                    const file = await captureFromCamera({ title: 'Foto del producto', guide: 'portrait', filename: 'producto.jpg' });
                    if (file) applyImage(file, 'Foto tomada ✓', false);
                  }} className="flex-1 btn-ghost rounded-xl px-3 py-2 flex items-center justify-center gap-1 text-xs">
                    <Camera className="w-4 h-4" /> Cámara
                  </button>
                </div>
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-[#756c7e] cursor-pointer -mt-1">
              <input type="checkbox" checked={autoFrame} onChange={e => { setAutoFrame(e.target.checked); localStorage.setItem('mc7_autoframe', String(e.target.checked)); }} className="mt-0.5 accent-[#7c43ba]" />
              <span>Encuadrar automáticamente las fotos de galería (recorta el fondo vacío para que perfumes y botellas se vean grandes)</span>
            </label>
            {preview && (
              <div className="relative">
                <img src={preview} className="image-preview !h-56" style={{ display: 'block' }} alt="" />
                <button type="button" onClick={() => { setPreview(null); setPendingImage(''); }} className="absolute top-4 right-2 px-3 py-1.5 rounded-full bg-white/90 text-[#a43658] text-xs font-bold shadow">Quitar foto</button>
              </div>
            )}
            <button id="save-product" type="submit" disabled={saving} className="w-full py-3.5 rounded-xl font-bold btn-primary">{saving ? 'Guardando...' : 'Guardar producto'}</button>
          </div>
        </form>
      </aside>
    </>
  );
}
