import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Minus, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { fetchPublicImages, fetchPublicShop, type PublicShopData } from './lib/publicShop';
import { fallback } from './lib/constants';
import { formatUSD } from './lib/format';
import { waLink } from './lib/whatsapp';
import Brand from './components/Brand';

type Item = PublicShopData['products'][number];
const content = (p: Item) => (p.cv ? `${p.cv}${p.cu ? ' ' + p.cu : ''}` : '');

/** Catálogo para clientes: sin iniciar sesión, solo lectura, pedido por WhatsApp */
export default function PublicShop({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicShopData | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState('');
  const [q, setQ] = useState('');
  const cartKey = `mc7_shop_cart_${slug}`;
  const [cart, setCart] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(cartKey) || '{}'); } catch { return {}; } });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('mc7_shop_name') || '');
  const [note, setNote] = useState('');
  const loadedImgs = useRef(new Set<string>());

  useEffect(() => {
    fetchPublicShop(slug).then(setData).catch(e => {
      setError(e?.message === 'not-configured' ? 'Esta tienda aún no está conectada.' : 'No se pudo cargar el catálogo. Revisa tu conexión.');
      setData(null);
    });
  }, [slug]);

  useEffect(() => { try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* sin espacio */ } }, [cart, cartKey]);
  useEffect(() => { if (data) document.title = data.store.name; }, [data]);

  // Las fotos se piden de a 12 para que la página abra rápido
  useEffect(() => {
    if (!data) return;
    let live = true;
    (async () => {
      const ids = data.products.filter(p => p.has_image).map(p => p.id);
      for (let i = 0; i < ids.length && live; i += 12) {
        const batch = ids.slice(i, i + 12).filter(id => !loadedImgs.current.has(id));
        batch.forEach(id => loadedImgs.current.add(id));
        if (!batch.length) continue;
        const got = await fetchPublicImages(slug, batch);
        if (live) setImages(prev => ({ ...prev, ...got }));
      }
    })();
    return () => { live = false; };
  }, [data, slug]);

  const products = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.products || []).filter(p =>
      (!catalog || p.catalog_id === catalog) &&
      (!term || [p.name, p.brand, p.type, p.category].some(v => (v || '').toLowerCase().includes(term))));
  }, [data, catalog, q]);

  const lines = (data?.products || []).filter(p => cart[p.id] > 0).map(p => ({ p, qty: Math.min(cart[p.id], p.stock) }));
  const total = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const setQty = (p: Item, qty: number) => setCart(c => { const n = { ...c }; if (qty <= 0) delete n[p.id]; else n[p.id] = Math.min(qty, p.stock); return n; });

  const order = () => {
    if (!name.trim()) { alert('Escribe tu nombre para enviar el pedido'); return; }
    localStorage.setItem('mc7_shop_name', name.trim());
    const text = [`🛍️ *Nuevo pedido de ${name.trim()}*`, '',
      ...lines.map(l => `• ${l.qty} x ${l.p.name}${content(l.p) ? ` (${content(l.p)})` : ''} — ${formatUSD(l.p.price * l.qty)}`),
      '', `*Total: ${formatUSD(total)}*`, ...(note.trim() ? ['', `Nota: ${note.trim()}`] : []), '', 'Enviado desde el catálogo en línea'].join('\n');
    window.open(waLink(data?.store.whatsapp || '', text), '_blank', 'noopener');
  };

  if (data === undefined) return <div className="min-h-screen grid place-items-center text-[#756c7e]">Cargando catálogo...</div>;
  if (data === null) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div><p className="text-5xl mb-3">🛍️</p><h1 className="hero-title text-2xl font-bold">{error ? 'Catálogo no disponible' : 'Catálogo no encontrado'}</h1>
          <p className="text-[#756c7e] mt-2">{error || 'Este enlace no existe o la tienda lo desactivó.'}</p></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f5f8] pb-28">
      <header className="bg-gradient-to-br from-[#9a5ee0] to-[#5a2d8c] text-white px-4 pt-8 pb-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[.2em] opacity-80">Catálogo en línea</p>
          <h1 className="hero-title text-3xl font-bold mt-1">{data.store.name}</h1>
          <label className="mt-4 bg-white/95 text-[#201728] rounded-full h-11 flex items-center gap-2 px-4">
            <Search className="w-4 h-4 text-[#7c7384]" />
            <input value={q} onChange={e => setQ(e.target.value)} className="bg-transparent outline-none flex-1 text-sm" placeholder="Buscar productos..." />
          </label>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 pt-4">
        {data.catalogs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
            {[{ id: '', name: 'Todo' }, ...data.catalogs].map(c => (
              <button key={c.id} type="button" onClick={() => setCatalog(c.id)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ${catalog === c.id ? 'bg-[#7c43ba] text-white' : 'bg-white text-[#756c7e] border border-[#e8dfec]'}`}>{c.name}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {products.map(p => (
            <article key={p.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#ede7f0] flex flex-col">
              <div className="aspect-square product-photo-frame">
                <img src={images[p.id] || fallback} alt={p.name} className="w-full h-full object-contain" />
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <p className="font-bold text-sm leading-tight">{p.name}</p>
                <p className="text-[11px] text-[#756c7e] mt-0.5">{[p.brand, content(p)].filter(Boolean).join(' · ')}</p>
                {p.offer && <p className="mt-1 text-[11px] px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] font-bold self-start">{p.offer}</p>}
                {p.stock <= 3 && <p className="text-[11px] text-[#d97706] font-bold mt-1">¡Últimas {p.stock}!</p>}
                <div className="mt-auto pt-2">
                  <p className="font-bold text-[#7c43ba]">{formatUSD(p.price)}</p>
                  {cart[p.id] > 0 ? (
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-[#e8dfec] overflow-hidden">
                      <button type="button" onClick={() => setQty(p, cart[p.id] - 1)} className="px-3 py-2 bg-[#f6f1f8]" aria-label="Quitar uno"><Minus className="w-4 h-4" /></button>
                      <span className="font-bold text-sm">{cart[p.id]}</span>
                      <button type="button" onClick={() => setQty(p, cart[p.id] + 1)} className="px-3 py-2 bg-[#f6f1f8]" aria-label="Agregar uno"><Plus className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setQty(p, 1)} className="mt-2 w-full py-2 rounded-xl btn-primary text-sm font-bold">Agregar</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        {products.length === 0 && <p className="text-center text-[#756c7e] py-12">No hay productos que coincidan.</p>}
        <p className="text-center text-[11px] text-[#9b90a6] mt-10">Hecho con <Brand /></p>
      </main>

      {count > 0 && !open && (
        <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-30 rounded-2xl bg-[#7c43ba] text-white shadow-2xl px-5 py-4 flex items-center gap-3 font-bold">
          <ShoppingCart className="w-5 h-5" /><span className="flex-1 text-left">Ver pedido ({count})</span><span>{formatUSD(total)}</span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-40 bg-[#1e1427]/60 flex items-end sm:items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3"><h2 className="hero-title font-bold text-xl">Tu pedido</h2><button type="button" onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-[#f1ecf4] grid place-items-center" aria-label="Cerrar"><X className="w-4 h-4" /></button></div>
            <div className="space-y-2 mb-3">
              {lines.map(l => (
                <div key={l.p.id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0"><p className="font-bold truncate">{l.p.name}</p><p className="text-[11px] text-[#756c7e]">{formatUSD(l.p.price)} c/u</p></div>
                  <div className="flex items-center border border-[#e8dfec] rounded-lg overflow-hidden">
                    <button type="button" onClick={() => setQty(l.p, l.qty - 1)} className="px-2 py-1 bg-[#f6f1f8]"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="px-2 font-bold">{l.qty}</span>
                    <button type="button" onClick={() => setQty(l.p, l.qty + 1)} className="px-2 py-1 bg-[#f6f1f8]"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="font-bold w-20 text-right">{formatUSD(l.p.price * l.qty)}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-lg border-t border-[#ede7f0] pt-3 mb-3"><span>Total</span><span className="text-[#7c43ba]">{formatUSD(total)}</span></div>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full input-field rounded-xl p-3 mb-2" placeholder="Tu nombre *" />
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full input-field rounded-xl p-3 mb-3 text-sm" placeholder="Nota (dirección, hora de entrega...)" />
            <button type="button" onClick={order} className="w-full py-3.5 rounded-xl bg-[#25D366] text-white font-bold flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> Enviar pedido por WhatsApp</button>
            {!data.store.whatsapp && <p className="text-[11px] text-[#92400e] text-center mt-2">La tienda no configuró su número: WhatsApp te dejará elegir el contacto.</p>}
            <p className="text-[11px] text-[#756c7e] text-center mt-2">Los precios y la disponibilidad los confirma la tienda.</p>
          </div>
        </div>
      )}
    </div>
  );
}
