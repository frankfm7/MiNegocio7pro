import { useEffect, useMemo, useState } from 'react';
import {
  Camera, ChevronLeft, DollarSign, Eye, EyeOff, MoreVertical, Package, PackagePlus, Pencil, QrCode, ScanLine, Search,
  Plus, Share2, ShoppingBag, ShoppingCart, Target, Trash, TrendingUp, Trophy, User, X, XCircle,
} from 'lucide-react';
import { openModal, setState, useStore } from '../store';
import {
  clearCatalogProducts, deleteCatalogWithConfirm, goBack, openBarcodeScanner, openCatalogForm, openForm, shareCatalogByLink, toggleClientMode,
} from '../actions';
import { catalogProducts, getTodaySales, searchProducts } from '../lib/selectors';
import { formatUSDShort } from '../lib/format';
import { exportCatalogQRsPDF } from '../lib/qr';
import ProductCard from '../components/ProductCard';
import { CartBadge } from './CatalogsScreen';

export default function ProductsScreen() {
  const catalogs = useStore(s => s.catalogs);
  const records = useStore(s => s.records);
  const sales = useStore(s => s.sales);
  const currentCatalogId = useStore(s => s.currentCatalogId);
  const query = useStore(s => s.query);
  const clientMode = useStore(s => s.clientMode);
  const user = useStore(s => s.currentUser);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.catalog-inside-menu')) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const cat = catalogs.find(c => c.id === currentCatalogId);
  const items = useMemo(() => catalogProducts(records, currentCatalogId), [records, currentCatalogId]);
  const filtered = useMemo(() => searchProducts(items, query), [items, query]);

  const stats = useMemo(() => {
    const available = items.filter(x => !x.sold && Number(x.stock) > 0);
    const inCatalog = (productId: string) => {
      if (!currentCatalogId) return true;
      const prod = records.find(r => r.id === productId);
      return !!prod && prod.catalog_id === currentCatalogId;
    };
    const catalogSales = sales.filter(s => inCatalog(s.product_id));
    const todaySales = getTodaySales(catalogSales);
    return {
      stock: available.reduce((a, x) => a + Number(x.stock || 0), 0),
      sold: catalogSales.reduce((sum, s) => sum + (s.quantity || 1), 0),
      todayCount: todaySales.length,
      todayRevenue: todaySales.reduce((a, s) => a + Number(s.actual_price || 0), 0),
      potential: available.reduce((a, x) => a + (Number(x.sale_price || 0) - Number(x.cost_price || 0)) * Number(x.stock || 0), 0),
      realized: catalogSales.reduce((a, s) => a + Number(s.profit || 0), 0),
    };
  }, [items, sales, records, currentCatalogId]);

  if (!cat && currentCatalogId !== null) return null;

  const action = (fn: (id: string) => void) => () => { setMenuOpen(false); if (currentCatalogId) fn(currentCatalogId); };
  const isVendedor = user?.role === 'vendedor';

  return (
    <section id="products-screen" className="screen active">
      <header className="topbar">
        <div className="page-inner py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button id="back-catalogs" type="button" className="back-btn" aria-label="Volver" onClick={goBack}><ChevronLeft className="w-5 h-5" /></button>
            <label className="search rounded-full flex-1 h-10 flex items-center gap-2 px-3 min-w-0">
              <Search className="w-4 h-4 text-[#7c7384] flex-shrink-0" />
              <input id="search-input" type="search" value={query} onChange={e => setState({ query: e.target.value })} className="bg-transparent outline-none min-w-0 flex-1 text-sm" placeholder="Buscar en este catálogo..." />
              {query.trim() && (
                <button type="button" onClick={() => setState({ query: '' })} className="w-7 h-7 grid place-items-center rounded-full hover:bg-[#e8dfec] transition flex-shrink-0" title="Limpiar búsqueda">
                  <X className="w-4 h-4 text-[#756c7e]" />
                </button>
              )}
              <button type="button" onClick={() => openModal('image-search-modal')} className="w-7 h-7 grid place-items-center rounded-full hover:bg-[#e8dfec] transition flex-shrink-0" title="Buscar por imagen"><Camera className="w-4 h-4 text-[#7c43ba]" /></button>
              <button type="button" onClick={() => openBarcodeScanner()} className="w-7 h-7 grid place-items-center rounded-full hover:bg-[#e8dfec] transition flex-shrink-0" title="Escanear código de barras"><ScanLine className="w-4 h-4 text-[#7c43ba]" /></button>
            </label>
            {!isVendedor && (
              <button id="client-mode-btn" type="button" onClick={toggleClientMode} className="w-10 h-10 rounded-full grid place-items-center hover:bg-violet-50 flex-shrink-0 text-[#7c43ba]" title={clientMode ? 'Salir del modo cliente' : 'Modo cliente'}>
                {clientMode ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            )}
            <button id="cart-button" type="button" onClick={() => openModal('cart-modal')} className="relative w-10 h-10 grid place-items-center rounded-full hover:bg-violet-50 flex-shrink-0" aria-label="Pedido">
              <ShoppingCart className="w-[18px] h-[18px]" />
              <CartBadge id="cart-badge-b" />
            </button>
          </div>
        </div>
      </header>
      <div className="page-inner pt-6 sm:pt-7">
        <section className="flex items-end justify-between gap-3 mb-5 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p id="active-catalog-label" className="text-[11px] uppercase tracking-[.15em] font-bold text-[#7b43ab]">{cat ? cat.label || 'CATÁLOGO' : 'INVENTARIO COMPLETO'}</p>
              <span className="client-mode-badge"><User className="w-3 h-3" /> Modo cliente</span>
            </div>
            <h1 id="active-catalog-title" className="hero-title font-bold text-2xl sm:text-3xl mt-1 break-words">{cat ? cat.name : 'Todos los productos'}</h1>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button type="button" onClick={() => openForm()} className="admin-only rounded-full btn-primary px-3 py-1.5 text-xs font-bold whitespace-nowrap flex items-center gap-1" aria-label="Añadir producto"><Plus className="w-3.5 h-3.5" /> Añadir</button>
            <span id="product-count" className="rounded-full bg-[#eee6f6] text-[#70429c] px-3 py-1.5 text-xs font-bold whitespace-nowrap">{items.length} {items.length === 1 ? 'producto' : 'productos'}</span>
            {cat && (
              <div className="catalog-inside-menu relative">
                <button id="catalog-inside-menu-btn" type="button" onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }} className="w-9 h-9 rounded-full grid place-items-center hover:bg-violet-50 text-[#7c43ba] shadow-sm bg-white" title="Opciones del catálogo">
                  <MoreVertical className="w-4 h-4" />
                </button>
                <div id="catalog-inside-dropdown" className={`catalog-inside-dropdown ${menuOpen ? 'open' : ''}`}>
                  <button className="dropdown-item" onClick={action(id => exportCatalogQRsPDF(id))}><QrCode className="w-4 h-4" /> Imprimir todos los QR (PDF)</button>
                  <button className="dropdown-item" onClick={action(shareCatalogByLink)}><Share2 className="w-4 h-4" /> Compartir catálogo</button>
                  <button className="dropdown-item admin-only" onClick={action(id => openCatalogForm(id))}><Pencil className="w-4 h-4" /> Editar catálogo</button>
                  <button className="dropdown-item admin-only" onClick={action(clearCatalogProducts)}><Trash className="w-4 h-4" /> <span>Borrar {items.length} productos</span></button>
                  <button className="dropdown-item danger admin-only" onClick={action(deleteCatalogWithConfirm)}><XCircle className="w-4 h-4" /> Eliminar catálogo</button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
          <article className="stat-card rounded-2xl p-3 sm:p-4"><Package className="w-4 h-4 text-[#7543a8] mb-2" /><p id="stock-total" className="font-bold text-base sm:text-lg">{stats.stock}</p><p className="text-[10px] sm:text-[11px] text-[#756c7e]">En stock</p></article>
          <article className="stat-card rounded-2xl p-3 sm:p-4"><ShoppingBag className="w-4 h-4 text-[#be416d] mb-2" /><p id="sold-total" className="font-bold text-base sm:text-lg">{stats.sold}</p><p className="text-[10px] sm:text-[11px] text-[#756c7e]">Vendidos</p></article>
          <article className="stat-card rounded-2xl p-3 sm:p-4 sensitive-data border-l-4 border-l-[#23805d]"><TrendingUp className="w-4 h-4 text-[#23805d] mb-2" /><p id="today-sales" className="font-bold text-base sm:text-lg text-[#23805d]">{stats.todayCount}</p><p className="text-[10px] sm:text-[11px] text-[#756c7e]">Ventas hoy</p></article>
          <article className="stat-card rounded-2xl p-3 sm:p-4 sensitive-data border-l-4 border-l-[#7c43ba]"><DollarSign className="w-4 h-4 text-[#7c43ba] mb-2" /><p id="today-revenue" className="font-bold text-base sm:text-lg text-[#7c43ba]">{formatUSDShort(stats.todayRevenue)}</p><p className="text-[10px] sm:text-[11px] text-[#756c7e]">Ingresos hoy</p></article>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:gap-3 mb-6 sensitive-data">
          <article className="stat-card rounded-2xl p-3 sm:p-4"><Target className="w-4 h-4 text-[#23805d] mb-2" /><p id="profit-total" className="font-bold text-base sm:text-lg text-[#23805d]">{formatUSDShort(stats.potential)}</p><p className="text-[10px] sm:text-[11px] text-[#756c7e]">Ganancia potencial</p></article>
          <article className="stat-card rounded-2xl p-3 sm:p-4"><Trophy className="w-4 h-4 text-[#d97706] mb-2" /><p id="realized-profit" className="font-bold text-base sm:text-lg text-[#d97706]">{formatUSDShort(stats.realized)}</p><p className="text-[10px] sm:text-[11px] text-[#756c7e]">Ganancia obtenida</p></article>
        </section>

        <div id="product-list" className="product-grid">
          {filtered.map(r => <ProductCard key={r.id} r={r} />)}
        </div>
        {items.length === 0 && (
          <div id="empty-products" className="text-center rounded-3xl bg-white border border-dashed border-[#dacde2] px-6 py-12">
            <PackagePlus className="w-8 h-8 mx-auto text-[#7c43ba] mb-3" />
            <h3 className="font-bold">Sin productos aún</h3>
            <p className="mt-2 text-sm text-[#756c7e]">{user.role === 'admin' || user.role === 'coadmin' ? 'Usa “Datos → Añadir producto” o importa un archivo' : 'Este catálogo todavía no tiene productos'}</p>
          </div>
        )}
        {items.length > 0 && filtered.length === 0 && (
          <div id="no-results" className="text-center rounded-3xl bg-white px-6 py-10 text-[#756c7e]">No encontramos productos con esa búsqueda.</div>
        )}
      </div>
    </section>
  );
}
