import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Clock, MapPin, MessageCircle, Minus, Plus, Search, Send, ShoppingCart, Truck, X } from 'lucide-react';
import { fetchPublicImages, fetchPublicShop, magPageUrl as pageUrl, sendOrderToStore, type PublicShopData } from './lib/publicShop';
import { fallback } from './lib/constants';
import { formatUSD } from './lib/format';
import { waLink } from './lib/whatsapp';
import Brand from './components/Brand';

type Item = PublicShopData['products'][number];
type Mag = NonNullable<PublicShopData['magazines']>[number];
/** Producto pedido desde una revista (precio lo confirma la tienda) */
interface MagLine { key: string; mag: string; brand: string; page: number; code: string; name: string; qty: number; note: string; eta: number | null }
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
  const [phone, setPhone] = useState(() => localStorage.getItem('mc7_shop_phone') || '');
  const [tab, setTab] = useState<'productos' | 'revistas'>('productos');
  const [mag, setMag] = useState<Mag | null>(null);
  const [page, setPage] = useState(0);
  const [asking, setAsking] = useState(false);
  const [mCode, setMCode] = useState(''); const [mName, setMName] = useState(''); const [mQty, setMQty] = useState(1); const [mNote, setMNote] = useState('');
  const magKey = `mc7_shop_mag_${slug}`;
  const [magLines, setMagLines] = useState<MagLine[]>(() => { try { return JSON.parse(localStorage.getItem(magKey) || '[]'); } catch { return []; } });
  const [sent, setSent] = useState('');
  const [sending, setSending] = useState(false);
  const loadedImgs = useRef(new Set<string>());
  useEffect(() => { try { localStorage.setItem(magKey, JSON.stringify(magLines)); } catch { /* sin espacio */ } }, [magLines, magKey]);

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
  const count = lines.reduce((a, l) => a + l.qty, 0) + magLines.reduce((a, l) => a + l.qty, 0);
  const info = data?.store.info || {};
  const etaOf = (d: number | string | null | undefined) => (d ? `${d} ${Number(d) === 1 ? 'día' : 'días'}` : '');
  const magEta = magLines.length ? etaOf(Math.max(...magLines.map(l => Number(l.eta || info.eta_days || 0))) || null) : '';
  const addMagLine = () => {
    if (!mag || (!mCode.trim() && !mName.trim())) { alert('Escribe el código o el nombre del producto'); return; }
    setMagLines(p => [...p, { key: String(Date.now()), mag: mag.title, brand: mag.brand, page: page + 1, code: mCode.trim(), name: mName.trim() || `Código ${mCode.trim()}`, qty: Math.max(1, mQty), note: mNote.trim(), eta: mag.eta_days }]);
    setMCode(''); setMName(''); setMQty(1); setMNote(''); setAsking(false);
  };
  const setQty = (p: Item, qty: number) => setCart(c => { const n = { ...c }; if (qty <= 0) delete n[p.id]; else n[p.id] = Math.min(qty, p.stock); return n; });

  const orderLines = () => [
    ...lines.map(l => `• ${l.qty} x ${l.p.name}${content(l.p) ? ` (${content(l.p)})` : ''} — ${formatUSD(l.p.price * l.qty)}`),
    ...(magLines.length ? ['', '*De la revista* (precio a confirmar):', ...magLines.map(l => `• ${l.qty} x ${l.name}${l.code ? ` · cód. ${l.code}` : ''} · ${l.brand} ${l.mag} pág. ${l.page}${l.note ? ` · ${l.note}` : ''}`)] : []),
  ];
  const checkName = () => {
    if (!name.trim()) { alert('Escribe tu nombre para enviar el pedido'); return false; }
    localStorage.setItem('mc7_shop_name', name.trim());
    if (phone.trim()) localStorage.setItem('mc7_shop_phone', phone.trim());
    return true;
  };
  const order = () => {
    if (!checkName()) return;
    const text = [`🛍️ *Nuevo pedido de ${name.trim()}*`, ...(phone.trim() ? [`📞 ${phone.trim()}`] : []), '',
      ...orderLines(),
      ...(lines.length ? ['', `*Total: ${formatUSD(total)}*${magLines.length ? ' + productos de revista' : ''}`] : []),
      ...(magEta ? [`⏱️ Los productos de revista llegan en aprox. ${magEta}`] : []),
      ...(note.trim() ? ['', `Nota: ${note.trim()}`] : []), '', 'Enviado desde el catálogo en línea'].join('\n');
    window.open(waLink(data?.store.whatsapp || '', text), '_blank', 'noopener');
  };
  /** Sin WhatsApp: el pedido llega directo a la app de la tienda */
  const orderToApp = async () => {
    if (!checkName()) return;
    if (!phone.trim() && !confirm('Sin teléfono la tienda no podrá avisarte cuando llegue tu pedido. ¿Enviar igual?')) return;
    setSending(true);
    try {
      const items = [
        ...lines.map(l => ({ name: l.p.name + (content(l.p) ? ` (${content(l.p)})` : ''), qty: l.qty, price: l.p.price })),
        ...magLines.map(l => ({ name: l.name, qty: l.qty, code: l.code, page: l.page, magazine: `${l.brand} ${l.mag}`, note: l.note })),
      ];
      await sendOrderToStore(slug, name.trim(), phone.trim(), orderLines().join('\n'), { items, total: lines.length ? total : undefined, note: note.trim(), source: magLines.length ? 'revista' : 'catalogo', eta: magEta });
      setCart({}); setMagLines([]); setNote('');
      setSent(magEta ? `¡Pedido enviado! La tienda lo recibió. Los productos de revista llegan en aprox. ${magEta}.` : '¡Pedido enviado! La tienda lo recibió y te contactará.');
    } catch (e) { alert((e as Error).message); }
    setSending(false);
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
          {(info.address || info.hours || info.delivery || info.about) && (
            <div id="shop-public-info" className="mt-3 text-[12px] space-y-0.5 opacity-95">
              {info.about && <p className="italic">{info.about}</p>}
              {info.address && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {info.address}</p>}
              {info.hours && <p className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 flex-shrink-0" /> {info.hours}</p>}
              {info.delivery && <p className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 flex-shrink-0" /> {info.delivery}</p>}
            </div>
          )}
          {(data.magazines || []).length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTab('productos')} className={`py-2 rounded-full text-sm font-bold ${tab === 'productos' ? 'bg-white text-[#5a2d8c]' : 'bg-white/15 text-white'}`}>Productos en stock</button>
              <button type="button" id="tab-revistas" onClick={() => setTab('revistas')} className={`py-2 rounded-full text-sm font-bold flex items-center justify-center gap-1.5 ${tab === 'revistas' ? 'bg-white text-[#5a2d8c]' : 'bg-white/15 text-white'}`}><BookOpen className="w-4 h-4" /> Revistas</button>
            </div>
          )}
          {tab === 'productos' && <label className="mt-4 bg-white/95 text-[#201728] rounded-full h-11 flex items-center gap-2 px-4">
            <Search className="w-4 h-4 text-[#7c7384]" />
            <input value={q} onChange={e => setQ(e.target.value)} className="bg-transparent outline-none flex-1 text-sm" placeholder="Buscar productos..." />
          </label>}
        </div>
      </header>
      {tab === 'revistas' && (
        <main id="magazines-public" className="max-w-5xl mx-auto px-4 pt-4">
          <p className="text-sm text-[#756c7e] mb-3">Hojea la revista y toca <b>“Pedir de esta página”</b>. Nosotros hacemos el pedido a la empresa y te avisamos cuando llegue{info.eta_days ? ` (aprox. ${etaOf(info.eta_days)})` : ''}.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(data.magazines || []).map(m => (
              <button key={m.id} type="button" onClick={() => { setMag(m); setPage(0); }} className="mag-cover text-left bg-white rounded-2xl overflow-hidden shadow-sm border border-[#ede7f0]">
                <img src={pageUrl(m.pages[0])} alt="" className="w-full aspect-[3/4] object-cover bg-[#f6f1f8]" loading="lazy" />
                <div className="p-2.5"><p className="font-bold text-sm">{m.brand}</p><p className="text-[11px] text-[#756c7e]">{m.title} · {m.pages.length} pág.</p>
                  {(m.eta_days || info.eta_days) && <p className="text-[11px] text-[#23805d] font-bold mt-0.5">Llega en {etaOf(m.eta_days || info.eta_days)}</p>}</div>
              </button>
            ))}
          </div>
        </main>
      )}
      {mag && (
        <div id="mag-viewer" className="fixed inset-0 z-40 bg-black flex flex-col">
          <div className="flex items-center gap-2 p-3 text-white">
            <button type="button" onClick={() => setMag(null)} className="w-10 h-10 rounded-full bg-white/15 grid place-items-center" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            <p className="flex-1 font-bold text-sm truncate">{mag.brand} · {mag.title}</p>
            <span className="text-sm">{page + 1} / {mag.pages.length}</span>
          </div>
          <div className="flex-1 min-h-0 relative flex items-center justify-center">
            <img src={pageUrl(mag.pages[page])} alt={`Página ${page + 1}`} className="max-w-full max-h-full object-contain" />
            {page > 0 && <button type="button" onClick={() => setPage(p => p - 1)} className="absolute left-2 w-11 h-11 rounded-full bg-white/80 grid place-items-center" aria-label="Página anterior"><ChevronLeft className="w-6 h-6" /></button>}
            {page < mag.pages.length - 1 && <button type="button" onClick={() => setPage(p => p + 1)} className="absolute right-2 w-11 h-11 rounded-full bg-white/80 grid place-items-center" aria-label="Página siguiente"><ChevronRight className="w-6 h-6" /></button>}
          </div>
          <div className="p-3 grid grid-cols-2 gap-2">
            <button type="button" id="mag-ask" onClick={() => setAsking(true)} className="py-3 rounded-xl bg-[#7c43ba] text-white font-bold text-sm">Pedir de esta página</button>
            <button type="button" onClick={() => { setMag(null); if (count) setOpen(true); }} className="py-3 rounded-xl bg-white text-[#201728] font-bold text-sm">Ver mi pedido ({count})</button>
          </div>
          {asking && (
            <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl p-5 z-10">
              <div className="flex justify-between items-center mb-2"><p className="font-bold">Página {page + 1} · {mag.brand}</p><button type="button" onClick={() => setAsking(false)} className="w-9 h-9 rounded-full bg-[#f1ecf4] grid place-items-center"><X className="w-4 h-4" /></button></div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input id="mag-code" value={mCode} onChange={e => setMCode(e.target.value)} inputMode="numeric" className="col-span-1 input-field rounded-xl p-3 text-sm" placeholder="Código" />
                <input id="mag-name" value={mName} onChange={e => setMName(e.target.value)} className="col-span-2 input-field rounded-xl p-3 text-sm" placeholder="Producto (ej. Labial rojo)" />
              </div>
              <div className="flex gap-2 mb-3">
                <div className="flex items-center border border-[#e8dfec] rounded-xl overflow-hidden"><button type="button" onClick={() => setMQty(q => Math.max(1, q - 1))} className="px-3 py-3 bg-[#f6f1f8]"><Minus className="w-4 h-4" /></button><span className="px-3 font-bold">{mQty}</span><button type="button" onClick={() => setMQty(q => q + 1)} className="px-3 py-3 bg-[#f6f1f8]"><Plus className="w-4 h-4" /></button></div>
                <input value={mNote} onChange={e => setMNote(e.target.value)} className="flex-1 min-w-0 input-field rounded-xl p-3 text-sm" placeholder="Tono, color, talla…" />
              </div>
              <button type="button" id="mag-add" onClick={addMagLine} className="w-full py-3 rounded-xl btn-primary font-bold">Agregar al pedido</button>
            </div>
          )}
        </div>
      )}
      {sent && (
        <div className="fixed inset-0 z-50 bg-[#1e1427]/60 grid place-items-center p-4" onClick={() => setSent('')}>
          <div id="order-sent" className="bg-white rounded-3xl p-6 text-center max-w-sm"><p className="text-5xl mb-2">✅</p><p className="font-bold">{sent}</p><button type="button" className="mt-4 px-5 py-2.5 rounded-xl btn-primary font-bold">Listo</button></div>
        </div>
      )}
      {tab === 'productos' && <main className="max-w-5xl mx-auto px-4 pt-4">
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
      </main>}

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
            {magLines.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-[#7c43ba] mb-1">De la revista (precio a confirmar)</p>
                {magLines.map(l => (
                  <div key={l.key} className="flex items-center gap-2 text-sm py-1">
                    <div className="flex-1 min-w-0"><p className="font-bold truncate">{l.qty} × {l.name}</p><p className="text-[11px] text-[#756c7e]">{l.code ? `Cód. ${l.code} · ` : ''}{l.brand} pág. {l.page}{l.note ? ` · ${l.note}` : ''}</p></div>
                    <button type="button" onClick={() => setMagLines(p => p.filter(x => x.key !== l.key))} className="w-8 h-8 rounded-full bg-[#f1ecf4] grid place-items-center" aria-label="Quitar"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {magEta && <p className="text-[11px] text-[#23805d] font-bold mt-1">⏱️ Llegan en aprox. {magEta}</p>}
              </div>
            )}
            {lines.length > 0 && <div className="flex justify-between font-bold text-lg border-t border-[#ede7f0] pt-3 mb-3"><span>Total</span><span className="text-[#7c43ba]">{formatUSD(total)}</span></div>}
            <input value={name} onChange={e => setName(e.target.value)} className="w-full input-field rounded-xl p-3 mb-2" placeholder="Tu nombre *" />
            <input id="shop-phone" value={phone} onChange={e => setPhone(e.target.value)} type="text" inputMode="tel" className="w-full input-field rounded-xl p-3 mb-2" placeholder="Tu celular (para avisarte)" />
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full input-field rounded-xl p-3 mb-3 text-sm" placeholder="Nota (dirección, hora de entrega...)" />
            <button type="button" onClick={order} className="w-full py-3.5 rounded-xl bg-[#25D366] text-white font-bold flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> Enviar pedido por WhatsApp</button>
            <button type="button" id="order-to-app" disabled={sending} onClick={orderToApp} className="mt-2 w-full py-3 rounded-xl btn-ghost font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" /> {sending ? 'Enviando…' : 'No tengo WhatsApp: enviar a la tienda'}</button>
            {!data.store.whatsapp && <p className="text-[11px] text-[#92400e] text-center mt-2">La tienda no configuró su número: WhatsApp te dejará elegir el contacto.</p>}
            <p className="text-[11px] text-[#756c7e] text-center mt-2">Los precios y la disponibilidad los confirma la tienda.</p>
          </div>
        </div>
      )}
    </div>
  );
}
