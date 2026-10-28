import type { Product, Sale } from '../types';
export { searchProducts } from './search';

export function catalogProducts(records: Product[], catalogId: string | null) {
  return catalogId ? records.filter(x => x.catalog_id === catalogId) : records;
}

export function getTodaySales(sales: Sale[]) {
  const today = new Date().toDateString();
  return sales.filter(s => new Date(s.date).toDateString() === today);
}

export const getOutOfStockProducts = (records: Product[]) => records.filter(r => Number(r.stock) < 1);
export const getLowStockProducts = (records: Product[]) => records.filter(r => Number(r.stock) > 0 && Number(r.stock) <= 3);

export const sortByDateDesc = (sales: Sale[]) => [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
