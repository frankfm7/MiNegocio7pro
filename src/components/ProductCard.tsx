import { Plus } from 'lucide-react';
import type { Product } from '../types';
import { cardImage, formatContent, formatUSD } from '../lib/format';
import { fallback } from '../lib/constants';
import { addCart, openDetail } from '../actions';

export default function ProductCard({ r }: { r: Product }) {
  const stock = Number(r.stock);
  const content = formatContent(r);
  const stateCls = stock < 1 ? 'out-of-stock opacity-50' : stock <= 3 ? 'low-stock' : '';
  return (
    <article className={`product-card ${stateCls}`} data-id={r.id} onClick={() => openDetail(r)}>
      <img className="product-image" src={cardImage(r)} alt={r.name} loading="lazy" onError={e => { e.currentTarget.src = fallback; }} />
      <div className="p-4">
        <div className="flex justify-between gap-2">
          <p className="card-brand text-[10px] uppercase tracking-[.12em] font-bold text-[#7b43a8]">{r.brand}</p>
          <span className="card-stock text-[10px] bg-[#f0e7f6] rounded-full px-2 py-1 font-bold">{stock < 1 ? 'Agotado' : `${r.stock} u.`}</span>
        </div>
        <h3 className="card-name font-bold leading-snug mt-1 line-clamp-2 min-h-[42px]">{r.name}</h3>
        <p className="card-category text-xs text-[#756c7e] mt-1">{`${r.type} · ${r.category || ''}`}</p>
        {content && <span className="card-content inline-block mt-1.5 text-[10px] bg-[#f6f1f8] text-[#70429c] rounded-full px-2 py-0.5 font-bold">{content}</span>}
        {r.offer_text && <div className="card-offer mt-2 px-2 py-1 rounded-full bg-[#fef3c7] text-[#92400e] text-xs font-bold">{r.offer_text}</div>}
        <div className="flex justify-between items-end mt-4">
          <div><p className="text-[10px] text-[#756c7e]">Precio venta</p><p className="card-price text-lg font-bold text-[#6d389f] hero-title">{formatUSD(r.sale_price)}</p></div>
          <button type="button" className="quick-cart w-9 h-9 rounded-xl bg-[#f0e7f6] text-[#70409c] grid place-items-center hover:bg-[#e0d4f0]" aria-label="Añadir al pedido" onClick={e => { e.stopPropagation(); addCart(r); }}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
