import { useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle, CreditCard, DollarSign, FileDown, FileSpreadsheet, FileText, QrCode, Receipt, Table, Target, TrendingUp,
} from 'lucide-react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { useStore } from '../store';
import { generateDailyCloseImage, openDetail } from '../actions';
import { cardImage, formatContent, formatUSD, formatUSDShort } from '../lib/format';
import { fallback } from '../lib/constants';
import { getLowStockProducts, getOutOfStockProducts, getTodaySales, sortByDateDesc } from '../lib/selectors';
import { exportOutOfStock, exportSalesCSV, exportSalesXLSX } from '../lib/exporters';
import { TopbarMenuButton } from './CatalogsScreen';
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
// VENTAS DEL DÍA
// ==========================================
export function DailySalesScreen() {
  const sales = useStore(s => s.sales);
  const today = useMemo(() => sortByDateDesc(getTodaySales(sales)), [sales]);
  const cash = sumBy(today.filter(s => s.payment_method === 'Efec.'), 'actual_price');
  const qr = sumBy(today.filter(s => s.payment_method === 'QR'), 'actual_price');

  return (
    <section id="daily-sales-screen" className="screen active">
      <Header kicker="Hoy" kickerColor="text-[#23805d]" title="Ventas del día" />
      <div className="page-inner pt-6 sm:pt-8">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <article className="stat-card rounded-2xl p-4"><Receipt className="w-4 h-4 text-[#23805d] mb-2" /><p className="font-bold text-xl">{today.length}</p><p className="text-[11px] text-[#756c7e]">Ventas hoy</p></article>
          <article className="stat-card rounded-2xl p-4"><DollarSign className="w-4 h-4 text-[#7c43ba] mb-2" /><p className="font-bold text-xl">{formatUSDShort(sumBy(today, 'actual_price'))}</p><p className="text-[11px] text-[#756c7e]">Ingresos</p></article>
          <article className="stat-card rounded-2xl p-4"><CreditCard className="w-4 h-4 text-[#3875a5] mb-2" /><p className="font-bold text-xl">{formatUSDShort(cash)}</p><p className="text-[11px] text-[#756c7e]">Efectivo</p></article>
          <article className="stat-card rounded-2xl p-4"><QrCode className="w-4 h-4 text-[#7c43ba] mb-2" /><p className="font-bold text-xl">{formatUSDShort(qr)}</p><p className="text-[11px] text-[#756c7e]">QR</p></article>
        </section>
        <section className="grid grid-cols-2 gap-3 mb-6 sensitive-data">
          <article className="stat-card rounded-2xl p-4 border-l-4 border-l-[#166534]"><TrendingUp className="w-4 h-4 text-[#166534] mb-2" /><p className="font-bold text-xl text-[#166534]">{formatUSDShort(sumBy(today, 'profit'))}</p><p className="text-[11px] text-[#756c7e]">Ganancia hoy</p></article>
        </section>
        <button onClick={generateDailyCloseImage} className="w-full mb-4 py-3 rounded-xl bg-[#7c43ba] text-white font-bold flex items-center justify-center gap-2"><Table className="w-4 h-4" /> Generar tabla de cierre</button>
        <h2 className="font-bold text-lg mb-3 hero-title">Historial de hoy</h2>
        <div id="daily-sales-list" className="space-y-2">
          {today.map(s => (
            <div key={s.id} className="sale-row rounded-xl p-3 flex items-center gap-3 shadow-sm bg-white">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{s.product_name} {s.quantity > 1 && <span className="text-[10px] text-[#756c7e]">x{s.quantity}</span>}</p>
                {s.seller_name && <p className="text-[10px] text-[#7c43ba] font-bold">{s.seller_name}</p>}
                <div className="flex items-center gap-1 mt-1">
                  {s.payment_method && <span className={`text-[9px] px-2 py-0.5 rounded-full ${s.payment_method === 'QR' ? 'bg-[#f6f1f8] text-[#7c43ba]' : 'bg-[#f0fdf4] text-[#166534]'} font-bold`}>{s.payment_method}</span>}
                  <p className="text-xs text-[#756c7e]">{new Date(s.date).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0"><p className="font-bold text-sm text-[#7c43ba]">{formatUSD(s.actual_price)}</p><p className="text-xs text-[#166534] font-bold">+{formatUSD(s.profit)}</p></div>
            </div>
          ))}
        </div>
        {today.length === 0 && <Empty id="no-daily-sales" icon={<Receipt className="w-8 h-8 mx-auto text-[#7c43ba] mb-3" />} title="Sin ventas hoy" text="Las ventas de hoy aparecerán aquí" />}
      </div>
    </section>
  );
}

// ==========================================
// STOCK BAJO / AGOTADOS
// ==========================================
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
  const products = useMemo(() => getLowStockProducts(records), [records]);
  return (
    <section id="low-stock-screen" className="screen active">
      <Header kicker="Atención" kickerColor="text-[#d97706]" title="Productos con stock bajo" />
      <div className="page-inner pt-6 sm:pt-8">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#fffbeb] to-[#fff] border border-[#fde68a] mb-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#d97706] flex-shrink-0 mt-0.5" />
          <div><p className="font-bold text-sm text-[#d97706]">Reposición recomendada</p><p className="text-xs text-[#756c7e] mt-1">Productos con 3 unidades o menos. Considera reponer pronto.</p></div>
        </div>
        <div className="space-y-3">
          {products.map(r => (
            <StockRow key={r.id} r={r}>
              <RowInfo r={r} line={<p className="text-xs text-[#d97706] font-bold mt-1">Stock: {r.stock} unidades</p>} />
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
      data: { labels: days.map(d => d.label), datasets: [{ label: 'Ingresos (USD)', data: days.map(d => d.revenue), backgroundColor: 'rgba(124, 67, 186, 0.7)', borderColor: 'rgba(124, 67, 186, 1)', borderWidth: 2, borderRadius: 8, maxBarThickness: 50 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `Ingresos: ${formatUSD(ctx.raw)} (${days[ctx.dataIndex].count} ventas)` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v }, grid: { color: 'rgba(0, 0, 0, 0.05)' } }, x: { grid: { display: false } } },
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
        <h2 className="font-bold text-lg mb-3 hero-title">Historial de ventas</h2>
        <div id="sales-list" className="space-y-2">
          {sales.map(s => {
            const date = new Date(s.date);
            return (
              <div key={s.id} className="sale-row rounded-xl p-3 flex items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{s.product_name}</p>
                  {s.seller_name && <p className="text-[10px] text-[#7c43ba] font-bold">Vendido por: {s.seller_name}</p>}
                  {s.payment_method && <p className="text-[10px] text-[#23805d] font-bold">{s.payment_method}</p>}
                  <p className="text-xs text-[#756c7e]">{date.toLocaleDateString('es', { day: '2-digit', month: 'short' })} {date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="text-right flex-shrink-0"><p className="font-bold text-sm text-[#7c43ba]">{formatUSD(s.actual_price)}</p><p className="text-xs text-[#166534] font-bold">+{formatUSD(s.profit)}</p></div>
              </div>
            );
          })}
        </div>
        {sales.length === 0 && <Empty id="no-sales" icon={<Receipt className="w-8 h-8 mx-auto text-[#7c43ba] mb-3" />} title="Sin ventas aún" text="Registra ventas desde el detalle de cada producto" />}
        <div className="mt-6 flex gap-2 flex-wrap">
          <button onClick={exportSalesXLSX} className="btn-ghost px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Exportar Excel</button>
          <button onClick={exportSalesCSV} className="btn-ghost px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2"><FileText className="w-4 h-4" /> Exportar CSV</button>
        </div>
      </div>
    </section>
  );
}
