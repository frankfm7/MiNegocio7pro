import type { Product } from '../types';
import { formatContent } from './format';

/** minúsculas, sin acentos, sin signos */
export function normalize(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'para', 'por', 'un', 'una']);

export function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(t => t && !STOP.has(t));
}

/** Distancia de edición (Damerau-Levenshtein simple) con corte temprano */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Qué tanto se parece un término buscado a una palabra (0 a 1) */
function termScore(term: string, word: string): number {
  if (word === term) return 1;
  if (word.startsWith(term)) return 0.92 - Math.min(0.2, (word.length - term.length) * 0.01);
  if (term.length >= 3 && word.includes(term)) return 0.75;
  if (term.length >= 4 && term.startsWith(word) && word.length >= 3) return 0.6;
  if (term.length < 3) return 0;
  // Errores de tipeo: 1 error hasta 5 letras, 2 errores desde 6
  const max = term.length <= 5 ? 1 : 2;
  const cmp = word.length > term.length + 1 ? word.slice(0, term.length + 1) : word;
  const d = Math.min(editDistance(term, word, max), editDistance(term, cmp, max));
  if (d <= max) return 0.6 - d * 0.12;
  return 0;
}

interface Indexed { product: Product; fields: { words: string[]; text: string; weight: number }[]; barcode: string }

const FIELDS: [keyof Product | 'content', number][] = [
  ['name', 3], ['brand', 2.2], ['type', 1.4], ['category', 1.4], ['content', 1], ['offer_text', 0.6], ['description', 0.5],
];

const cache = new WeakMap<Product, Indexed>();
function index(p: Product): Indexed {
  let ix = cache.get(p);
  if (!ix) {
    ix = {
      product: p,
      barcode: normalize(p.barcode),
      fields: FIELDS.map(([f, weight]) => {
        const text = normalize(f === 'content' ? formatContent(p) : p[f as keyof Product]);
        return { text, words: text.split(' ').filter(Boolean), weight };
      }),
    };
    cache.set(p, ix);
  }
  return ix;
}

/** Puntaje de un producto para una búsqueda; 0 si no coincide */
export function scoreProduct(p: Product, query: string, requireAll = true): number {
  const q = normalize(query);
  if (!q) return 0;
  const ix = index(p);
  if (ix.barcode && (ix.barcode === q.replace(/\s/g, ''))) return 100;
  const terms = tokens(q);
  if (terms.length === 0) return 0;
  let total = 0;
  let matched = 0;
  for (const t of terms) {
    let best = 0;
    for (const f of ix.fields) {
      for (const w of f.words) {
        const s = termScore(t, w) * f.weight;
        if (s > best) best = s;
      }
    }
    if (ix.barcode && t.length >= 4 && ix.barcode.includes(t)) best = Math.max(best, 2.5);
    if (best > 0) matched++;
    total += best;
  }
  if (requireAll && matched < terms.length) return 0;
  // Bonus si el nombre empieza con la frase completa
  const name = ix.fields[0].text;
  if (name.startsWith(q)) total += 2;
  else if (name.includes(q)) total += 1;
  return (total / terms.length) * (matched / terms.length);
}

/**
 * Búsqueda tolerante: ignora acentos y mayúsculas, acepta palabras en cualquier
 * orden, palabras a medio escribir y pequeños errores de tipeo.
 */
export function searchProducts(products: Product[], query: string): Product[] {
  if (!normalize(query)) return products;
  let scored = products.map(p => ({ p, s: scoreProduct(p, query, true) })).filter(x => x.s > 0);
  // Si ninguna coincide con todas las palabras, mostrar las que coinciden con alguna
  if (scored.length === 0) scored = products.map(p => ({ p, s: scoreProduct(p, query, false) })).filter(x => x.s > 0.5);
  return scored.sort((a, b) => b.s - a.s).map(x => x.p);
}
