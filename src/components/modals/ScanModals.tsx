import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CheckCircle, Download, Image as ImageIcon, Loader, Plus, ScanLine, Share2 } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, getState, openModal, setState, toast, useStore } from '../../store';
import {
  addToQuickScan, finalizeQuickScan, generateReceiptImage, handleBarcodeScanned, openBarcodeScanner, openDetail, stopQuickScanMode,
} from '../../actions';
import { cardImage, formatContent, formatUSD } from '../../lib/format';
import { searchByImage } from '../../lib/imageSearch';
import { captureFromCamera } from '../../lib/camera';
import { downloadDataUrl } from '../../lib/image';
import { SoundEffects } from '../../lib/sound';

// ==========================================
// ESCÁNER DE CÓDIGOS (barras y QR)
// ==========================================
export function BarcodeScannerModal() {
  const open = useStore(s => !!s.modals['barcode-scanner-modal']);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [running, setRunning] = useState(false);

  const stop = async () => {
    const sc = scannerRef.current;
    scannerRef.current = null;
    setRunning(false);
    if (sc) { try { await sc.stop(); sc.clear(); } catch { /* ya detenido */ } }
  };

  const onDecoded = (() => {
    let last = { code: '', at: 0 };
    return (decoded: string) => {
      // Evitar lecturas repetidas del mismo código
      const now = Date.now();
      if (decoded === last.code && now - last.at < 1500) return;
      last = { code: decoded, at: now };
      if (navigator.vibrate) navigator.vibrate(60);
      if (!handleBarcodeScanned(decoded)) stop();
    };
  })();

  const start = async () => {
    await stop();
    try {
      const sc = new Html5Qrcode('barcode-reader', {
        verbose: false,
        // QR y todos los códigos de barras comunes
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E, Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.CODE_93, Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR, Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = sc;
      await sc.start({ facingMode: 'environment' }, {
        fps: 12,
        qrbox: (w, h) => { const side = Math.floor(Math.min(w, h) * 0.75); return { width: Math.max(180, Math.floor(Math.min(w * 0.85, side * 1.25))), height: Math.max(150, side) }; },
      }, onDecoded, () => {});
      setRunning(true);
    } catch {
      toast('No se pudo acceder a la cámara. Puedes leer el código desde una foto.', 3500);
    }
  };

  const fromPhoto = async (file: File) => {
    await stop();
    try {
      const sc = new Html5Qrcode('barcode-file-reader', { verbose: false, useBarCodeDetectorIfSupported: true });
      const text = await sc.scanFile(file, false);
      sc.clear();
      onDecoded(text);
    } catch {
      toast('No se encontró ningún código en la foto', 3000);
    }
  };

  useEffect(() => {
    if (open) { const t = setTimeout(start, 300); return () => clearTimeout(t); }
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = async () => {
    await stop();
    closeModal('barcode-scanner-modal');
    if (getState().barcodeScanTarget === 'form') setState({ barcodeScanTarget: null });
  };

  return (
    <Modal id="barcode-scanner-modal" className="z-50 bg-[#1e1427]/90" onClose={stop}>
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Escanear código</h2><CloseButton onClick={close} /></div>
        <div id="barcode-reader" className="rounded-xl overflow-hidden bg-black min-h-[260px]" />
        <div id="barcode-file-reader" className="hidden" />
        <p className="text-xs text-[#756c7e] mt-3 text-center">Apunta la cámara a un <b>código QR</b> o a un <b>código de barras</b></p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {running
            ? <button type="button" onClick={async () => { await stop(); toast('Escáner detenido'); }} className="py-3 rounded-xl btn-ghost font-bold text-sm">Detener</button>
            : <button type="button" onClick={start} className="py-3 rounded-xl btn-ghost font-bold text-sm">Iniciar cámara</button>}
          <label className="py-3 rounded-xl btn-primary font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
            <ImageIcon className="w-4 h-4" /> Desde una foto
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) fromPhoto(f); e.target.value = ''; }} />
          </label>
        </div>
      </article>
    </Modal>
  );
}

// ==========================================
// BÚSQUEDA POR IMAGEN
// ==========================================
export function ImageSearchModal() {
  const { preview, results, status } = useStore(s => s.imageSearch);
  const open = useStore(s => !!s.modals['image-search-modal']);
  const wasOpen = useRef(false);

  // Limpiar la búsqueda anterior al abrir (salvo que se abra con una foto ya tomada)
  useEffect(() => {
    if (open && !wasOpen.current && !getState().imageSearch.preview) setState({ imageSearch: { preview: null, results: null, status: '' } });
    if (!open && wasOpen.current) setState({ imageSearch: { preview: null, results: null, status: '' } });
    wasOpen.current = open;
  }, [open]);

  return (
    <Modal id="image-search-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center"><h2 className="font-bold text-xl hero-title">Buscar por imagen</h2><CloseButton onClick={() => closeModal('image-search-modal')} /></div>
        <p className="text-sm text-[#756c7e] mt-2">Toma una foto del producto: se compara su forma, colores, texto de la etiqueta y código.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={async () => { const f = await captureFromCamera({ filename: 'buscar.jpg', title: 'Buscar producto por foto', hint: 'Enfoca el producto dentro del marco, con la etiqueta visible', actionLabel: 'Buscar' }); if (f) searchByImage(f); }} className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-[#d4c5e0] hover:border-[#7c43ba] hover:bg-[#f6f1f8] transition cursor-pointer">
            <Camera className="w-8 h-8 text-[#7c43ba] mb-2" /><p className="font-bold text-sm text-center">Tomar foto</p><p className="text-xs text-[#756c7e] mt-1 text-center">Abrir cámara</p>
          </button>
          <label className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-[#d4c5e0] hover:border-[#7c43ba] hover:bg-[#f6f1f8] transition cursor-pointer">
            <ImageIcon className="w-8 h-8 text-[#7c43ba] mb-2" /><p className="font-bold text-sm text-center">Subir archivo</p><p className="text-xs text-[#756c7e] mt-1 text-center">Desde galería</p>
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) searchByImage(f); e.target.value = ''; }} />
          </label>
        </div>
        {preview && <img src={preview} className="mt-4 w-full h-48 object-contain rounded-2xl product-photo-frame" alt="" />}
        {status && <p className="mt-3 text-sm text-[#7c43ba] font-bold flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> {status}</p>}
        {results && (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-[.15em] font-bold text-[#756c7e] mb-2">Productos similares:</p>
            <div className="space-y-2">
              {results.length === 0 && !status && <p className="text-sm text-[#756c7e] text-center py-4">No se encontraron productos parecidos.</p>}
              {results.map(({ record, similarity, reason }, idx) => (
                <button key={record.id} type="button" onClick={() => { closeModal('image-search-modal'); openDetail(record); }} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-[#f6f1f8] hover:bg-[#eee1f8] transition text-left shadow-sm">
                  <img src={cardImage(record)} alt="" className="w-14 h-14 rounded-xl object-contain product-photo-frame" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{record.name}</p>
                    <p className="text-xs text-[#756c7e] truncate">{[record.brand, formatContent(record), formatUSD(record.sale_price)].filter(Boolean).join(' · ')}</p>
                    {idx === 0 && similarity >= 60 && <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534]">Mejor coincidencia · {reason}</span>}
                  </div>
                  <div className="text-right flex-shrink-0"><p className="text-xs text-[#756c7e]">Similitud</p><p className="font-bold text-[#7c43ba]">{similarity}%</p></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </Modal>
  );
}

// ==========================================
// LISTA DE VENTAS
// ==========================================
export function QuickScanModal() {
  const items = useStore(s => s.quickScanItems);
  const discount = useStore(s => s.quickScanDiscount);
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  const applyDiscount = () => {
    const v = parseFloat(discountValue) || 0;
    if (v <= 0) { toast('Ingresa un valor de descuento válido'); return; }
    let amount = v;
    if (discountType === 'percent') {
      if (v > 100) { toast('El descuento no puede ser mayor al 100%'); return; }
      amount = subtotal * (v / 100);
    } else if (v > subtotal) { toast('El descuento no puede ser mayor al subtotal'); return; }
    setState({ quickScanDiscount: amount });
    toast(`Descuento aplicado: ${formatUSD(amount)}`);
    SoundEffects.play('success');
  };

  const remove = (index: number) => {
    setState({ quickScanItems: items.filter((_, i) => i !== index) });
    SoundEffects.play('click');
  };

  return (
    <Modal id="quick-scan-modal" onClose={stopQuickScanMode}>
      <article className="modal-card w-full max-w-2xl bg-white rounded-3xl max-h-[95vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0">
          <div><h2 className="font-bold text-xl hero-title text-[#7c43ba]">Lista de Ventas</h2><p className="text-xs text-[#756c7e]">{totalItems} {totalItems === 1 ? 'producto' : 'productos'}</p></div>
          <CloseButton onClick={stopQuickScanMode} />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => openBarcodeScanner('quick-scan')} className="py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2"><ScanLine className="w-5 h-5" /> Escanear</button>
            <button type="button" onClick={() => openModal('quick-scan-manual-modal')} className="py-3 rounded-xl btn-ghost font-bold flex items-center justify-center gap-2"><Plus className="w-5 h-5" /> Agregar</button>
          </div>
          {items.length === 0 && (
            <div className="text-center py-8"><div className="text-6xl mb-3">🛒</div><p className="font-bold text-gray-700">Tu lista está vacía</p><p className="text-sm text-gray-500 mt-1">Escanea productos o agrégalos manualmente</p></div>
          )}
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.product.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200">
                <img src={cardImage(item.product)} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{item.product.name}{formatContent(item.product) ? ` · ${formatContent(item.product)}` : ''}</p>
                  <p className="text-xs text-gray-500">{formatUSD(item.price)} x {item.quantity}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-sm">{formatUSD(item.price * item.quantity)}</p>
                  <button onClick={() => remove(index)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 pt-3">
            <label className="block text-xs font-bold mb-2">Descuento</label>
            <div className="flex gap-2">
              <input type="number" min={0} step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="flex-1 input-field rounded-lg p-2 text-sm" placeholder="0.00" />
              <select value={discountType} onChange={e => setDiscountType(e.target.value as 'fixed' | 'percent')} className="input-field rounded-lg p-2 text-sm">
                <option value="fixed">$ Fijo</option>
                <option value="percent">% Porcentaje</option>
              </select>
              <button type="button" onClick={applyDiscount} className="btn-ghost rounded-lg px-3 py-2 text-xs font-bold">Aplicar</button>
            </div>
          </div>
        </div>
        <div className="border-t-2 border-gray-200 bg-gray-50 p-4 flex-shrink-0">
          <div className="flex justify-between text-sm mb-1"><span className="text-[#756c7e]">Descuento:</span><span className="font-bold text-[#d97706]">{discount > 0 ? `-${formatUSD(discount)}` : 'Sin descuento'}</span></div>
          <div className="flex justify-between text-2xl mb-3"><span className="font-bold">TOTAL:</span><span className="font-bold text-[#7c43ba] hero-title">{formatUSD(subtotal - discount)}</span></div>
          <div className="flex gap-2">
            <button type="button" onClick={stopQuickScanMode} className="flex-1 py-3 rounded-xl btn-ghost font-bold">Cancelar</button>
            <button type="button" onClick={finalizeQuickScan} className="flex-1 py-3 rounded-xl btn-success font-bold flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" /> Finalizar</button>
          </div>
        </div>
      </article>
    </Modal>
  );
}

export function QuickScanManualModal() {
  const records = useStore(s => s.records);
  const [query, setQuery] = useState('');
  const q = query.toLowerCase().trim();
  const products = (q ? records.filter(p => (p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q))) : records).slice(0, 20);

  const add = (p: typeof records[number]) => {
    if (p.stock < 1) { toast('❌ Producto agotado'); return; }
    addToQuickScan(p, 1);
    closeModal('quick-scan-manual-modal');
  };

  return (
    <Modal id="quick-scan-manual-modal" className="z-[60] bg-[#1e1427]/60">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Agregar Producto</h2><CloseButton onClick={() => closeModal('quick-scan-manual-modal')} /></div>
        <label className="block text-sm font-bold mb-2">Buscar producto</label>
        <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)} className="w-full input-field rounded-xl p-3 mb-3" placeholder="Escribe el nombre del producto..." />
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {products.length === 0 && <p className="text-center text-gray-500 py-4">No se encontraron productos</p>}
          {products.map(p => (
            <div key={p.id} onClick={() => add(p)} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition">
              <img src={cardImage(p)} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{p.name}</p>
                <p className="text-xs text-gray-500">{p.brand}{formatContent(p) ? ` · ${formatContent(p)}` : ''} · Stock: {p.stock}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-sm text-[#7c43ba]">{formatUSD(p.sale_price)}</p>
                <button onClick={e => { e.stopPropagation(); add(p); }} className="mt-1 px-3 py-1 rounded-lg bg-[#7c43ba] text-white text-xs font-bold">+ Agregar</button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </Modal>
  );
}

// ==========================================
// RECIBO Y VISTA PREVIA DE IMAGEN
// ==========================================
export function SaleReceiptModal() {
  const r = useStore(s => s.receiptData);
  return (
    <Modal id="sale-receipt-modal" className="z-[70] bg-[#1e1427]/60">
      {r && (
        <article id="receipt-content" className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="text-center mb-4">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-3"><CheckCircle className="w-12 h-12 text-green-600" /></div>
            <h2 className="font-bold text-2xl hero-title text-green-700">¡Venta Exitosa!</h2>
            <p className="text-sm text-gray-600 mt-1">La venta ha sido registrada correctamente</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-2"><span className="text-sm text-gray-600">Fecha:</span><span className="text-sm font-bold">{r.date}</span></div>
            <div className="flex justify-between items-center mb-2"><span className="text-sm text-gray-600">Vendedor:</span><span className="text-sm font-bold">{r.seller}</span></div>
            <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Método de pago:</span><span className="text-sm font-bold">{r.payment}</span></div>
          </div>
          <div className="mb-4">
            <h3 className="font-bold text-sm mb-2">Productos vendidos:</h3>
            <div className="space-y-2 max-h-[30vh] overflow-y-auto">
              {r.items.map(item => (
                <div key={item.product.id} className="flex justify-between items-start py-2 border-b border-gray-100">
                  <div className="flex-1"><p className="font-bold text-sm">{item.product.name}</p><p className="text-xs text-gray-600">{item.product.brand}{formatContent(item.product) ? ` · ${formatContent(item.product)}` : ''} · {item.quantity} x {formatUSD(item.price)}</p></div>
                  <div className="text-right"><p className="font-bold text-sm">{formatUSD(item.price * item.quantity)}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t-2 border-gray-200 pt-3 mb-4">
            <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">Subtotal:</span><span className="font-bold">{formatUSD(r.subtotal)}</span></div>
            <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">Descuento:</span><span className="font-bold text-orange-600">{r.discount > 0 ? `-${formatUSD(r.discount)}` : 'Sin descuento'}</span></div>
            <div className="flex justify-between text-xl mt-2 pt-2 border-t border-gray-200"><span className="font-bold">TOTAL:</span><span className="font-bold text-green-700">{formatUSD(r.total)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button type="button" onClick={generateReceiptImage} className="py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Guardar</button>
            <button type="button" onClick={generateReceiptImage} className="py-3 rounded-xl btn-success font-bold flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> Enviar</button>
          </div>
          <button type="button" onClick={() => closeModal('sale-receipt-modal')} className="w-full mt-2 py-3 rounded-xl btn-ghost font-bold">Cerrar</button>
        </article>
      )}
    </Modal>
  );
}

export function ImagePreviewModal() {
  const preview = useStore(s => s.previewImage);

  const save = () => {
    if (!preview) return;
    downloadDataUrl(preview.dataUrl, preview.filename);
    toast('Imagen guardada ✓');
    SoundEffects.play('success');
    closeModal('image-preview-modal');
  };

  const share = async () => {
    if (!preview) return;
    try {
      const blob = await (await fetch(preview.dataUrl)).blob();
      const file = new File([blob], preview.filename, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Recibo de Venta', text: 'Recibo de venta' });
        toast('Imagen compartida ✓');
        closeModal('image-preview-modal');
      } else {
        downloadDataUrl(preview.dataUrl, preview.filename);
        toast('Imagen guardada (compartir no disponible)');
        closeModal('image-preview-modal');
      }
    } catch (e) {
      console.error('Error al compartir:', e);
      save();
    }
  };

  return (
    <Modal id="image-preview-modal" className="z-[80] bg-[#1e1427]/60">
      {preview && (
        <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Vista Previa</h2><CloseButton onClick={() => closeModal('image-preview-modal')} /></div>
          <div className="border-2 border-gray-200 rounded-xl overflow-hidden mb-4"><img src={preview.dataUrl} alt="Vista previa" className="w-full h-auto" /></div>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="flex-1 py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Guardar</button>
            <button type="button" onClick={share} className="flex-1 py-3 rounded-xl btn-success font-bold flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> Enviar</button>
          </div>
        </article>
      )}
    </Modal>
  );
}
