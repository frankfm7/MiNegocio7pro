import type { CustomerMovement, Product, Sale } from '../types';
import { getState } from '../store';
export { searchProducts } from './search';

export function catalogProducts(records: Product[], catalogId: string | null) {
  return catalogId ? records.filter(x => x.catalog_id === catalogId) : records;
}

export function getTodaySales(sales: Sale[]) {
  const today = new Date().toDateString();
  return sales.filter(s => new Date(s.date).toDateString() === today);
}

export const getOutOfStockProducts = (records: Product[]) => records.filter(r => Number(r.stock) < 1);
/** Mínimo que dispara el aviso: el del producto o, si no tiene, el general */
export const lowStockLimit = (r: Product, fallback: number) =>
  r.min_stock === null || r.min_stock === undefined || String(r.min_stock) === '' ? fallback : Number(r.min_stock);
export const getLowStockProducts = (records: Product[], fallback = getState().lowStockDefault) =>
  records.filter(r => Number(r.stock) > 0 && Number(r.stock) <= lowStockLimit(r, fallback));

export const sortByDateDesc = (sales: Sale[]) => [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// ---------- Clientes y fiados ----------

export const customerBalance = (movements: CustomerMovement[], customerId: string) =>
  movements.filter(m => m.customer_id === customerId).reduce((a, m) => a + (m.type === 'fiado' ? Number(m.amount) : -Number(m.amount)), 0);

/** Persona (nombre y foto) que hizo una venta */
export function sellerOf(team: Record<string, { name: string; avatar?: string }>, s: Sale): { name: string; avatar?: string } {
  const byId = team[s.seller_uid || s.seller_id || ''];
  if (byId) return byId;
  const byName = Object.values(team).find(p => p.name === s.seller_name);
  return byName || { name: s.seller_name || '' };
}
