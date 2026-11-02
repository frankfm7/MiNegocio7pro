import type { Product } from '../types';
import { fallback } from './constants';

/** Monedas que se pueden elegir en "Datos del negocio" */
export const CURRENCIES = [
  { code: 'Bs', label: 'Bolivianos (Bs)' },
  { code: 'USD', label: 'Dólares (USD)' },
  { code: 'S/', label: 'Soles (S/)' },
  { code: 'COP', label: 'Pesos colombianos (COP)' },
  { code: 'MXN', label: 'Pesos mexicanos (MXN)' },
  { code: 'ARS', label: 'Pesos argentinos (ARS)' },
  { code: 'CLP', label: 'Pesos chilenos (CLP)' },
  { code: 'Gs', label: 'Guaraníes (Gs)' },
  { code: '€', label: 'Euros (€)' },
];
export const CURRENCY_KEY = 'mn7_currency';

/** Moneda de la app (solo cambia la etiqueta, no convierte los precios guardados) */
export function currency(): string {
  try { return localStorage.getItem(CURRENCY_KEY) || 'USD'; } catch { return 'USD'; }
}

export function formatUSD(n: unknown): string {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency();
}
export function formatUSDShort(n: unknown): string {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function cardImage(r: Pick<Product, 'image_url'>): string {
  return r.image_url || fallback;
}
/** Texto de contenido / presentación, ej. "500 ml" o "" si no hay dato */
export function formatContent(r: Pick<Product, 'content_value' | 'content_unit'>): string {
  const value = (r.content_value ?? '').toString().trim();
  if (!value) return '';
  const unit = (r.content_unit ?? '').toString().trim();
  return unit ? `${value} ${unit}` : value;
}
export function newId(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2, 6);
}
export function csvEscape(str: unknown): string {
  if (str == null) return '';
  const s = String(str);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { result.push(current); current = ''; } else current += ch;
  }
  result.push(current);
  return result;
}
export function readJSON<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : def;
  } catch {
    return def;
  }
}
