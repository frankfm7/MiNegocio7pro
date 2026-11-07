import JsBarcode from 'jsbarcode';
import type { Product } from '../types';
import { generateProductQRImage, productShortCode } from './qr';
import { formatContent, formatUSDShort } from './format';

export interface LabelPreset {
  id: string;
  name: string;
  /** Medida de cada etiqueta en mm */
  w: number; h: number;
  /** Hoja A4 con cuadrícula (cols x rows) o una etiqueta por página (térmica) */
  grid?: { cols: number; rows: number; marginX: number; marginY: number };
}

/** Hoja A4 ajustada al tamaño del QR: etiquetas justas, sin espacio de más (≈10 por fila con QR de 1,5 cm) */
export const AUTO_PRESET_ID = 'a4-auto';
export function autoPreset(qrMm = 15): LabelPreset {
  const w = Math.max(qrMm + 4.5, 16), h = qrMm + 10;
  const cols = Math.max(1, Math.floor(200 / w)), rows = Math.max(1, Math.floor(285 / h));
  return { id: AUTO_PRESET_ID, name: 'Hoja A4 · ajustada al QR', w, h, grid: { cols, rows, marginX: (210 - cols * w) / 2, marginY: (297 - rows * h) / 2 } };
}

export const LABEL_PRESETS: LabelPreset[] = [
  { id: AUTO_PRESET_ID, name: 'Hoja A4 · ajustada al QR (≈10 por fila, solo QR + nombre)', w: 19.5, h: 25, grid: { cols: 10, rows: 11, marginX: 7.5, marginY: 11 } },
  { id: 'a4-24', name: 'Hoja A4 · 24 etiquetas (63 × 34 mm)', w: 63, h: 34, grid: { cols: 3, rows: 8, marginX: 10.5, marginY: 12.5 } },
  { id: 'a4-12', name: 'Hoja A4 · 12 etiquetas grandes (63 × 68 mm)', w: 63, h: 68, grid: { cols: 3, rows: 4, marginX: 10.5, marginY: 12.5 } },
  { id: 'a4-32', name: 'Hoja A4 · 32 etiquetas, 4 por fila (48,5 × 34 mm)', w: 48.5, h: 33.9, grid: { cols: 4, rows: 8, marginX: 8, marginY: 13 } },
  { id: 'a4-55', name: 'Hoja A4 · 55 etiquetas mini (38 × 25 mm)', w: 38, h: 25, grid: { cols: 5, rows: 11, marginX: 10, marginY: 11 } },
  { id: 'a4-40', name: 'Hoja A4 · 40 etiquetas chicas (48,5 × 25,4 mm)', w: 48.5, h: 25.4, grid: { cols: 4, rows: 10, marginX: 8, marginY: 21.5 } },
  { id: 'a4-65', name: 'Hoja A4 · 65 etiquetas mini (38 × 21 mm)', w: 38.1, h: 21.2, grid: { cols: 5, rows: 13, marginX: 9.75, marginY: 10.7 } },
  { id: 't-50x30', name: 'Térmica · 50 × 30 mm', w: 50, h: 30 },
  { id: 't-40x25', name: 'Térmica · 40 × 25 mm', w: 40, h: 25 },
  { id: 't-60x40', name: 'Térmica · 60 × 40 mm', w: 60, h: 40 },
];

export type LabelLayout = 'full' | 'qrname';
export interface LabelOptions {
  /** full = QR + nombre + precio + código de barras · qrname = solo QR con nombre, marca y contenido arriba o abajo */
  layout?: LabelLayout; textPos?: 'top' | 'bottom';
  /** Tamaño del QR en mm (se achica solo si no cabe en la etiqueta) */
  qrMm?: number;
  preset: LabelPreset; copies: 'one' | 'stock'; showPrice: boolean; showBarcode: boolean; showBorder: boolean; /** Cantidad elegida por producto (si no, se usa copies) */ counts?: Record<string, number> }

/** Valor del código de barras de la etiqueta: el propio del producto o su código corto de 8 dígitos */
export function labelBarcodeValue(r: Product): string {
  const own = String(r.barcode || '').trim();
  return own && own.length <= 16 ? own : productShortCode(r);
}

/**
 * Código de barras como imagen PNG + cuántos módulos (barras finas) tiene, para
 * imprimirlo con barras gruesas y bien legibles (CODE128; si no se puede, CODE39).
 */
export function barcodeImage(code: string): { src: string; modules: number } | null {
  const canvas = document.createElement('canvas');
  const draw = (format: string, value: string) => { JsBarcode(canvas, value, { format, displayValue: false, margin: 0, height: 40, width: 2 }); return { src: canvas.toDataURL('image/png'), modules: canvas.width / 2 }; };
  try { return draw('CODE128', code); }
  catch {
    try { return draw('CODE39', code.toUpperCase().replace(/[^0-9A-Z.\-$/+% ]/g, '')); }
    catch { return null; }
  }
}

/**
 * PDF de etiquetas: a la izquierda el QR del producto (al escanearlo abre la app en ese producto);
 * a la derecha nombre, contenido, precio y código de barras.
 */
export async function buildLabelsPDF(products: Product[], opt: LabelOptions) {
  const { jsPDF } = await import('jspdf');
  const p = opt.preset.id === AUTO_PRESET_ID ? autoPreset(opt.qrMm || 15) : opt.preset;
  const grid = p.grid;
  const doc = grid ? new jsPDF({ unit: 'mm', format: 'a4' }) : new jsPDF({ unit: 'mm', format: [p.w, p.h], orientation: p.w >= p.h ? 'landscape' : 'portrait' });

  // lista de etiquetas (una por copia)
  const labels: Product[] = [];
  products.forEach(r => {
    const n = opt.counts ? Math.max(0, Math.min(opt.counts[r.id] ?? 1, 500)) : opt.copies === 'stock' ? Math.max(1, Math.min(Number(r.stock) || 1, 200)) : 1;
    for (let i = 0; i < n; i++) labels.push(r);
  });

  const qrCache = new Map<string, string>();
  const perPage = grid ? grid.cols * grid.rows : 1;
  for (let i = 0; i < labels.length; i++) {
    const r = labels[i];
    const slot = i % perPage;
    if (i > 0 && slot === 0) doc.addPage();
    const x = grid ? grid.marginX + (slot % grid.cols) * p.w : 0;
    const y = grid ? grid.marginY + Math.floor(slot / grid.cols) * p.h : 0;
    const pad = Math.min(2.2, p.h * 0.08);

    if (opt.showBorder) { doc.setDrawColor(200, 190, 210); doc.setLineWidth(0.15); doc.rect(x + 0.4, y + 0.4, p.w - 0.8, p.h - 0.8); }

    let qr = qrCache.get(r.id);
    if (!qr) { qr = await generateProductQRImage(r, 400); qrCache.set(r.id, qr); }

    if (opt.layout === 'qrname') { drawQrName(doc, r, qr, x, y, p, opt); continue; }

    const qrSize = Math.min(p.h - pad * 2, p.w * 0.42, opt.qrMm || 99);
    doc.addImage(qr, 'PNG', x + pad, y + (p.h - qrSize) / 2, qrSize, qrSize, undefined, 'FAST');

    const tx = x + pad + qrSize + 1.8;
    const tw = p.w - (tx - x) - pad;
    let ty = y + pad + 1.5;
    doc.setTextColor(32, 23, 40); doc.setFont('helvetica', 'bold');
    const nameSize = p.h >= 40 ? 10 : p.h >= 30 ? 8 : 6.5;
    doc.setFontSize(nameSize);
    const withBarcode = opt.showBarcode && p.h >= 24;
    const maxLines = p.h >= 40 ? 3 : withBarcode && p.h < 30 ? 1 : 2;
    const nameLines = (doc.splitTextToSize(r.name, tw) as string[]).slice(0, maxLines);
    doc.text(nameLines, tx, ty);
    ty += nameLines.length * (nameSize * 0.36) + 0.6;

    const sub = [r.brand, formatContent(r)].filter(Boolean).join(' · ');
    if (sub && p.h >= 25 && !(withBarcode && p.h < 30)) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(Math.max(5, nameSize - 2.5)); doc.setTextColor(110, 100, 120);
      doc.text((doc.splitTextToSize(sub, tw) as string[])[0], tx, ty);
      ty += nameSize * 0.32;
    }
    if (opt.showPrice) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(p.h >= 30 ? nameSize + 3 : nameSize + 1.5); doc.setTextColor(124, 67, 186);
      doc.text(formatUSDShort(r.sale_price), tx, ty + (p.h >= 30 ? 3.4 : 2.4));
      ty += p.h >= 30 ? 5 : 3.6;
    }
    if (withBarcode) {
      const code = labelBarcodeValue(r);
      const img = barcodeImage(code);
      // Barras de ~0.33 mm (se leen bien con cualquier celular), sin estirar a todo el ancho
      const bh = Math.min(p.h >= 30 ? 7 : 5.5, y + p.h - pad - ty - 2.6);
      if (img && bh > 3) {
        const bw = Math.min(tw, img.modules * 0.33);
        doc.addImage(img.src, 'PNG', tx, y + p.h - pad - bh - 2.6, bw, bh, undefined, 'FAST');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(60, 50, 70);
        doc.text(code, tx + bw / 2, y + p.h - pad - 0.4, { align: 'center' });
      }
    }
  }
  return { doc, count: labels.length };
}

type Doc = InstanceType<typeof import('jspdf').jsPDF>;
const PT = 0.3528; // 1 punto tipográfico en mm

/**
 * Etiqueta "solo QR": el QR al centro y, arriba o abajo, el nombre, la marca y el contenido
 * (ej. "Yanbal · 50 ml"). Pensada para la hoja mini de 38 × 25 mm.
 */
function drawQrName(doc: Doc, r: Product, qr: string, x: number, y: number, p: LabelPreset, opt: LabelOptions) {
  // Márgenes chicos: el QR y el texto aprovechan casi toda la etiqueta
  const pad = Math.max(0.6, Math.min(1.4, p.h * 0.04));
  const innerW = p.w - pad * 2;
  const nameFs = p.h >= 40 ? 9 : p.h >= 30 ? 7.5 : p.w < 24 ? 5.4 : 6.2;
  const subFs = Math.max(4.4, nameFs - 1.2);
  const lineN = nameFs * PT * 1.12, lineS = subFs * PT * 1.15;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(nameFs);
  let nameLines = doc.splitTextToSize(r.name, innerW) as string[];
  const sub = [r.brand, formatContent(r)].filter(Boolean).join(' · ');
  const gap = 0.8;
  const textH = (n: number) => n * lineN + (sub ? lineS : 0);
  // El QR ocupa lo que quede; si con 2 líneas de nombre el QR queda muy chico, se usa 1 línea
  const maxQr = Math.min(opt.qrMm || 99, innerW);
  nameLines = nameLines.slice(0, 2);
  if (p.h - pad * 2 - textH(nameLines.length) - gap < Math.min(maxQr, 12) && nameLines.length > 1) nameLines = nameLines.slice(0, 1);
  if (nameLines.length === 1 && (doc.splitTextToSize(r.name, innerW) as string[]).length > 1) nameLines[0] = fitText(doc, r.name, innerW);
  const th = textH(nameLines.length);
  const qrSize = Math.max(8, Math.min(maxQr, p.h - pad * 2 - th - gap));
  const blockH = qrSize + gap + th;
  const top = y + (p.h - blockH) / 2;
  const cx = x + p.w / 2;
  const textTop = opt.textPos === 'top' ? top : top + qrSize + gap;
  const qrTop = opt.textPos === 'top' ? top + th + gap : top;
  doc.addImage(qr, 'PNG', cx - qrSize / 2, qrTop, qrSize, qrSize, undefined, 'FAST');
  doc.setTextColor(32, 23, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(nameFs);
  nameLines.forEach((l, i) => doc.text(l, cx, textTop + i * lineN + nameFs * PT * 0.9, { align: 'center' }));
  if (sub) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(subFs); doc.setTextColor(95, 85, 105);
    doc.text(fitText(doc, sub, innerW), cx, textTop + nameLines.length * lineN + subFs * PT * 0.95, { align: 'center' });
  }
}

/** Recorta un texto con "…" para que entre en el ancho */
function fitText(doc: Doc, text: string, w: number) {
  if (doc.getTextWidth(text) <= w) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + '…') > w) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
