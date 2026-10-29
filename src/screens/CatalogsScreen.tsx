import { ArrowRight, Camera, Cloud, FileUp, Menu, Plus, ScanLine, Search, ShoppingCart, Sparkles, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { getState, openAccount, openModal, setState, toast, useStore } from '../store';
import { openAdminModal, openBarcodeScanner, openCatalog, openCatalogForm } from '../actions';
import { InstallBanner } from '../components/InstallPrompt';
import { DB } from '../lib/db';
import { coverFor, fallbackCover } from '../lib/constants';
import { searchProducts } from '../lib/selectors';
import { captureFromCamera } from '../lib/camera';
import ProductCard from '../components/ProductCard';
import AccountButton from '../components/AccountButton';
import type { Catalog } from '../types';
import { searchByImage } from '../lib/imageSearch';

export function TopbarMenuButton() {
  return (
    <button className="open-sidebar-btn menu-btn" aria-label="Abrir menú" onClick={() => setState({ sidebarOpen: true })}>
      <Menu className="w-5 h-5" />
    </button>
  );
}

export function CartBadge({ id }: { id: string }) {
  const qty = useStore(s => s.cart.reduce((a, x) => a + x.qty, 0));
  if (!qty) return null;
  return <span id={id} className="absolute -top-1 -right-1 bg-[#c54571] text-white text-[10px] rounded-full w-5 h-5 grid place-items-center font-bold">{qty}</span>;
}

function CatalogTile({ cat, count }: { cat: Catalog; count: number }) {
  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!getState().isAdmin()) { toast('Solo los administradores pueden marcar favoritos'); return; }
    await DB.updateCatalog(cat.id, { favorite: !cat.favorite });
    toast(!cat.favorite ? '⭐ Añadido a favoritos' : 'Quitado de favoritos');
  };
  return (
    <article className={`catalog-tile ${cat.favorite ? 'favorite' : ''}`} onClick={e => { if ((e.target as HTMLElement).closest('button')) return; openCatalog(cat.id); }}>
      <img src={cat.cover && cat.cover !== fallbackCover ? cat.cover : coverFor(cat.color, cat.name)} loading="lazy" alt={cat.name} onError={e => { e.currentTarget.src = coverFor(cat.color, cat.name); }} />
      <div className="p-5">
        <div className="flex justify-between gap-3 items-start">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[.13em] font-bold text-[#756c7e]">{cat.label || 'CATÁLOGO'}</p>
            <h2 className="font-bold text-xl mt-1 break-words">{cat.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button className="favorite-btn w-8 h-8 rounded-full grid place-items-center hover:bg-gray-100 transition admin-only" title={cat.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'} onClick={toggleFavorite}>
              <Star className={`w-4 h-4 ${cat.favorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
            </button>
            <span className="rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm" style={{ background: cat.color }}>{count}</span>
          </div>
        </div>
        <button className="open-catalog mt-5 text-sm font-bold inline-flex items-center gap-1" style={{ color: cat.color }} type="button" onClick={e => { e.stopPropagation(); openCatalog(cat.id); }}>
          Ver catálogo <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}

/** Primera vez: explicar cómo empezar */
function EmptyStart({ cloud, isAdmin }: { cloud: boolean; isAdmin: boolean }) {
  const opt = (icon: React.ReactNode, title: string, text: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="option-card !items-start !text-left !p-4 !gap-2">
      {icon}<p className="font-bold text-sm">{title}</p><p className="text-xs text-[#756c7e]">{text}</p>
    </button>
  );
  return (
    <div className="mb-6 p-5 sm:p-6 rounded-3xl bg-white border border-[#ede7f0] shadow-sm">
      <h2 className="hero-title text-xl font-bold">{cloud ? 'Esta tienda aún no tiene catálogos' : '¡Bienvenido! Empieza tu catálogo'}</h2>
      <p className="text-sm text-[#756c7e] mt-1">
        {cloud ? (isAdmin ? 'Crea el primer catálogo o importa tus productos.' : 'El dueño de la tienda todavía no agregó productos.')
          : 'Tus catálogos se guardan en este dispositivo. Nadie más los ve.'}
      </p>
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {opt(<Plus className="w-6 h-6" />, 'Crear catálogo', 'Empieza desde cero', () => openCatalogForm())}
          {opt(<FileUp className="w-6 h-6" />, 'Importar', 'Excel, PDF, CSV, JSON o fotos', () => openAdminModal('import-export-modal'))}
          {!cloud && opt(<Sparkles className="w-6 h-6" />, 'Ver un ejemplo', 'Carga productos de muestra', () => DB.loadSampleData())}
          {!cloud && opt(<Cloud className="w-6 h-6" />, 'Soy vendedor', 'Conéctate a la tienda con tu código', () => openAccount())}
        </div>
      )}
    </div>
  );
}

export default function CatalogsScreen() {
  const catalogs = useStore(s => s.catalogs);
  const records = useStore(s => s.records);
  const globalQuery = useStore(s => s.globalQuery);
  const isAdmin = useStore(s => s.isAdmin());
  const dataReady = useStore(s => s.dataReady);
  const mode = useStore(s => s.mode);
  const resultsRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...catalogs].sort((a, b) => (a.favorite === b.favorite ? 0 : a.favorite ? -1 : 1)), [catalogs]);
  const searching = !!globalQuery.trim();
  const results = useMemo(() => (searching ? searchProducts(records, globalQuery) : []), [records, globalQuery, searching]);

  useEffect(() => {
    if (searching) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searching]);

  const clear = () => setState({ globalQuery: '' });

  const cameraSearch = async () => {
    const file = await captureFromCamera({ filename: 'buscar.jpg', title: 'Buscar producto por foto', hint: 'Enfoca el producto dentro del marco (con la etiqueta visible si es posible)', actionLabel: 'Buscar' });
    if (!file) return;
    openModal('image-search-modal');
    setTimeout(() => searchByImage(file), 300);
  };

  return (
    <section id="catalog-screen" className="screen active">
      <header className="topbar">
        <div className="page-inner py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <TopbarMenuButton />
            <div className="min-w-0">
              <p className="uppercase tracking-[.16em] font-bold text-[11px] text-[#756c7e]">Explora</p>
              <h1 className="hero-title mt-0.5 text-xl sm:text-2xl truncate">Mis Catálogos</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button id="open-cart-from-catalogs" type="button" onClick={() => openModal('cart-modal')} className="relative w-11 h-11 grid place-items-center rounded-full bg-[#f0e8f7] text-[#7442a4] hover:bg-[#e0d4f0] transition flex-shrink-0 shadow-sm" aria-label="Abrir pedido">
              <ShoppingCart className="w-5 h-5" />
              <CartBadge id="cart-badge-a" />
            </button>
            <AccountButton />
          </div>
        </div>
        <div className="page-inner pb-4">
          <label className="search rounded-full h-11 flex items-center gap-2 px-4">
            <Search className="w-4 h-4 text-[#7c7384] flex-shrink-0" />
            <input id="global-search-input" type="text" value={globalQuery} onChange={e => setState({ globalQuery: e.target.value })} className="bg-transparent outline-none min-w-0 flex-1 text-sm" placeholder="Buscar en todos los catálogos..." />
            {searching && (
              <button type="button" onClick={clear} className="w-8 h-8 grid place-items-center rounded-full hover:bg-[#e8dfec] transition flex-shrink-0" title="Limpiar búsqueda">
                <X className="w-4 h-4 text-[#756c7e]" />
              </button>
            )}
            <button type="button" onClick={() => openBarcodeScanner()} className="w-8 h-8 grid place-items-center rounded-full hover:bg-[#e8dfec] transition flex-shrink-0" title="Escanear código de barras">
              <ScanLine className="w-4 h-4 text-[#7c43ba]" />
            </button>
            <button type="button" onClick={cameraSearch} className="w-8 h-8 grid place-items-center rounded-full hover:bg-[#e8dfec] transition flex-shrink-0" title="Buscar por imagen">
              <Camera className="w-4 h-4 text-[#7c43ba]" />
            </button>
          </label>
        </div>
      </header>
      <div className="page-inner pt-4 sm:pt-6">
        <InstallBanner />
        {dataReady && catalogs.length === 0 && !searching && <EmptyStart cloud={mode === 'cloud'} isAdmin={isAdmin} />}
        <div id="catalog-grid" className={`catalog-grid ${searching ? 'searching-active' : ''}`}>
          {sorted.map(cat => <CatalogTile key={cat.id} cat={cat} count={records.filter(p => p.catalog_id === cat.id).length} />)}
          {isAdmin && (
            <article className="catalog-tile add-new" onClick={() => openModal('create-catalog-modal')}>
              <div className="text-center p-5">
                <div className="w-14 h-14 mx-auto rounded-full bg-white shadow-md grid place-items-center mb-3"><Plus className="w-6 h-6 text-[#7c43ba]" /></div>
                <p className="font-bold text-[#7c43ba]">Añadir catálogo</p>
                <p className="text-xs text-[#756c7e] mt-1">Crea una nueva categoría</p>
              </div>
            </article>
          )}
        </div>
        <div ref={resultsRef} id="global-search-results" className={`global-search-results ${searching ? 'active' : ''}`}>
          <div className="flex items-center justify-between mb-3 mt-6">
            <h2 className="font-bold text-lg hero-title">Resultados de búsqueda</h2>
            <button type="button" onClick={clear} className="text-sm font-bold text-[#7c43ba] hover:underline">Limpiar</button>
          </div>
          <div id="global-product-list" className="product-grid">
            {results.map(r => <ProductCard key={r.id} r={r} />)}
          </div>
          {searching && results.length === 0 && (
            <div id="global-no-results" className="text-center rounded-3xl bg-white px-6 py-10 text-[#756c7e] mt-4">No encontramos productos con esa búsqueda.</div>
          )}
        </div>
      </div>
    </section>
  );
}
