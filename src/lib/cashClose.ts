import { getState } from '../store';
import { formatUSD } from './format';
import { businessName } from './whatsapp';

export interface SellerRow { key: string; name: string; uid?: string; count: number; total: number; cash: number; qr: number; fiado: number }
export interface CashSummary {
  dateKey: string;
  label: string;
  salesCount: number;
  total: number;
  profit: number;
  byMethod: { method: string; count: number; total: number }[];
  fiadoTotal: number;
  abonoCash: number;
  abonoQr: number;
  abonoCount: number;
  /** Lo que realmente entró hoy: ventas cobradas + abonos */
  collected: number;
  /** Efectivo que debería haber en caja: ventas en efectivo + abonos en efectivo */
  cashExpected: number;
  bySeller: SellerRow[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dateKeyOf(new Date());
const sameDay = (iso: string, key: string) => dateKeyOf(new Date(iso)) === key;

/** Resumen de caja de un día (ventas por método, abonos de fiados y ventas por vendedor) */
export function buildCashSummary(dateKey: string): CashSummary {
  const { sales, movements } = getState();
  const day = sales.filter(s => sameDay(s.date, dateKey));
  const abonos = movements.filter(m => m.type === 'abono' && sameDay(m.date, dateKey));
  const sum = (list: { actual_price: number }[]) => list.reduce((a, s) => a + Number(s.actual_price || 0), 0);

  const methods = new Map<string, { count: number; total: number }>();
  day.forEach(s => {
    const m = s.payment_method || 'Efec.';
    const cur = methods.get(m) || { count: 0, total: 0 };
    methods.set(m, { count: cur.count + 1, total: cur.total + Number(s.actual_price || 0) });
  });
  const order = ['Efec.', 'QR', 'Fiado'];
  const byMethod = [...methods.entries()].map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => (order.indexOf(a.method) + 1 || 99) - (order.indexOf(b.method) + 1 || 99));

  const cashSales = sum(day.filter(s => (s.payment_method || 'Efec.') === 'Efec.'));
  const qrSales = sum(day.filter(s => s.payment_method === 'QR'));
  const fiadoTotal = sum(day.filter(s => s.payment_method === 'Fiado'));
  const abonoCash = abonos.filter(m => (m.method || 'Efec.') !== 'QR').reduce((a, m) => a + Number(m.amount), 0);
  const abonoQr = abonos.filter(m => m.method === 'QR').reduce((a, m) => a + Number(m.amount), 0);

  const sellers = new Map<string, SellerRow>();
  day.forEach(s => {
    const key = s.seller_uid || s.seller_id || s.seller_name || '—';
    const row = sellers.get(key) || { key, name: s.seller_name || 'Sin nombre', uid: s.seller_uid || s.seller_id, count: 0, total: 0, cash: 0, qr: 0, fiado: 0 };
    const v = Number(s.actual_price || 0);
    row.count += 1; row.total += v;
    if (s.payment_method === 'QR') row.qr += v; else if (s.payment_method === 'Fiado') row.fiado += v; else row.cash += v;
    sellers.set(key, row);
  });

  return {
    dateKey,
    label: new Date(dateKey + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    salesCount: day.length, total: sum(day), profit: day.reduce((a, s) => a + Number(s.profit || 0), 0),
    byMethod, fiadoTotal, abonoCash, abonoQr, abonoCount: abonos.length,
    collected: cashSales + qrSales + abonoCash + abonoQr,
    cashExpected: cashSales + abonoCash,
    bySeller: [...sellers.values()].sort((a, b) => b.total - a.total),
  };
}

/** Texto del cierre de caja (para WhatsApp o copiar) */
export function cashSummaryText(s: CashSummary, showProfit: boolean, number = '') {
  const L: string[] = [`📊 *Cierre de caja — ${(getState().receiptSettings.name || '').trim() || businessName()}*`, ...(number ? [`*N° ${number}*`] : []), `📅 ${s.label}`, ''];
  L.push(`Ventas: ${s.salesCount} · Total vendido: *${formatUSD(s.total)}*`);
  s.byMethod.forEach(m => L.push(`${m.method === 'Efec.' ? '💵' : m.method === 'QR' ? '📱' : m.method === 'Fiado' ? '📒' : '•'} ${m.method === 'Fiado' ? 'Fiado (por cobrar)' : m.method}: ${formatUSD(m.total)} (${m.count})`));
  if (s.abonoCount) L.push(`💰 Abonos de fiados: ${formatUSD(s.abonoCash + s.abonoQr)} (${s.abonoCount})`);
  L.push('', `✅ *Total cobrado: ${formatUSD(s.collected)}*`, `💵 Efectivo esperado en caja: *${formatUSD(s.cashExpected)}*`);
  if (showProfit) L.push(`📈 Ganancia: ${formatUSD(s.profit)}`);
  if (s.bySeller.length) {
    L.push('', '*Por vendedor*');
    s.bySeller.forEach(v => L.push(`• ${v.name}: ${formatUSD(v.total)} (${v.count} ventas)`));
  }
  return L.join('\n');
}
