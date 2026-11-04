import { Eye, Plus } from 'lucide-react';
import type { Product } from '../types';
import { cardImage, formatContent, formatUSD } from '../lib/format';
import { fallback } from '../lib/constants';
import { addCart, openDetail } from '../actions';
import { useImageBg } from '../lib/imageBg';

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
  return (
    <article className={`product-card flex flex-col ${stateCls}`} data-id={r.id} onClick={() => openDetail(r)}>
      <div className="relative">
        <img className={`product-image ${photoBg ? 'solid-bg' : ''}`} style={photoBg ? { background: photoBg } : undefined} src={cardImage(r)} alt={r.name} loading="lazy" onError={e => { e.currentTarget.src = fallback; }} />
        <span className={`card-stock absolute top-2 right-2 text-[10px] rounded-full px-2 py-0.5 font-bold shadow-sm ${stock < 1 ? 'bg-[#a43658] text-white' : stock <= 3 ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-white/95 text-[#5f3291]'}`}>
          {stock < 1 ? 'Agotado' : `${r.stock} u.`}
        </span>
        {showCatalog && savePct >= 1 && <span className="absolute top-2 left-2 text-[10px] rounded-full px-2 py-0.5 font-bold bg-[#be416d] text-white shadow-sm">-{savePct}%</span>}
      </div>
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <h3 className="card-name font-bold leading-snug line-clamp-2 text-[15px] text-[#201728]" title={r.name}>{r.name}</h3>
        {details && <p className="card-brand text-[11px] font-bold text-[#7b43a8] mt-1 truncate" title={details}>{details}</p>}
        {(r.type || r.category) && <p className="card-category text-[11px] text-[#756c7e] truncate">{[r.type, r.category].filter(Boolean).join(' · ')}</p>}
        {r.offer_text && <div className="card-offer mt-1.5 self-start px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] text-[11px] font-bold truncate max-w-full">{r.offer_text}</div>}

        <div className="mt-auto pt-3">
          {showCatalog && <p className="text-[11px] text-[#9b8fa5]">Catálogo <span className="line-through">{formatUSD(catalog)}</span></p>}
          <p className="card-price text-lg font-bold text-[#6d389f] hero-title leading-tight">{formatUSD(sale)}</p>
          <p className="sensitive-data text-[11px] text-[#756c7e] mt-0.5">Costo <b className="text-[#201728]">{formatUSD(r.cost_price)}</b> · <span className="text-[#166534] font-bold">+{formatUSD(sale - Number(r.cost_price || 0))}</span></p>
          <div className="grid grid-cols-[1fr_auto] gap-2 mt-2.5">
            <button type="button" className="h-9 rounded-xl btn-ghost text-xs font-bold flex items-center justify-center gap-1" onClick={e => { e.stopPropagation(); openDetail(r); }}>
              <Eye className="w-3.5 h-3.5" /> Ver
            </button>
            <button type="button" className="quick-cart h-9 px-3 rounded-xl btn-primary text-xs font-bold flex items-center justify-center gap-1" aria-label="Añadir al pedido" onClick={e => { e.stopPropagation(); addCart(r); }}>
              <Plus className="w-4 h-4" /> Pedido
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
