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

export const LABEL_PRESETS: LabelPreset[] = [
  { id: 'a4-24', name: 'Hoja A4 · 24 etiquetas (63 × 34 mm)', w: 63, h: 34, grid: { cols: 3, rows: 8, marginX: 10.5, marginY: 12.5 } },
  { id: 'a4-12', name: 'Hoja A4 · 12 etiquetas grandes (63 × 68 mm)', w: 63, h: 68, grid: { cols: 3, rows: 4, marginX: 10.5, marginY: 12.5 } },
  { id: 'a4-40', name: 'Hoja A4 · 40 etiquetas chicas (48,5 × 25,4 mm)', w: 48.5, h: 25.4, grid: { cols: 4, rows: 10, marginX: 8, marginY: 21.5 } },
  { id: 'a4-65', name: 'Hoja A4 · 65 etiquetas mini (38 × 21 mm)', w: 38.1, h: 21.2, grid: { cols: 5, rows: 13, marginX: 9.75, marginY: 10.7 } },
  { id: 't-50x30', name: 'Térmica · 50 × 30 mm', w: 50, h: 30 },
  { id: 't-40x25', name: 'Térmica · 40 × 25 mm', w: 40, h: 25 },
  { id: 't-60x40', name: 'Térmica · 60 × 40 mm', w: 60, h: 40 },
];

export interface LabelOptions { preset: LabelPreset; copies: 'one' | 'stock'; showPrice: boolean; showBarcode: boolean; showBorder: boolean; /** Cantidad elegida por producto (si no, se usa copies) */ counts?: Record<string, number> }

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
  const { preset: p } = opt;
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
    if (!qr) { qr = await generateProductQRImage(r, 300); qrCache.set(r.id, qr); }
    const qrSize = Math.min(p.h - pad * 2, p.w * 0.42);
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
