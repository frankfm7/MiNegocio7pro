import { useEffect, useState } from 'react';
import { Camera, Download, Image as ImageIcon, Printer, ScanLine, SlidersHorizontal, X } from 'lucide-react';
import { getState, setState, toast, useStore } from '../store';
import { closeForm, openBarcodeScanner } from '../actions';
import { DB } from '../lib/db';
import { currency, cardImage, formatUSD, newId } from '../lib/format';
import { generateProductQRImage, printProductQR } from '../lib/qr';
import { downloadDataUrl } from '../lib/image';
import { autoFrameProduct, compressImage } from '../lib/image';
import { captureFromCamera } from '../lib/camera';
import { editProductImage } from './ImageEditor';
import { guessCommonName } from '../lib/commonName';
import NumField from './NumField';
import PriceFields from './PriceFields';

const r2 = (n: number) => Math.round(n * 100) / 100;
import { CONTENT_UNITS, fallback } from '../lib/constants';
import type { Product } from '../types';

const empty = {
  name: '', brand: '', type: '', category: '', catalog_id: '', content_value: '', content_unit: 'ml', barcode: '', description: '',
  sale_price: '', min_price: '', cost_price: '', offer_text: '', stock: '1', min_stock: '', catalog_price: '', sku: '', common_name: '',
};
type FormState = typeof empty;

function fromProduct(r: Product): FormState {
  return {
    name: r.name || '', brand: r.brand || '', type: r.type || '', category: r.category || '', catalog_id: r.catalog_id || '',
    content_value: r.content_value || '', content_unit: r.content_unit || 'ml', barcode: r.barcode || '', description: r.description || '',
    sale_price: String(r.sale_price ?? ''), min_price: String(r.min_price || 0), cost_price: String(r.cost_price ?? ''),
    offer_text: r.offer_text || '', stock: String(r.stock ?? 0),
    min_stock: r.min_stock === null || r.min_stock === undefined ? '' : String(r.min_stock),
    catalog_price: r.catalog_price === null || r.catalog_price === undefined ? '' : String(r.catalog_price), sku: r.sku || '',
    common_name: r.common_name || '',
  };
}

export default function ProductFormDrawer() {
  const open = useStore(s => s.formOpen);
  const editing = useStore(s => s.editing);
  const catalogs = useStore(s => s.catalogs);
  const scanned = useStore(s => s.scannedBarcodeForForm);
  const lowDefault = useStore(s => s.lowStockDefault);
  const [f, setF] = useState<FormState>(empty);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [autoFrame, setAutoFrame] = useState(() => localStorage.getItem('mc7_autoframe') !== 'false');
  const [editAfter, setEditAfter] = useState(() => localStorage.getItem('mn7_edit_after') !== 'false');

  useEffect(() => {
    if (!open) return;
    setDraftId(editing ? editing.id : newId()); // el producto nuevo ya tiene su id (y su QR) antes de guardarse
    setF(editing ? fromProduct(editing) : { ...empty, catalog_id: getState().currentCatalogId || '' });
    setPreview(editing ? cardImage(editing) : null);
    setPendingImage(null);
  }, [open, editing]);

  useEffect(() => {
    if (open && scanned) { setF(prev => ({ ...prev, barcode: scanned })); setState({ scannedBarcodeForForm: null }); }
  }, [open, scanned]);

  // Producto tal como está en el formulario ahora mismo (para el QR en vivo)
  const draft = {
    ...(editing || {}), id: draftId, name: f.name.trim() || 'Producto nuevo', brand: f.brand.trim(), type: f.type.trim(), category: f.category.trim(),
    content_value: f.content_value.trim(), content_unit: f.content_value.trim() ? f.content_unit : '',
    sale_price: Number(f.sale_price) || 0, offer_text: f.offer_text.trim(), description: f.description.trim(),
  } as Product;
  const qrKey = open && draftId ? [draft.id, draft.name, draft.brand, draft.content_value, draft.content_unit, draft.sale_price, draft.offer_text].join('|') : '';
  useEffect(() => {
    if (!qrKey) return;
    let live = true;
    const t = setTimeout(() => { generateProductQRImage(draft, 400).then(img => { if (live) setQrImage(img); }).catch(() => {}); }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrKey]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const profit = (Number(f.sale_price) || 0) - (Number(f.cost_price) || 0);
  const [usdCost, setUsdCost] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(() => Number(localStorage.getItem('mn7_invoice_rate')) || 6.96);
  useEffect(() => { if (open) setUsdCost(null); }, [open]);
  // Costo en dólares × tipo de cambio = costo de factura
  useEffect(() => { if (usdCost != null && rate) setF(prev => ({ ...prev, cost_price: String(r2(usdCost * rate)) })); }, [usdCost, rate]);

  const applyImage = async (file: Blob, msg: string, frame = autoFrame) => {
    try {
      const raw = await compressImage(file, 1600, 0.9);
      // Abrir el editor para dejar la foto como se quiere (fondo, encuadre, luz)
      if (editAfter) {
        const edited = await editProductImage(raw);
        if (edited) { setPendingImage(edited); setPreview(edited); toast('Foto lista ✓'); return; }
      }
      let data = await compressImage(file);
      if (frame) data = await autoFrameProduct(data);
      setPendingImage(data); setPreview(data); toast(msg);
    } catch { toast('Error al cargar imagen'); }
  };

  /** Ajustar la foto que ya tiene el producto */
  const adjustCurrent = async () => {
    if (!preview) return;
    const edited = await editProductImage(preview);
    if (edited) { setPendingImage(edited); setPreview(edited); toast('Foto ajustada ✓'); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.catalog_id) { toast('Selecciona un catálogo'); return; }
    if (f.sale_price === '' || f.cost_price === '') { toast('Escribe el costo de factura y el precio de venta'); return; }
    if (f.min_price !== '' && Number(f.sale_price) < Number(f.min_price) && !confirm('El precio de venta está por debajo del costo mínimo de venta. ¿Guardar igual?')) return;
    setSaving(true);
    const data = {
      type: f.type, name: f.name.trim(), category: f.category.trim(), brand: f.brand.trim(), barcode: f.barcode.trim(),
      catalog_id: f.catalog_id, cost_price: Number(f.cost_price), sale_price: Number(f.sale_price), min_price: Number(f.min_price) || 0,
      stock: Number(f.stock), sold: editing ? editing.sold : false, image_url: pendingImage !== null ? pendingImage : (editing ? editing.image_url : ''),
      description: f.description.trim(), offer_text: f.offer_text.trim(),
      content_value: f.content_value.trim(), content_unit: f.content_value.trim() ? f.content_unit : '',
      min_stock: f.min_stock.trim() === '' ? null : Number(f.min_stock),
      catalog_price: f.catalog_price.trim() === '' ? null : Number(f.catalog_price), sku: f.sku.trim(),
      // Si se deja vacío se usa el sugerido según el nombre
      common_name: f.common_name.trim() || guessCommonName(f.name, f.type),
    };
    const result = editing ? await DB.updateRecord({ ...editing, ...data }) : await DB.createRecord({ ...data, id: draftId });
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
            <div>
              <label className="block font-bold text-sm mb-1.5">Nombre común <span className="font-normal text-[#756c7e]">(se ve debajo del nombre y ayuda a buscar)</span></label>
              <div className="flex gap-2">
                <input value={f.common_name} onChange={set('common_name')} maxLength={60} className="flex-1 min-w-0 input-field rounded-xl p-3" type="text" placeholder={guessCommonName(f.name, f.type) || 'Ej: Protector solar, Perfume de mujer'} />
                {!f.common_name && guessCommonName(f.name, f.type) && <button type="button" onClick={() => setF(prev => ({ ...prev, common_name: guessCommonName(prev.name, prev.type) }))} className="px-3 rounded-xl btn-ghost text-xs font-bold whitespace-nowrap">Usar</button>}
              </div>
            </div>
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
              <label className="block font-bold text-sm mb-1.5">Código de la empresa (opcional)</label>
              <input value={f.sku} onChange={set('sku')} maxLength={30} className="w-full input-field rounded-xl p-3 mb-3" type="text" placeholder="Ej: 13014 (Ésika) o 5109-20014207 (Yanbal)" />
              <label className="block font-bold text-sm mb-1.5">Código de barras (opcional)</label>
              <div className="flex gap-2">
                <input value={f.barcode} onChange={set('barcode')} maxLength={30} className="flex-1 input-field rounded-xl p-3" type="text" placeholder="Ej: 7501234567890" />
                <button type="button" onClick={() => openBarcodeScanner('form')} className="btn-ghost rounded-xl px-4 flex items-center gap-1"><ScanLine className="w-4 h-4" /> Escanear</button>
              </div>
            </div>
            <div><label className="block font-bold text-sm mb-1.5">Descripción</label><textarea value={f.description} onChange={set('description')} maxLength={300} rows={3} className="w-full input-field rounded-xl p-3" /></div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#f6f1f8] to-[#faf7fb] border border-[#ede7f0]">
              <p className="text-xs uppercase tracking-[.15em] font-bold text-[#704397] mb-3">Costos y precios ({currency()})</p>
              {currency() !== 'USD' && (
                <div id="usd-cost" className="mb-3 p-2.5 rounded-xl bg-white/70 border border-[#ede7f0]">
                  <p className="font-bold text-xs mb-1.5">Costo en dólares (opcional) · tipo de cambio</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span>$</span>
                    <NumField value={usdCost} onValue={n => setUsdCost(n)} label="Costo en dólares" className="w-20 input-field rounded-lg px-2 py-1.5 text-sm" />
                    <span>× 1 USD =</span>
                    <NumField value={rate} onValue={n => { setRate(n); if (n) { try { localStorage.setItem('mn7_invoice_rate', String(n)); } catch { /* sin espacio */ } } }} label="Tipo de cambio del dólar" className="w-20 input-field rounded-lg px-2 py-1.5 text-sm" />
                    <span>{currency()}</span>
                  </div>
                  <p className="text-[10px] text-[#756c7e] mt-1">Si la factura viene en dólares, escribe el costo en $ y se convierte al costo de factura.</p>
                </div>
              )}
              <PriceFields
                value={{ cost: f.cost_price === '' ? null : Number(f.cost_price), min: f.min_price === '' ? null : Number(f.min_price), sale: f.sale_price === '' ? null : Number(f.sale_price) }}
                onChange={pt => setF(prev => ({
                  ...prev,
                  ...(pt.cost !== undefined ? { cost_price: pt.cost == null ? '' : String(pt.cost) } : {}),
                  ...(pt.min !== undefined ? { min_price: pt.min == null ? '' : String(pt.min) } : {}),
                  ...(pt.sale !== undefined ? { sale_price: pt.sale == null ? '' : String(pt.sale) } : {}),
                }))}
                currency={currency()}
              />
              <div className="mt-3">
                <label className="block font-bold text-xs mb-1.5">Precio de revista de la empresa (opcional)</label>
                <input value={f.catalog_price} onChange={set('catalog_price')} min={0} step="0.01" className="w-full input-field rounded-xl p-2" type="number" placeholder="El precio que figura en la revista de la marca" />
                <p className="text-[11px] text-[#756c7e] mt-1">Se muestra tachado junto a tu precio para que el cliente vea cuánto ahorra.</p>
              </div>
              <div className="mt-3 p-2 rounded-lg bg-white/60 text-center"><span className="text-xs text-[#756c7e]">Ganancia por unidad: </span><span className={`font-bold ${profit >= 0 ? 'text-[#166534]' : 'text-[#a43658]'}`}>{formatUSD(profit)}</span></div>
            </div>
            <div>
              <label className="block font-bold text-sm mb-1.5">Oferta (opcional)</label>
              <input value={f.offer_text} onChange={set('offer_text')} maxLength={50} className="w-full input-field rounded-xl p-3" type="text" placeholder="Ej: 2x15, 3x20, Lleve 3 pague 2" />
              <p className="text-xs text-[#756c7e] mt-1">Texto que aparecerá en el producto para indicar promociones</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-sm mb-1.5">Stock *</label><input value={f.stock} onChange={set('stock')} required min={0} className="w-full input-field rounded-xl p-3" type="number" />
                <label className="block font-bold text-xs mt-2 mb-1 text-[#756c7e]">Avisar cuando queden (opcional)</label>
                <input value={f.min_stock} onChange={set('min_stock')} min={0} className="w-full input-field rounded-xl p-2 text-sm" type="number" placeholder={`General: ${lowDefault}`} />
              </div>
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
              <input type="checkbox" checked={editAfter} onChange={e => { setEditAfter(e.target.checked); localStorage.setItem('mn7_edit_after', String(e.target.checked)); }} className="mt-0.5 accent-[#7c43ba]" />
              <span>Abrir el editor al elegir una foto (fondo blanco o negro, encuadre, brillo y nitidez)</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-[#756c7e] cursor-pointer -mt-1">
              <input type="checkbox" checked={autoFrame} onChange={e => { setAutoFrame(e.target.checked); localStorage.setItem('mc7_autoframe', String(e.target.checked)); }} className="mt-0.5 accent-[#7c43ba]" />
              <span>Encuadrar automáticamente las fotos de galería (recorta el fondo vacío para que perfumes y botellas se vean grandes)</span>
            </label>
            {preview && (
              <div className="relative">
                <img src={preview} className="image-preview !h-56" style={{ display: 'block' }} alt="" />
                <button type="button" onClick={() => { setPreview(null); setPendingImage(''); }} className="absolute top-4 right-2 px-3 py-1.5 rounded-full bg-white/90 text-[#a43658] text-xs font-bold shadow">Quitar foto</button>
                {preview !== fallback && <button type="button" onClick={adjustCurrent} className="adjust-photo absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#7c43ba] text-white text-xs font-bold shadow-lg flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4" /> Ajustar foto</button>}
              </div>
            )}
            <div className="p-4 rounded-2xl bg-[#f6f1f8] flex gap-4 items-center">
              {qrImage ? <img src={qrImage} alt="Código QR del producto" className="w-28 h-28 rounded-xl bg-white p-1 flex-shrink-0" /> : <div className="w-28 h-28 rounded-xl bg-white flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm">Código QR del producto</p>
                <p className="text-[11px] text-[#756c7e] leading-snug mt-0.5">Se actualiza solo al cambiar nombre, marca, contenido, precio u oferta. Al escanearlo con la cámara se abre este producto en la app.</p>
                <div className="flex gap-2 mt-2">
                  <button type="button" disabled={!qrImage} onClick={() => { downloadDataUrl(qrImage, `QR_${draft.name.replace(/[^a-z0-9]/gi, '_')}.png`); toast('QR descargado ✓'); }} className="px-3 py-1.5 rounded-full btn-ghost text-xs font-bold flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Descargar</button>
                  <button type="button" disabled={!qrImage} onClick={() => printProductQR(draft, qrImage)} className="px-3 py-1.5 rounded-full btn-ghost text-xs font-bold flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Imprimir</button>
                </div>
              </div>
            </div>
            <button id="save-product" type="submit" disabled={saving} className="w-full py-3.5 rounded-xl font-bold btn-primary">{saving ? 'Guardando...' : 'Guardar producto'}</button>
          </div>
        </form>
      </aside>
    </>
  );
}
