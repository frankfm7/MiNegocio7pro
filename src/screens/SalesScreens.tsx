import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, BellOff, Check, CheckCircle, Copy, CreditCard, Share2, Trash2, X, DollarSign, FileDown, FileSpreadsheet, FileText, QrCode, Receipt, Table, Target, TrendingUp, Wallet,
} from 'lucide-react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { setState, toast, useStore } from '../store';
import { copySales, deleteSalesWithConfirm, generateDailyCloseImage, navigate, openDetail, salesReceipt, shareSales } from '../actions';
import { currency, cardImage, formatContent, formatUSD, formatUSDShort } from '../lib/format';
import { fallback } from '../lib/constants';
import { getLowStockProducts, getOutOfStockProducts, getTodaySales, lowStockLimit, sellerOf, sortByDateDesc } from '../lib/selectors';
import Avatar from '../components/Avatar';
import { exportOutOfStock, exportSalesCSV, exportSalesXLSX, issueReportNumber, shareSalesReport } from '../lib/exporters';
import { TopbarMenuButton } from './CatalogsScreen';
import { hideStockAlerts, showStockAlertsAgain, useStockAlerts } from '../lib/stockAlerts';
import type { Product, Sale } from '../types';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

function Header({ kicker, kickerColor, title }: { kicker: string; kickerColor: string; title: string }) {
  return (
    <header className="topbar">
      <div className="page-inner py-4 flex items-center gap-3">
        <TopbarMenuButton />
        <div><p className={`uppercase tracking-[.16em] font-bold text-[11px] ${kickerColor}`}>{kicker}</p><h1 className="hero-title mt-0.5 text-xl sm:text-2xl">{title}</h1></div>
      </div>
    </header>
  );
}

function Empty({ id, icon, title, text }: { id: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <div id={id} className="text-center rounded-3xl bg-white border border-dashed border-[#dacde2] px-6 py-12">
      {icon}<h3 className="font-bold">{title}</h3><p className="mt-2 text-sm text-[#756c7e]">{text}</p>
    </div>
  );
}

const sumBy = (list: Sale[], key: 'actual_price' | 'profit') => list.reduce((a, s) => a + Number(s[key] || 0), 0);

// ==========================================
// LISTA DE VENTAS CON SELECCIÓN MÚLTIPLE
// ==========================================
function SalesList({ id, title, list, showDate }: { id: string; title: string; list: Sale[]; showDate: boolean }) {
  const team = useStore(s => s.team);
  const isAdmin = useStore(s => s.isAdmin());
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  // La selección está abierta solo mientras haya al menos una venta elegida
  const mode = sel.size > 0;
  // Si una venta desaparece (se eliminó o se sincronizó), sale de la selección
  useEffect(() => { setSel(prev => { const ids = new Set(list.map(s => s.id)); const next = new Set([...prev].filter(x => ids.has(x))); return next.size === prev.size ? prev : next; }); }, [list]);
  const chosen = list.filter(s => sel.has(s.id));
  const exit = () => setSel(new Set());
  const toggle = (sid: string) => setSel(prev => { const n = new Set(prev); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });
  const all = chosen.length === list.length && list.length > 0;
  const remove = async () => { if (await deleteSalesWithConfirm(chosen)) exit(); };

  // Pulsación larga (mantener presionado ~½ segundo) sobre una venta:
  //  - sin selección: la abre con esa venta;
  //  - con selección: agrega o quita esa venta (al quitar la última se cierra).
  // Con la selección abierta, un toque normal también agrega o quita.
  const press = useRef<{ id: string; x: number; y: number; timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const cancelPress = () => { if (press.current) clearTimeout(press.current.timer); };
  const onDown = (sid: string, e: React.PointerEvent) => {
    cancelPress();
    const p = { id: sid, x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => {
      p.fired = true;
      toggle(sid);
      try { navigator.vibrate?.(35); } catch { /* sin vibración */ }
    }, 480) };
    press.current = p;
  };
  const onMovePress = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(p.timer); press.current = null; }
  };
  const onClickRow = (sid: string) => {
    const p = press.current;
    press.current = null;
    if (p?.fired) return;          // ya se hizo con la pulsación larga
    cancelPress();
    if (mode) toggle(sid);         // con la selección abierta, un toque agrega o quita
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="font-bold text-lg hero-title mr-auto">{title}</h2>
        {mode && (
          <>
            <button type="button" onClick={() => (all ? exit() : setSel(new Set(list.map(s => s.id))))} className="px-3 py-1.5 rounded-full btn-ghost text-xs font-bold">{all ? 'Quitar todas' : 'Todas'}</button>
            <button type="button" onClick={exit} className="px-3 py-1.5 rounded-full bg-[#201728] text-white text-xs font-bold flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancelar</button>
          </>
        )}
      </div>
      {!mode && list.length > 0 && <p className="text-[11px] text-[#756c7e] -mt-2 mb-3">Mantén presionada una venta para seleccionarla (recibo, copiar, compartir o eliminar).</p>}
      <div id={id} className={`space-y-2 ${mode ? 'pb-36' : ''}`}>
        {list.map(s => {
          const on = sel.has(s.id);
          const date = new Date(s.date);
          return (
            <button type="button" key={s.id} onPointerDown={e => onDown(s.id, e)} onPointerMove={onMovePress} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
              onClick={() => onClickRow(s.id)} onContextMenu={e => e.preventDefault()} aria-pressed={on} style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
              className={`sale-row w-full text-left rounded-xl p-3 flex items-center gap-3 shadow-sm bg-white transition ${on ? 'ring-2 ring-[#7c43ba] bg-[#f6f1f8]' : ''}`}>
              {mode && <span className={`w-5 h-5 rounded-md border-2 flex-shrink-0 grid place-items-center ${on ? 'bg-[#7c43ba] border-[#7c43ba] text-white' : 'border-[#cbbdd6] bg-white'}`}>{on && <Check className="w-3.5 h-3.5" />}</span>}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-snug line-clamp-2">{s.product_name}{Number(s.quantity) > 1 && <span className="text-[11px] text-[#756c7e] font-bold"> ×{s.quantity}</span>}</p>
                {s.seller_name && <p className="text-[10px] text-[#7c43ba] font-bold flex items-center gap-1 mt-0.5 min-w-0"><Avatar size={16} name={s.seller_name} url={sellerOf(team, s).avatar} /><span className="truncate">{s.seller_name}</span></p>}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {s.payment_method && <span className={`text-[9px] px-2 py-0.5 rounded-full ${s.payment_method === 'QR' ? 'bg-[#f6f1f8] text-[#7c43ba]' : s.payment_method === 'Fiado' ? 'bg-[#fff0f3] text-[#a43658]' : 'bg-[#f0fdf4] text-[#166534]'} font-bold max-w-full truncate`}>{s.payment_method}{s.customer_name ? ` · ${s.customer_name}` : ''}</span>}
                  <span className="text-xs text-[#756c7e]">{showDate ? date.toLocaleDateString('es', { day: '2-digit', month: 'short' }) + ' ' : ''}{date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0 max-w-[45%]"><p className="font-bold text-sm text-[#7c43ba] whitespace-nowrap">{formatUSD(s.actual_price)}</p><p className="sensitive-data text-xs text-[#166534] font-bold whitespace-nowrap">+{formatUSD(s.profit)}</p></div>
            </button>
          );
        })}
      </div>
      {mode && (
        <div className="sales-actionbar fixed z-40 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-md rounded-2xl bg-white shadow-2xl border border-[#ede7f0] p-2.5">
          <p className="text-xs font-bold text-center mb-2">{chosen.length} {chosen.length === 1 ? 'venta' : 'ventas'} · <span className="text-[#7c43ba]">{formatUSD(chosen.reduce((a, x) => a + Number(x.actual_price || 0), 0))}</span> <span className="font-normal text-[#756c7e]">· toca para agregar o quitar</span></p>
          <div className={`grid ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5`}>
            <button type="button" disabled={!chosen.length} onClick={() => salesReceipt(chosen)} className="py-2 rounded-xl btn-primary text-[11px] font-bold flex flex-col items-center gap-0.5 disabled:opacity-40"><Receipt className="w-4 h-4" /> Recibo</button>
            <button type="button" disabled={!chosen.length} onClick={() => copySales(chosen)} className="py-2 rounded-xl btn-ghost text-[11px] font-bold flex flex-col items-center gap-0.5 disabled:opacity-40"><Copy className="w-4 h-4" /> Copiar</button>
            <button type="button" disabled={!chosen.length} onClick={() => shareSales(chosen)} className="py-2 rounded-xl btn-ghost text-[11px] font-bold flex flex-col items-center gap-0.5 disabled:opacity-40"><Share2 className="w-4 h-4" /> Compartir</button>
            {isAdmin && <button type="button" disabled={!chosen.length} onClick={remove} className="py-2 rounded-xl bg-[#fff0f3] text-[#a43658] text-[11px] font-bold flex flex-col items-center gap-0.5 disabled:opacity-40"><Trash2 className="w-4 h-4" /> Eliminar</button>}
          </div>
        </div>
      )}
    </>
  );
}

// ==========================================
// VENTAS DEL DÍA
// ==========================================
export function DailySalesScreen() {
  const sales = useStore(s => s.sales);
  const today = useMemo(() => sortByDateDesc(getTodaySales(sales)), [sales]);
  const cash = sumBy(today.filter(s => s.payment_method === 'Efec.'), 'actual_price');
  const qr = sumBy(today.filter(s => s.payment_method === 'QR'), 'actual_price');
  const fiado = sumBy(today.filter(s => s.payment_method === 'Fiado'), 'actual_price');

  return (
    <section id="daily-sales-screen" className="screen active">
      <Header kicker="Hoy" kickerColor="text-[#23805d]" title="Ventas del día" />
      <div className="page-inner pt-6 sm:pt-8">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <article className="stat-card rounded-2xl p-4"><Receipt className="w-4 h-4 text-[#23805d] mb-2" /><p className="font-bold text-xl">{today.length}</p><p className="text-[11px] text-[#756c7e]">Ventas hoy</p></article>
          <article className="stat-card rounded-2xl p-4"><DollarSign className="w-4 h-4 text-[#7c43ba] mb-2" /><p className="font-bold text-xl">{formatUSDShort(sumBy(today, 'actual_price'))}</p><p className="text-[11px] text-[#756c7e]">Ingresos</p></article>
          <article className="stat-card rounded-2xl p-4"><CreditCard className="w-4 h-4 text-[#3875a5] mb-2" /><p className="font-bold text-xl">{formatUSDShort(cash)}</p><p className="text-[11px] text-[#756c7e]">Efectivo</p></article>
          <article className="stat-card rounded-2xl p-4"><QrCode className="w-4 h-4 text-[#7c43ba] mb-2" /><p className="font-bold text-xl">{formatUSDShort(qr)}</p><p className="text-[11px] text-[#756c7e]">QR</p></article>
          {fiado > 0 && <article className="stat-card rounded-2xl p-4 col-span-2 sm:col-span-4 border-l-4 border-l-[#a43658]"><p className="font-bold text-xl text-[#a43658]">{formatUSDShort(fiado)}</p><p className="text-[11px] text-[#756c7e]">Fiado hoy (por cobrar)</p></article>}
        </section>
        <section className="grid grid-cols-2 gap-3 mb-6 sensitive-data">
          <article className="stat-card rounded-2xl p-4 border-l-4 border-l-[#166534]"><TrendingUp className="w-4 h-4 text-[#166534] mb-2" /><p className="font-bold text-xl text-[#166534]">{formatUSDShort(sumBy(today, 'profit'))}</p><p className="text-[11px] text-[#756c7e]">Ganancia hoy</p></article>
        </section>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => navigate('cash-close')} className="py-3 rounded-xl bg-[#23805d] text-white font-bold flex items-center justify-center gap-2"><Wallet className="w-4 h-4" /> Cierre de caja</button>
          <button onClick={() => generateDailyCloseImage()} className="py-3 rounded-xl bg-[#7c43ba] text-white font-bold flex items-center justify-center gap-2"><Table className="w-4 h-4" /> Tabla de cierre</button>
        </div>
        <SalesList id="daily-sales-list" title="Historial de hoy" list={today} showDate={false} />
        {today.length === 0 && <Empty id="no-daily-sales" icon={<Receipt className="w-8 h-8 mx-auto text-[#7c43ba] mb-3" />} title="Sin ventas hoy" text="Las ventas de hoy aparecerán aquí" />}
      </div>
    </section>
  );
}

// ==========================================
// STOCK BAJO / AGOTADOS
// ==========================================
/** Ocultar / volver a mostrar el aviso (la lista se sigue viendo completa) */
function AlertToggle({ kind }: { kind: 'out' | 'low' }) {
  const a = useStockAlerts();
  const total = kind === 'out' ? a.out : a.low;
  const fresh = kind === 'out' ? a.outNew : a.lowNew;
  if (!total) return null;
  return fresh > 0
    ? <button type="button" onClick={() => hideStockAlerts([kind])} className="hide-stock-alert mb-4 w-full py-2.5 rounded-xl btn-ghost text-xs font-bold flex items-center justify-center gap-2"><BellOff className="w-4 h-4" /> Ya lo vi · ocultar el aviso ({fresh} {fresh === 1 ? 'producto' : 'productos'})</button>
    : <p className="mb-4 text-[11px] text-[#756c7e] text-center">🔕 Aviso oculto. Te avisaremos si otro producto {kind === 'out' ? 'se agota' : 'baja de stock'}. <button type="button" onClick={() => showStockAlertsAgain([kind])} className="font-bold text-[#7c43ba] underline">Mostrar aviso otra vez</button></p>;
}

function StockRow({ r, children }: { r: Product; children: React.ReactNode }) {
  return (
    <div className="out-of-stock-card rounded-2xl p-4 flex items-center gap-3 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => openDetail(r)}>
      <img src={cardImage(r)} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" onError={e => { e.currentTarget.src = fallback; }} />
      {children}
    </div>
  );
}

function RowInfo({ r, line }: { r: Product; line: React.ReactNode }) {
  const catalogs = useStore(s => s.catalogs);
  const cat = catalogs.find(c => c.id === r.catalog_id);
  const content = formatContent(r);
  return (
    <div className="flex-1 min-w-0">
      <p className="font-bold text-sm truncate">{r.name}</p>
      <p className="text-xs text-[#756c7e] truncate">{r.brand}{content ? ` · ${content}` : ''} · {cat ? cat.name : ''}</p>
      {line}
    </div>
  );
}

export function LowStockScreen() {
  const records = useStore(s => s.records);
  const lowDefault = useStore(s => s.lowStockDefault);
  const products = useMemo(() => getLowStockProducts(records, lowDefault), [records, lowDefault]);
  const [limit, setLimit] = useState(String(lowDefault));
  const [notif, setNotif] = useState(() => localStorage.getItem('mc7_notif') === 'true' && typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const saveLimit = () => {
    const n = Math.max(0, Math.floor(Number(limit)));
    if (isNaN(n)) return;
    localStorage.setItem('mc7_low_default', String(n));
    setState({ lowStockDefault: n });
    toast(`Aviso general: ${n} unidades o menos ✓`);
  };
  const toggleNotif = async () => {
    if (typeof Notification === 'undefined') { toast('Este navegador no permite notificaciones'); return; }
    if (notif) { localStorage.setItem('mc7_notif', 'false'); setNotif(false); toast('Avisos del sistema desactivados'); return; }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') { localStorage.setItem('mc7_notif', 'true'); setNotif(true); toast('Avisos activados: te avisaremos al abrir la app 🔔'); }
    else toast('Permiso de notificaciones denegado');
  };
  return (
    <section id="low-stock-screen" className="screen active">
      <Header kicker="Atención" kickerColor="text-[#d97706]" title="Productos con stock bajo" />
      <div className="page-inner pt-6 sm:pt-8">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#fffbeb] to-[#fff] border border-[#fde68a] mb-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#d97706] flex-shrink-0 mt-0.5" />
          <div><p className="font-bold text-sm text-[#d97706]">Reposición recomendada</p><p className="text-xs text-[#756c7e] mt-1">Productos con {lowDefault} unidades o menos (o con el mínimo propio de cada producto). Considera reponer pronto.</p></div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#ede7f0] mb-5">
          <p className="font-bold text-sm mb-2">Mínimo general para avisar</p>
          <div className="flex gap-2 items-center">
            <input type="number" min={0} value={limit} onChange={e => setLimit(e.target.value)} className="w-24 input-field rounded-lg p-2 text-center font-bold" />
            <span className="text-xs text-[#756c7e] flex-1">unidades. Cada producto puede tener su propio mínimo en “Editar producto”.</span>
            <button type="button" onClick={saveLimit} className="btn-primary rounded-lg px-4 py-2 text-xs font-bold">Guardar</button>
          </div>
          <button type="button" onClick={toggleNotif} className="mt-3 text-xs font-bold text-[#7c43ba] hover:underline">{notif ? '🔔 Avisos del sistema activados (tocar para desactivar)' : '🔕 Activar avisos del sistema al abrir la app'}</button>
        </div>
        <AlertToggle kind="low" />
        <div className="space-y-3">
          {products.map(r => (
            <StockRow key={r.id} r={r}>
              <RowInfo r={r} line={<p className="text-xs text-[#d97706] font-bold mt-1">Stock: {r.stock} unidades · aviso en ≤ {lowStockLimit(r, lowDefault)}</p>} />
              <div className="text-right flex-shrink-0"><span className="inline-block px-2 py-1 rounded-full bg-[#fef3c7] text-[#92400e] text-xs font-bold">Stock bajo</span></div>
            </StockRow>
          ))}
        </div>
        {products.length === 0 && <Empty id="no-low-stock" icon={<CheckCircle className="w-8 h-8 mx-auto text-[#23805d] mb-3" />} title="¡Todo bien!" text="No hay productos con stock bajo." />}
      </div>
    </section>
  );
}

export function OutOfStockScreen() {
  const records = useStore(s => s.records);
  const products = useMemo(() => getOutOfStockProducts(records), [records]);
  return (
    <section id="out-of-stock-screen" className="screen active">
      <Header kicker="Reponer" kickerColor="text-[#a43658]" title="Productos agotados" />
      <div className="page-inner pt-6 sm:pt-8">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#fff5f7] to-[#fff] border border-[#f5d5dc] mb-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#a43658] flex-shrink-0 mt-0.5" />
          <div><p className="font-bold text-sm text-[#a43658]">Lista de reposición</p><p className="text-xs text-[#756c7e] mt-1">Productos sin stock que necesitas volver a comprar.</p></div>
        </div>
        <AlertToggle kind="out" />
        <div className="space-y-3">
          {products.map(r => (
            <StockRow key={r.id} r={r}>
              <RowInfo r={r} line={<p className="text-xs text-[#a43658] font-bold mt-1">Último costo: {formatUSD(r.cost_price)}</p>} />
              <div className="text-right flex-shrink-0"><span className="inline-block px-2 py-1 rounded-full bg-[#fff0f3] text-[#a43658] text-xs font-bold">Agotado</span></div>
            </StockRow>
          ))}
        </div>
        {products.length === 0
          ? <Empty id="no-out-of-stock" icon={<CheckCircle className="w-8 h-8 mx-auto text-[#23805d] mb-3" />} title="¡Todo en orden!" text="No hay productos agotados." />
          : <button onClick={exportOutOfStock} className="mt-5 btn-warning px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 mx-auto"><FileDown className="w-4 h-4" /> Exportar lista de reposición</button>}
      </div>
    </section>
  );
}

// ==========================================
// INFORMES
// ==========================================
function SalesChart({ sales }: { sales: Sale[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const days: { label: string; revenue: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(); date.setDate(date.getDate() - i);
      const daySales = sales.filter(s => new Date(s.date).toDateString() === date.toDateString());
      days.push({ label: date.toLocaleDateString('es', { weekday: 'short', day: 'numeric' }), revenue: sumBy(daySales, 'actual_price'), count: daySales.length });
    }
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels: days.map(d => d.label), datasets: [{ label: `Ingresos (${currency()})`, data: days.map(d => d.revenue), backgroundColor: 'rgba(124, 67, 186, 0.7)', borderColor: 'rgba(124, 67, 186, 1)', borderWidth: 2, borderRadius: 8, maxBarThickness: 50 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `Ingresos: ${formatUSD(ctx.raw)} (${days[ctx.dataIndex].count} ventas)` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => Number(v).toLocaleString('en-US') }, grid: { color: 'rgba(0, 0, 0, 0.05)' } }, x: { grid: { display: false } } },
        layout: { padding: 10 },
      },
    });
    return () => chart.destroy();
  }, [sales]);
  return <div className="chart-container"><canvas ref={canvasRef} /></div>;
}

export function ReportsScreen() {
  const allSales = useStore(s => s.sales);
  const sales = useMemo(() => sortByDateDesc(allSales), [allSales]);
  const profit = sumBy(sales, 'profit');
  const [report, setReport] = useState<{ code: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  /** Primero se numera y se muestra el número; después se descarga o comparte */
  const makeReport = async () => { setReportBusy(true); try { setReport({ code: await issueReportNumber('Excel') }); } finally { setReportBusy(false); } };
  return (
    <section id="reports-screen" className="screen active">
      <Header kicker="Análisis" kickerColor="text-[#756c7e]" title="Informes de venta" />
      <div className="page-inner pt-6 sm:pt-8">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <article className="stat-card rounded-2xl p-4"><Receipt className="w-4 h-4 text-[#7543a8] mb-2" /><p className="font-bold text-xl">{sales.length}</p><p className="text-[11px] text-[#756c7e]">Ventas totales</p></article>
          <article className="stat-card rounded-2xl p-4"><DollarSign className="w-4 h-4 text-[#23805d] mb-2" /><p className="font-bold text-xl">{formatUSD(sumBy(sales, 'actual_price'))}</p><p className="text-[11px] text-[#756c7e]">Ingresos</p></article>
          <article className="stat-card rounded-2xl p-4"><TrendingUp className="w-4 h-4 text-[#23805d] mb-2" /><p className="font-bold text-xl">{formatUSD(profit)}</p><p className="text-[11px] text-[#756c7e]">Ganancia real</p></article>
          <article className="stat-card rounded-2xl p-4"><Target className="w-4 h-4 text-[#be416d] mb-2" /><p className="font-bold text-xl">{formatUSD(sales.length ? profit / sales.length : 0)}</p><p className="text-[11px] text-[#756c7e]">Ganancia promedio</p></article>
        </section>
        <div className="bg-white rounded-2xl p-4 mb-6 border border-[#ede7f0]">
          <h3 className="font-bold text-sm mb-3">Ventas de los últimos 7 días</h3>
          <SalesChart sales={allSales} />
        </div>
        <SalesList id="sales-list" title="Historial de ventas" list={sales} showDate />
        {sales.length === 0 && <Empty id="no-sales" icon={<Receipt className="w-8 h-8 mx-auto text-[#7c43ba] mb-3" />} title="Sin ventas aún" text="Registra ventas desde el detalle de cada producto" />}
        <div className="mt-6 flex gap-2 flex-wrap">
          <button id="make-report" onClick={makeReport} disabled={reportBusy || !sales.length} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" /> {reportBusy ? 'Numerando...' : 'Generar informe numerado'}</button>
        </div>
        {report && (
          <div id="report-ready" className="mt-3 p-4 rounded-2xl border-2 border-[#7c43ba] bg-[#f6f1f8]">
            <p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e]">Informe de ventas</p>
            <p className="font-mono font-black text-xl text-[#201728]">{report.code ? `N° ${report.code}` : 'Sin número (sin conexión)'}</p>
            <p className="text-xs text-[#756c7e] mt-0.5">{sales.length} ventas · {formatUSD(sumBy(sales, 'actual_price'))}</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button type="button" onClick={() => exportSalesXLSX(report.code || undefined)} className="py-2.5 rounded-xl btn-ghost text-xs font-bold flex flex-col items-center gap-0.5"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
              <button type="button" onClick={() => exportSalesCSV(report.code || undefined)} className="py-2.5 rounded-xl btn-ghost text-xs font-bold flex flex-col items-center gap-0.5"><FileText className="w-4 h-4" /> CSV</button>
              <button type="button" onClick={() => shareSalesReport(report.code || 'sin-numero')} className="py-2.5 rounded-xl bg-[#25D366] text-white text-xs font-bold flex flex-col items-center gap-0.5"><Share2 className="w-4 h-4" /> Compartir</button>
            </div>
            <p className="text-[10px] text-[#756c7e] mt-2">Si no te sirve, simplemente no lo descargues: el número queda registrado en "Recibos y cierres".</p>
          </div>
        )}
      </div>
    </section>
  );
}
