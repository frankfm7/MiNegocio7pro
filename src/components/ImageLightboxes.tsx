import { useRef } from 'react';
import { useBackClose } from '../lib/backClose';
import { X } from 'lucide-react';
import { setState, useStore } from '../store';

/**
 * Imagen del producto en tamaño grande (se abre al tocar la foto en el detalle).
 * Se cierra con DOBLE toque (un toque suelto no la cierra) o con la ✕.
 */
export function ProductImageLightbox() {
  const img = useStore(s => s.imageLightbox);
  const lastTap = useRef(0);
  const close = () => setState({ imageLightbox: null });
  useBackClose('image-lightbox', !!img, close);
  if (!img) return null;
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 400) { lastTap.current = 0; close(); } else lastTap.current = now;
  };
  return (
    <div id="product-image-lightbox" onClick={onTap} role="dialog" aria-label={img.alt} style={{ touchAction: 'manipulation' }}>
      <button type="button" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white grid place-items-center hover:bg-white/30 transition" aria-label="Cerrar" onClick={e => { e.stopPropagation(); close(); }}>
        <X className="w-6 h-6" />
      </button>
      <img src={img.src} alt={img.alt} />
      {img.alt && <p className="text-white mt-4 text-lg font-bold text-center max-w-[90%]">{img.alt}</p>}
      <p className="text-white/50 text-xs mt-2">Toca dos veces para cerrar</p>
    </div>
  );
}

/** Visor del QR de cobro a pantalla completa */
export function QrLightbox() {
  const qr = useStore(s => s.qrLightbox);
  useBackClose('qr-lightbox', !!qr, () => setState({ qrLightbox: null }));
  return (
    <div id="qr-lightbox" className={`fixed inset-0 z-[10000] bg-black/95 flex-col items-center justify-center p-4 ${qr ? '' : 'hidden'}`} onClick={() => setState({ qrLightbox: null })}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white grid place-items-center hover:bg-white/30 transition"><X className="w-6 h-6" /></button>
      {qr && <img id="qr-lightbox-img" src={qr.src} alt={qr.label} className="max-w-[95%] max-h-[75vh] object-contain rounded-xl bg-white p-4 shadow-2xl" />}
      <p id="qr-lightbox-label" className="text-white mt-4 text-lg font-bold text-center max-w-[90%]">{qr?.label}</p>
    </div>
  );
}
