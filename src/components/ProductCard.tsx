import { useRef } from 'react';
import { Check } from 'lucide-react';
import { getState, setState, useStore } from '../store';
import type { Product } from '../types';
import { cardImage, formatContent, formatUSD } from '../lib/format';
import { fallback } from '../lib/constants';
import { openDetail } from '../actions';
import { useImageBg } from '../lib/imageBg';
import { guessCommonName } from '../lib/commonName';

/**
 * Tarjeta de producto. Orden: foto → nombre → detalle (marca, contenido, precios) → botones.
 * El costo y la ganancia solo los ven los administradores (y se ocultan en modo cliente).
 */
export default function ProductCard({ r }: { r: Product }) {
  const stock = Number(r.stock);
  const content = formatContent(r);
  const stateCls = stock < 1 ? 'out-of-stock opacity-60' : stock <= 3 ? 'low-stock' : '';
  const catalog = Number(r.catalog_price) || 0;
  const sale = Number(r.sale_price) || 0;
  const showCatalog = catalog > sale + 0.004;
  const savePct = showCatalog ? Math.round((1 - sale / catalog) * 100) : 0;
  const details = [r.brand, content].filter(Boolean).join(' · ');
  const photoBg = useImageBg(r.image_url);
  const common = r.common_name || guessCommonName(r.name, r.type);
  // Selección para la Nota de venta: pulsación larga activa; con la selección abierta, un toque agrega o quita
  const selected = useStore(s => s.notaSel.includes(r.id));
  const selecting = useStore(s => s.notaSel.length > 0);
  const press = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const toggle = () => { const cur = getState().notaSel; setState({ notaSel: cur.includes(r.id) ? cur.filter(x => x !== r.id) : [...cur, r.id] }); };
  const onDown = (e: React.PointerEvent) => {
    if (press.current) clearTimeout(press.current.t);
    const p = { x: e.clientX, y: e.clientY, fired: false, t: setTimeout(() => { p.fired = true; toggle(); try { navigator.vibrate?.(35); } catch { /* sin vibración */ } }, 480) };
    press.current = p;
  };
  const cancel = () => { if (press.current && !press.current.fired) clearTimeout(press.current.t); };
  const onMove = (e: React.PointerEvent) => { const p = press.current; if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(p.t); press.current = null; } };
  const onClick = () => {
    const p = press.current; press.current = null;
    if (p?.fired) return;
    if (selecting) toggle(); else openDetail(r);
  };
  return (
    <article className={`product-card flex flex-col ${stateCls} ${selected ? 'ring-4 ring-[#7c43ba] ring-offset-2' : ''}`} data-id={r.id} aria-pressed={selecting ? selected : undefined}
      onPointerDown={onDown} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onPointerMove={onMove}
      onClick={onClick} onContextMenu={e => e.preventDefault()} style={{ WebkitTouchCallout: 'none' }}>
      <div className="relative">
        <img className={`product-image ${photoBg ? 'solid-bg' : ''}`} style={photoBg ? { background: photoBg } : undefined} src={cardImage(r)} alt={r.name} loading="lazy" onError={e => { e.currentTarget.src = fallback; }} />
        <span className={`card-stock absolute top-2 right-2 text-[10px] rounded-full px-2 py-0.5 font-bold shadow-sm ${stock < 1 ? 'bg-[#a43658] text-white' : stock <= 3 ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-white/95 text-[#5f3291]'}`}>
          {stock < 1 ? 'Agotado' : `${r.stock} u.`}
        </span>
        {selecting && <span className={`card-check absolute bottom-2 left-2 w-7 h-7 rounded-full grid place-items-center shadow ${selected ? 'bg-[#7c43ba] text-white' : 'bg-white/90 border-2 border-[#cbbdd6]'}`}>{selected && <Check className="w-4 h-4" />}</span>}
        {showCatalog && savePct >= 1 && <span className="absolute top-2 left-2 text-[10px] rounded-full px-2 py-0.5 font-bold bg-[#be416d] text-white shadow-sm">-{savePct}%</span>}
      </div>
      <div className="px-2.5 pt-2 pb-2.5 sm:px-3.5 sm:pt-3 sm:pb-3.5 flex flex-col flex-1">
        <h3 className="card-name font-bold leading-tight line-clamp-2 text-[14px] text-[#201728]" title={r.name}>{r.name}</h3>
        {common && <p className="card-common text-[11px] italic text-[#5c5266] leading-tight truncate" title={common}>{common}</p>}
        {details && <p className="card-brand text-[10.5px] font-bold text-[#7b43a8] mt-0.5 truncate" title={details}>{details}</p>}
        {(r.type || r.category) && <p className="card-category text-[10px] text-[#756c7e] truncate leading-tight">{[r.type, r.category].filter(Boolean).join(' · ')}</p>}
        {r.offer_text && <div className="card-offer mt-1 self-start px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] text-[10px] font-bold truncate max-w-full">{r.offer_text}</div>}

        <div className="mt-auto pt-1.5">
          {showCatalog && <p className="text-[10px] text-[#9b8fa5] leading-tight">Catálogo <span className="line-through">{formatUSD(catalog)}</span></p>}
          <p className="card-price text-base font-bold text-[#6d389f] hero-title leading-tight">{formatUSD(sale)}</p>
          {Number(r.min_price) > 0 && <p className="card-min sensitive-data text-[10px] text-[#756c7e] leading-tight">Mínimo <b className="text-[#a43658]">{formatUSD(r.min_price)}</b></p>}
        </div>
      </div>
    </article>
  );
}
