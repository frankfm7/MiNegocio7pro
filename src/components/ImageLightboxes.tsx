import { X } from 'lucide-react';
import { setState, useStore } from '../store';

/** Imagen del producto en tamaño grande (se abre al tocar la foto en el detalle) */
export function ProductImageLightbox() {
  const img = useStore(s => s.imageLightbox);
  if (!img) return null;
  const close = () => setState({ imageLightbox: null });
  return (
    <div id="product-image-lightbox" onClick={close} role="dialog" aria-label={img.alt}>
      <button type="button" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white grid place-items-center hover:bg-white/30 transition" aria-label="Cerrar" onClick={close}>
        <X className="w-6 h-6" />
      </button>
      <img src={img.src} alt={img.alt} onClick={e => e.stopPropagation()} />
      {img.alt && <p className="text-white mt-4 text-lg font-bold text-center max-w-[90%]">{img.alt}</p>}
    </div>
  );
}

/** Visor del QR de cobro a pantalla completa */
export function QrLightbox() {
  const qr = useStore(s => s.qrLightbox);
  return (
    <div id="qr-lightbox" className={`fixed inset-0 z-[10000] bg-black/95 flex-col items-center justify-center p-4 ${qr ? '' : 'hidden'}`} onClick={() => setState({ qrLightbox: null })}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white grid place-items-center hover:bg-white/30 transition"><X className="w-6 h-6" /></button>
      {qr && <img id="qr-lightbox-img" src={qr.src} alt={qr.label} className="max-w-[95%] max-h-[75vh] object-contain rounded-xl bg-white p-4 shadow-2xl" />}
      <p id="qr-lightbox-label" className="text-white mt-4 text-lg font-bold text-center max-w-[90%]">{qr?.label}</p>
    </div>
  );
}
