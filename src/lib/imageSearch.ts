import type { Product } from '../types';
import { getState, setState } from '../store';
import { cardImage } from './format';
import { fallback } from './constants';
import { embeddingsKey, idbGet, idbSet } from './storage';
import { scoreProduct } from './search';
import { decodeProductQR } from './qr';

// ==========================================
// BÚSQUEDA POR IMAGEN
// ==========================================
// Combina cuatro pistas para encontrar el producto exacto:
//  1. Código de barras / QR visible en la foto (coincidencia exacta)
//  2. Parecido visual con una red neuronal (MobileNet, funciona sin internet)
//  3. Texto de la etiqueta leído con OCR (marca, nombre...)
//  4. Colores predominantes

type Vec = Float32Array;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelPromise: Promise<{ embed: (img: HTMLImageElement | HTMLCanvasElement) => Promise<Vec> } | null> | null = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        const tf = await import('@tensorflow/tfjs');
        const mobilenet = await import('@tensorflow-models/mobilenet');
        await tf.ready();
        const model = await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: '/models/mobilenet/model.json' });
        return {
          embed: async (img: HTMLImageElement | HTMLCanvasElement) => {
            const t = model.infer(img, true) as import('@tensorflow/tfjs').Tensor;
            const data = (await t.data()) as Float32Array;
            t.dispose();
            // normalizar (para similitud coseno)
            let n = 0; for (let i = 0; i < data.length; i++) n += data[i] * data[i];
            n = Math.sqrt(n) || 1;
            const v = new Float32Array(data.length);
            for (let i = 0; i < data.length; i++) v[i] = data[i] / n;
            return v;
          },
        };
      } catch (e) {
        console.warn('Modelo visual no disponible, se usa solo color/texto', e);
        modelPromise = null;
        return null;
      }
    })();
  }
  return modelPromise;
}

const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => {
  const img = new Image();
  if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = src;
});

/** Recorte cuadrado centrado: el producto suele estar al centro */
function centerSquare(img: HTMLImageElement, size = 224): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  // encajar entero (contain) para no cortar productos altos
  const s = Math.min(size / img.width, size / img.height);
  ctx.drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
  return c;
}

/** Histograma de color HSV (ignora fondos muy claros) */
function colorHist(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bins = new Array(48).fill(0);
  let total = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max, s = max ? (max - min) / max : 0;
    if (v > 0.93 && s < 0.08) continue; // fondo blanco
    let h = 0;
    if (max !== min) {
      if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
      h = (h * 60 + 360) % 360;
    }
    const bin = s < 0.15 ? 36 + Math.min(11, Math.floor(v * 12)) : Math.floor(h / 30) * 3 + Math.min(2, Math.floor(v * 3));
    bins[bin]++; total++;
  }
  return bins.map(x => x / (total || 1));
}
const histSim = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.min(x, b[i]), 0);
const cosine = (a: Vec, b: Vec) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

const sig = (src: string) => `${src.length}:${src.slice(-40)}`;
interface Cached { sig: string; vec?: number[]; hist: number[] }
let memCache: Record<string, Cached> | null = null;

async function productFeatures(p: Product, model: Awaited<ReturnType<typeof loadModel>>): Promise<Cached | null> {
  const src = cardImage(p);
  if (src === fallback) return null;
  if (!memCache) memCache = await idbGet<Record<string, Cached>>(embeddingsKey, {});
  const key = p.id;
  const c = memCache[key];
  if (c && c.sig === sig(src) && (c.vec || !model)) return c;
  const img = await loadImg(src);
  if (!img) return null;
  const sq = centerSquare(img);
  const entry: Cached = { sig: sig(src), hist: colorHist(sq) };
  if (model) { try { entry.vec = Array.from(await model.embed(sq)); } catch { /* sin vector */ } }
  memCache[key] = entry;
  return entry;
}

async function decodeCodeInImage(file: Blob): Promise<string | null> {
  try {
    const { Html5Qrcode } = await import('html5-qrcode');
    let el = document.getElementById('mc7-scan-file');
    if (!el) { el = document.createElement('div'); el.id = 'mc7-scan-file'; el.style.display = 'none'; document.body.appendChild(el); }
    const sc = new Html5Qrcode('mc7-scan-file', { verbose: false });
    const f = file instanceof File ? file : new File([file], 'foto.jpg', { type: 'image/jpeg' });
    const text = await sc.scanFile(f, false);
    sc.clear();
    return text;
  } catch {
    return null;
  }
}

const status = (s: string) => setState({ imageSearch: { ...getState().imageSearch, status: s } });

export async function searchByImage(file: Blob) {
  const src = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
  setState({ imageSearch: { preview: src, status: 'Analizando la foto...', results: null } });
  const records = getState().records;

  // 1. ¿Hay un código de barras o QR en la foto?
  const code = await decodeCodeInImage(file);
  if (code) {
    const qr = decodeProductQR(code);
    const hit = records.find(r => (qr?.id && r.id === qr.id) || (r.barcode && r.barcode === code.trim()));
    if (hit) {
      setState({ imageSearch: { preview: src, status: '', results: [{ record: hit, similarity: 100, reason: qr ? 'Código QR' : 'Código de barras' }] } });
      return;
    }
  }

  // 2 y 4. Parecido visual y de color
  status('Comparando con tus productos...');
  const query = await loadImg(src);
  if (!query) { setState({ imageSearch: { preview: src, status: '', results: [] } }); return; }
  const qsq = centerSquare(query);
  const model = await loadModel();
  const qvec = model ? await model.embed(qsq).catch(() => null) : null;
  const qhist = colorHist(qsq);

  const scores = new Map<string, { visual: number; color: number; text: number }>();
  for (const p of records) {
    const f = await productFeatures(p, model);
    if (!f) continue;
    const visual = qvec && f.vec ? Math.max(0, cosine(qvec, Float32Array.from(f.vec))) : 0;
    scores.set(p.id, { visual, color: histSim(qhist, f.hist), text: 0 });
  }
  if (memCache) idbSet(embeddingsKey, memCache);

  const publish = (final: boolean) => {
    const ranked = records.map(p => {
      const s = scores.get(p.id) || { visual: 0, color: 0, text: 0 };
      // El vector visual de MobileNet da ~0.3-0.5 entre objetos distintos y >0.8 si es el mismo
      const v = qvec ? Math.max(0, (s.visual - 0.35) / 0.55) : 0;
      const score = qvec ? v * 0.62 + s.color * 0.13 + s.text * 0.25 : s.color * 0.55 + s.text * 0.45;
      const reason = s.text > 0.6 ? 'Texto de la etiqueta' : v > 0.6 ? 'Parecido visual' : 'Colores';
      return { record: p, similarity: Math.round(Math.min(1, score) * 100), reason };
    }).filter(x => x.similarity > 8).sort((a, b) => b.similarity - a.similarity).slice(0, 6);
    setState({ imageSearch: { preview: src, status: final ? '' : 'Leyendo el texto de la etiqueta...', results: ranked } });
  };
  publish(false);

  // 3. Texto de la etiqueta (OCR)
  try {
    const { readTextFromImage } = await import('./io');
    const text = (await readTextFromImage(src)).replace(/\s+/g, ' ').trim();
    if (text.length >= 3) {
      const words = text.split(' ').filter(w => w.replace(/[^a-z0-9]/gi, '').length >= 3).slice(0, 25).join(' ');
      let best = 0;
      const raw = new Map<string, number>();
      for (const p of records) { const sc = scoreProduct(p, words, false); raw.set(p.id, sc); if (sc > best) best = sc; }
      if (best > 0.4) raw.forEach((sc, id) => { const s = scores.get(id) || { visual: 0, color: 0, text: 0 }; s.text = sc / best; scores.set(id, s); });
    }
  } catch (e) {
    console.warn('OCR no disponible', e);
  }
  publish(true);
}
