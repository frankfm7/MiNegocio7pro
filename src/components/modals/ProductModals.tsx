import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Check, CheckCircle, Copy, Download, Info, Loader, Maximize2, Minus, MoreVertical, PackagePlus, Plus, Printer, QrCode, Share2, Trash2, X, XCircle,
} from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, getState, openModal, setState, toast, useStore } from '../../store';
import { addCart, confirmSale, deleteProduct, duplicateProduct, openForm, openSaleModal } from '../../actions';
import { cardImage, formatContent, formatUSD, formatUSDShort } from '../../lib/format';
import { APP_NAME, fallback } from '../../lib/constants';
import { generateProductQRImage, printProductQR } from '../../lib/qr';
import { SoundEffects } from '../../lib/sound';
import { downloadDataUrl } from '../../lib/image';

// ==========================================
// DETALLE DE PRODUCTO
// ==========================================
export function DetailModal() {
  const detail = useStore(s => s.detail);
  // Siempre mostrar la versión más reciente del producto (stock, etc.)
  const r = useStore(s => (s.detail ? s.records.find(x => x.id === s.detail!.id) || s.detail : null));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('#detail-more-btn')) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  if (!detail || !r) return <Modal id="detail-modal" closeOnBackdrop={false}>{null}</Modal>;

  const content = formatContent(r);
  const outOfStock = Number(r.stock) < 1;
  const img = cardImage(r);
  const run = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(false); fn(); };

  const showProductQR = async () => {
    try {
      toast('Generando QR...', 2000);
      setState({ qrProduct: { product: r, image: await generateProductQRImage(r) } });
      openModal('product-qr-modal');
    } catch (e) { toast('Error al generar QR: ' + (e as Error).message, 4000); }
  };

  return (
    <Modal id="detail-modal" closeOnBackdrop={false}>
      <article className="modal-card w-full max-w-lg bg-white rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="relative">
          <img
            id="detail-image" src={img} alt={r.name}
            className="w-full h-72 sm:h-80 object-contain p-3 product-photo-frame zoomable-image"
            onError={e => { e.currentTarget.src = fallback; }}
            onClick={() => setState({ imageLightbox: { src: img, alt: r.name } })}
            title="Toca para ver la imagen en grande"
          />
          <button type="button" onClick={() => setState({ imageLightbox: { src: img, alt: r.name } })} className="absolute bottom-3 left-3 h-9 px-3 rounded-full bg-black/50 text-white text-xs font-bold backdrop-blur flex items-center gap-1.5 hover:bg-black/60" aria-label="Ver imagen en grande">
            <Maximize2 className="w-4 h-4" /> Ver en grande
          </button>
          <button id="close-detail" type="button" onClick={() => closeModal('detail-modal')} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur grid place-items-center hover:bg-white shadow-lg" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <div className="flex justify-between gap-4 items-start">
            <div className="min-w-0 flex-1">
              <p id="detail-brand" className="text-xs font-bold text-[#7b43a8] uppercase tracking-[.12em]">{r.brand}</p>
              <h2 id="detail-name" className="hero-title text-2xl sm:text-3xl font-bold mt-1 break-words">{r.name}</h2>
              {content && (
                <p id="detail-content" className="mt-2 mr-2 px-3 py-1 rounded-full bg-[#f0e7f6] text-[#70429c] text-sm font-bold inline-block">Contenido: {content}</p>
              )}
              {r.offer_text && <p id="detail-offer" className="mt-2 px-3 py-1 rounded-full bg-[#fef3c7] text-[#92400e] text-sm font-bold inline-block">{r.offer_text}</p>}
            </div>
            <div className="relative flex-shrink-0 sensitive-data">
              <button id="detail-more-btn" type="button" onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }} className="w-10 h-10 rounded-full bg-[#f1ecf4] grid place-items-center hover:bg-[#e8dfec]"><MoreVertical className="w-5 h-5" /></button>
              <div id="detail-dropdown" className={`dropdown-menu ${menuOpen ? 'open' : ''}`}>
                <button className="dropdown-item" onClick={run(() => duplicateProduct(r))}><Copy className="w-4 h-4" /> Duplicar</button>
                <button className="dropdown-item" onClick={run(() => { setState({ barcodeProduct: r }); openModal('barcode-print-modal'); })}><Printer className="w-4 h-4" /> Imprimir código</button>
                <button className="dropdown-item" onClick={run(() => window.open(`https://wa.me/?text=${encodeURIComponent(`Necesito más stock de: ${r.name}`)}`, '_blank'))}><PackagePlus className="w-4 h-4" /> Solicitar stock</button>
                <button className="dropdown-item" onClick={run(() => {
                  const msg = `${r.name} - ${r.brand}${content ? ` (${content})` : ''}\n${formatUSD(r.sale_price)}`;
                  if (navigator.share) navigator.share({ title: r.name, text: msg }).catch(() => {});
                  else { navigator.clipboard.writeText(msg); toast('Copiado ✓'); }
                })}><Share2 className="w-4 h-4" /> Compartir</button>
                <button className="dropdown-item" onClick={run(showProductQR)}><QrCode className="w-4 h-4" /> Generar código QR</button>
                <div className="my-1 border-t border-[#e8dfec]" />
                <button className="dropdown-item danger admin-only" onClick={run(() => deleteProduct(r))}><Trash2 className="w-4 h-4" /> Eliminar</button>
              </div>
            </div>
          </div>
          <p id="detail-meta" className="text-sm text-[#756c7e] mt-2">{`${r.type} · ${r.category || ''} · ${r.stock} unidades disponibles`}</p>
          <p id="detail-description" className="text-sm leading-relaxed mt-4 text-[#4a3f55]">{r.description || 'Sin descripción.'}</p>
          <div className="mt-6 p-5 rounded-2xl bg-gradient-to-br from-[#f6f1f8] to-[#ede1f8] text-center shadow-inner">
            <p className="text-xs uppercase tracking-[.15em] font-bold text-[#704397]">Precio de venta</p>
            <p id="detail-sale-price" className="price-highlight mt-2">{formatUSDShort(r.sale_price)} <span className="currency-tag">USD</span></p>
            <p id="detail-min-price" className="text-xs text-[#756c7e] mt-1 member-only"><span className="text-xs text-[#756c7e]">Mínimo:</span> <span className="font-bold text-sm text-[#a43658]">{formatUSD(r.min_price || 0)}</span></p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:gap-3 mt-4 sensitive-data">
            <div className="rounded-2xl bg-white border border-[#ede7f0] p-3 text-center shadow-sm">
              <p className="text-[10px] text-[#746d7d] uppercase tracking-wide">Costo</p>
              <p id="detail-cost-price" className="font-bold mt-1 text-sm">{formatUSD(r.cost_price)}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] border border-[#bbf7d0] p-3 text-center shadow-sm mt-3 sensitive-data">
            <p className="text-[10px] text-[#166534] uppercase tracking-wide font-bold">Ganancia por unidad</p>
            <p id="detail-profit" className="font-bold mt-1 text-lg text-[#166534]">{formatUSD(Number(r.sale_price) - Number(r.cost_price))}</p>
          </div>
          <div className="flex gap-2 mt-6">
            <button id="detail-sold" type="button" disabled={outOfStock} style={outOfStock ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              onClick={() => { if (outOfStock) { toast('No hay stock'); return; } closeModal('detail-modal'); openSaleModal(r); }}
              className="flex-1 rounded-xl py-3 btn-success font-bold text-sm flex items-center justify-center gap-1.5 member-only">
              {outOfStock ? <><XCircle className="w-4 h-4" /> Agotado</> : <><CheckCircle className="w-4 h-4" /> Vender</>}
            </button>
            <button id="detail-pencil" type="button" onClick={() => { closeModal('detail-modal'); openForm(r); }} className="flex-1 rounded-xl py-3 btn-ghost font-bold text-sm sensitive-data">Editar</button>
            <button id="detail-cart" type="button" onClick={() => { addCart(r); closeModal('detail-modal'); }} className="flex-1 rounded-xl py-3 btn-primary font-bold text-sm">+ Carrito</button>
          </div>
        </div>
      </article>
    </Modal>
  );
}

// ==========================================
// REGISTRAR VENTA
// ==========================================
export function SaleModal() {
  const r = useStore(s => s.saleProduct);
  const method = useStore(s => s.selectedPaymentMethod);
  const open = useStore(s => !!s.modals['sale-modal']);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [processing, setProcessing] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && r) {
      setQty(1);
      setPrice(String(r.sale_price));
      setTimeout(() => priceRef.current?.focus(), 300);
    }
  }, [open, r]);

  if (!r) return <Modal id="sale-modal" className="z-[60] bg-[#1e1427]/70" closeOnBackdrop={false}>{null}</Modal>;

  const actual = Number(price) || Number(r.sale_price) || 0;
  const total = actual * qty;
  const profit = (actual - Number(r.cost_price)) * qty;
  const payBtn = (m: string) => m === method
    ? 'pay-method-btn py-2 rounded-xl border-2 border-[#7c43ba] bg-[#f6f1f8] font-bold text-sm'
    : 'pay-method-btn py-2 rounded-xl border-2 border-[#e8dfec] text-[#756c7e] font-bold text-sm';

  const confirm = async () => {
    if (processing) return;
    setProcessing(true);
    await confirmSale(qty, Number(price));
    setProcessing(false);
  };

  return (
    <Modal id="sale-modal" className="z-[60] bg-[#1e1427]/70" closeOnBackdrop={false}>
      <article className="modal-card w-full max-w-md bg-white rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Registrar venta</h2><CloseButton onClick={() => closeModal('sale-modal')} /></div>
          <div className="p-4 rounded-2xl bg-[#f6f1f8] mb-4">
            <p className="text-xs text-[#756c7e] uppercase tracking-wide">Producto</p>
            <p className="font-bold text-lg mt-1 break-words">{r.name}{formatContent(r) ? ` · ${formatContent(r)}` : ''}</p>
          </div>
          <div className="bg-[#f0fdf4] p-4 rounded-2xl mb-4 text-center border border-[#bbf7d0]">
            <p className="text-xs text-[#166534] font-bold uppercase">Total a cobrar</p>
            <p className="text-4xl font-bold text-[#166534] mt-1">${formatUSDShort(total)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-bold mb-1">Cantidad</label>
              <div className="flex items-center border border-[#e8dfec] rounded-xl overflow-hidden">
                <button type="button" onClick={() => qty > 1 && setQty(qty - 1)} className="px-3 py-2 bg-[#f6f1f8]"><Minus className="w-4 h-4" /></button>
                <input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} className="w-full text-center outline-none py-2" />
                <button type="button" onClick={() => { if (qty < Number(r.stock)) setQty(qty + 1); else toast('Stock máximo'); }} className="px-3 py-2 bg-[#f6f1f8]"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Precio Unit.</label>
              <input ref={priceRef} type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="w-full border border-[#e8dfec] rounded-xl p-2 outline-none focus:border-[#7c43ba]" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-bold mb-1">Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {['Efec.', 'QR'].map(m => <button key={m} type="button" className={payBtn(m)} onClick={() => setState({ selectedPaymentMethod: m })}>{m}</button>)}
            </div>
          </div>
          <div className="mb-4 p-3 rounded-xl bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] border border-[#bbf7d0]">
            <div className="flex justify-between items-center"><span className="text-sm font-bold text-[#166534]">Ganancia total:</span><span className={`font-bold text-lg ${profit >= 0 ? 'text-[#166534]' : 'text-[#a43658]'}`}>{formatUSD(profit)}</span></div>
          </div>
          <div className="flex gap-2 sticky bottom-0 bg-white pt-2">
            <button type="button" onClick={() => closeModal('sale-modal')} className="flex-1 rounded-xl py-3 btn-ghost font-bold">Cancelar</button>
            <button id="confirm-sale" type="button" disabled={processing} onClick={confirm} className="flex-1 rounded-xl py-3 btn-success font-bold flex items-center justify-center gap-1.5">
              {processing ? <><Loader className="w-4 h-4 animate-spin" /> Procesando...</> : <><Check className="w-4 h-4" /> Confirmar</>}
            </button>
          </div>
        </div>
      </article>
    </Modal>
  );
}

// ==========================================
// INFORMACIÓN PÚBLICA (QR escaneado)
// ==========================================
export function PublicProductModal() {
  const p = useStore(s => s.publicProduct);
  const field = (label: string, value: React.ReactNode, cls = '') => (
    <div><p className="text-xs text-[#756c7e] uppercase tracking-wide">{label}</p><p className={cls}>{value}</p></div>
  );
  return (
    <Modal id="public-product-modal">
      {p && (
        <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-xl hero-title">Información del Producto</h2>
            <CloseButton onClick={() => closeModal('public-product-modal')} />
          </div>
          {p.img && <img src={p.img} alt={p.n} className="w-full h-48 object-cover rounded-xl mb-4 zoomable-image" onClick={() => setState({ imageLightbox: { src: p.img!, alt: p.n } })} />}
          <div className="space-y-3">
            {field('Producto', p.n, 'font-bold text-lg')}
            {p.b && field('Marca', p.b, 'font-semibold')}
            {p.t && field('Tipo', p.t)}
            {p.cv && field('Contenido', p.cv, 'font-semibold')}
            {p.p && field('Precio', p.p, 'font-bold text-[#7c43ba] text-lg')}
            {p.s && field('Tienda', p.s)}
            {p.c && field('Categoría', p.c)}
            {p.d && field('Descripción', p.d, 'text-sm text-gray-600')}
            {p.o && (
              <div className="p-3 rounded-xl bg-[#fef3c7] border border-[#fde68a]">
                <p className="text-xs text-[#92400e] font-bold uppercase tracking-wide">Oferta</p>
                <p className="font-bold text-[#92400e]">{p.o}</p>
              </div>
            )}
          </div>
          <div className="mt-4 p-3 rounded-xl bg-[#f6f1f8]">
            <p className="text-xs text-[#756c7e] text-center"><Info className="w-3 h-3 inline" /> Este producto no está en los catálogos que tienes abiertos. Para comprarlo, contacta al vendedor.</p>
          </div>
        </article>
      )}
    </Modal>
  );
}

// ==========================================
// QR DEL PRODUCTO
// ==========================================
export function ProductQrModal() {
  const qr = useStore(s => s.qrProduct);
  return (
    <Modal id="product-qr-modal">
      {qr && (
        <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-xl hero-title">Código QR del Producto</h2>
            <CloseButton onClick={() => closeModal('product-qr-modal')} />
          </div>
          <div className="text-center">
            <img src={qr.image} alt="QR Code" className="mx-auto mb-4 border-4 border-white shadow-lg rounded-lg" />
            <h3 className="font-bold text-lg mb-1">{qr.product.name}</h3>
            <p className="text-[#7c43ba] font-bold text-xl mb-4">{formatUSD(qr.product.sale_price)}</p>
            <div className="p-3 rounded-xl bg-[#f6f1f8] mb-4">
              <p className="text-xs text-[#756c7e]"><Info className="w-3 h-3 inline" /> Con cualquier lector de QR se ve solo el nombre, contenido y precio (nunca costos). Con {APP_NAME} se abre el producto al instante.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { downloadDataUrl(qr.image, `QR_${qr.product.name.replace(/[^a-z0-9]/gi, '_')}.png`); toast('QR descargado ✓'); SoundEffects.play('success'); }} className="flex-1 py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Descargar</button>
              <button type="button" onClick={() => printProductQR(qr.product, qr.image)} className="flex-1 py-3 rounded-xl btn-ghost font-bold flex items-center justify-center gap-2"><Printer className="w-4 h-4" /> Imprimir</button>
            </div>
          </div>
        </article>
      )}
    </Modal>
  );
}

// ==========================================
// IMPRIMIR CÓDIGO DE BARRAS
// ==========================================
export function BarcodePrintModal() {
  const product = useStore(s => s.barcodeProduct);
  const open = useStore(s => !!s.modals['barcode-print-modal']);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open || !product || !svgRef.current) return;
    const code = product.barcode || product.id;
    try { JsBarcode(svgRef.current, code, { format: 'CODE128', width: 2, height: 80, displayValue: true, fontSize: 14, margin: 10 }); }
    catch {
      try { JsBarcode(svgRef.current, code, { format: 'CODE39', width: 1.5, height: 60, displayValue: true, fontSize: 12, margin: 10 }); }
      catch { toast('No se pudo generar código'); closeModal('barcode-print-modal'); }
    }
  }, [open, product]);

  const download = () => {
    const svg = svgRef.current; if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
      downloadDataUrl(canvas.toDataURL('image/png'), `codigo_${getState().barcodeProduct?.name || 'producto'}.png`);
      toast('Código descargado ✓');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Modal id="barcode-print-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Imprimir código</h2><CloseButton onClick={() => closeModal('barcode-print-modal')} /></div>
        <div className="p-4 rounded-xl bg-[#f6f1f8] mb-4 text-center"><p className="text-xs text-[#756c7e] uppercase tracking-wide">Producto</p><p className="font-bold text-lg mt-1 break-words">{product?.name}</p></div>
        <div id="barcode-print-area" className="bg-white p-4 rounded-xl border border-[#ede7f0] text-center mb-4"><svg ref={svgRef} id="barcode-svg" /></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="flex-1 py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2"><Printer className="w-4 h-4" /> Imprimir</button>
          <button type="button" onClick={download} className="flex-1 py-3 rounded-xl btn-ghost font-bold flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Descargar</button>
        </div>
      </article>
    </Modal>
  );
}
