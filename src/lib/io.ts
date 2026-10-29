// ==========================================
// IMPORTAR / EXPORTAR CATÁLOGOS
// ==========================================
// Formatos: Excel (.xlsx con imágenes), PDF (catálogo con fotos que se puede
// volver a importar), JSON (respaldo completo), CSV, imágenes (fotos o listas
// de precios con lectura de texto).
import type { Catalog, DraftProduct, Product } from '../types';
import { getState, openModal, setState, toast } from '../store';
import { SoundEffects } from './sound';
import { csvEscape, formatContent, formatUSDShort, newId, parseCSVLine } from './format';
import { autoFrameProduct, compressImage, downloadBlob, readFileAsBase64 } from './image';
import { DB } from './db';
import { APP_NAME, fallback, fallbackCover } from './constants';
import { normalize } from './search';

type Scope = { catalogs: Catalog[]; records: Product[]; label: string };

function scope(catalogId: string | null): Scope {
  const { catalogs, records, activeStore, contactInfo } = getState();
  if (catalogId) {
    const cat = catalogs.find(c => c.id === catalogId);
    return { catalogs: cat ? [cat] : [], records: records.filter(r => r.catalog_id === catalogId), label: cat?.name || 'catalogo' };
  }
  return { catalogs, records, label: activeStore?.store_name || contactInfo?.business || 'todos_los_catalogos' };
}

const fileSafe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'catalogo';
const stamp = () => new Date().toISOString().slice(0, 10);

/** Convierte la imagen de un producto en bytes JPEG/PNG (sirve para Excel y PDF) */
async function imageBytes(src: string, maxSide = 600): Promise<{ dataUrl: string; ext: 'jpeg' | 'png'; w: number; h: number } | null> {
  if (!src || src === fallback) return null;
  try {
    let dataUrl = src;
    if (!src.startsWith('data:')) {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) return null;
      dataUrl = await readFileAsBase64(await res.blob());
    }
    const img = await new Promise<HTMLImageElement>((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = dataUrl; });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), ext: 'jpeg', w: c.width, h: c.height };
  } catch {
    return null;
  }
}

// ==========================================
// EXPORTAR
// ==========================================
export async function exportExcel(catalogId: string | null = null) {
  const sc = scope(catalogId);
  if (sc.records.length === 0) { toast('No hay productos para exportar'); return; }
  toast('Preparando Excel con imágenes...', 4000);
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    const ws = wb.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 1 }] });
    const catName = new Map(getState().catalogs.map(c => [c.id, c.name]));
    ws.columns = [
      { header: 'Imagen', key: 'img', width: 14 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Marca', key: 'brand', width: 16 },
      { header: 'Tipo', key: 'type', width: 14 },
      { header: 'Categoría', key: 'category', width: 16 },
      { header: 'Contenido', key: 'content_value', width: 11 },
      { header: 'Unidad', key: 'content_unit', width: 9 },
      { header: 'Código Barras', key: 'barcode', width: 17 },
      { header: 'Costo', key: 'cost_price', width: 10 },
      { header: 'Precio Venta Máx', key: 'sale_price', width: 15 },
      { header: 'Precio Venta Mín', key: 'min_price', width: 15 },
      { header: 'Stock', key: 'stock', width: 8 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Oferta', key: 'offer_text', width: 16 },
      { header: 'Catálogo', key: 'catalog', width: 20 },
      { header: 'ID', key: 'id', width: 22 },
    ];
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C43BA' } };
    head.alignment = { vertical: 'middle' };
    head.height = 22;

    for (let i = 0; i < sc.records.length; i++) {
      const r = sc.records[i];
      const row = ws.addRow({
        name: r.name, brand: r.brand, type: r.type, category: r.category, content_value: r.content_value || '', content_unit: r.content_unit || '',
        barcode: r.barcode || '', cost_price: Number(r.cost_price) || 0, sale_price: Number(r.sale_price) || 0, min_price: Number(r.min_price) || 0,
        stock: Number(r.stock) || 0, description: r.description || '', offer_text: r.offer_text || '', catalog: catName.get(r.catalog_id) || r.catalog_id, id: r.id,
      });
      row.alignment = { vertical: 'middle', wrapText: true };
      const img = await imageBytes(r.image_url, 300);
      if (img) {
        row.height = 70;
        const id = wb.addImage({ base64: img.dataUrl, extension: img.ext });
        const fit = Math.min(90 / img.w, 88 / img.h);
        ws.addImage(id, { tl: { col: 0.08, row: row.number - 1 + 0.06 }, ext: { width: img.w * fit, height: img.h * fit }, editAs: 'oneCell' });
      }
    }
    ['cost_price', 'sale_price', 'min_price'].forEach(k => { ws.getColumn(k).numFmt = '#,##0.00'; });

    const wc = wb.addWorksheet('Catálogos');
    wc.columns = [{ header: 'ID', key: 'id', width: 24 }, { header: 'Nombre', key: 'name', width: 30 }, { header: 'Etiqueta', key: 'label', width: 16 }, { header: 'Color', key: 'color', width: 10 }];
    wc.getRow(1).font = { bold: true };
    sc.catalogs.forEach(c => wc.addRow(c));

    const buf = await wb.xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileSafe(sc.label)}_${stamp()}.xlsx`);
    toast(`✅ Excel descargado: ${sc.records.length} productos con imágenes`);
    SoundEffects.play('success');
  } catch (e) {
    console.error(e);
    toast('Error al exportar Excel: ' + (e as Error).message, 4000);
  }
}

export function exportJSON(catalogId: string | null = null) {
  const sc = scope(catalogId);
  if (sc.records.length === 0) { toast('No hay productos para exportar'); return; }
  const sales = catalogId ? getState().sales.filter(s => sc.records.some(r => r.id === s.product_id)) : getState().sales;
  const data = { app: APP_NAME, version: 3, exported_at: new Date().toISOString(), catalogs: sc.catalogs, records: sc.records, sales };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${fileSafe(sc.label)}_${stamp()}.json`);
  toast(`✅ JSON descargado: ${sc.records.length} productos (con imágenes)`);
  SoundEffects.play('success');
}

export function exportCSV(catalogId: string | null = null) {
  const sc = scope(catalogId);
  if (sc.records.length === 0) { toast('No hay productos para exportar'); return; }
  const catName = new Map(getState().catalogs.map(c => [c.id, c.name]));
  const headers = ['nombre', 'marca', 'tipo', 'categoria', 'contenido', 'unidad', 'codigo_barras', 'costo', 'precio_venta_max', 'precio_venta_min', 'stock', 'descripcion', 'oferta', 'catalogo', 'imagen_url', 'id'];
  const lines = [headers.join(',')];
  sc.records.forEach(r => lines.push([
    r.name, r.brand, r.type, r.category, r.content_value || '', r.content_unit || '', r.barcode || '', r.cost_price || 0, r.sale_price || 0,
    r.min_price || 0, r.stock || 0, r.description || '', r.offer_text || '', catName.get(r.catalog_id) || '',
    r.image_url && !r.image_url.startsWith('data:') ? r.image_url : '', r.id,
  ].map(csvEscape).join(',')));
  downloadBlob(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${fileSafe(sc.label)}_${stamp()}.csv`);
  toast(`✅ CSV descargado: ${sc.records.length} productos`);
  SoundEffects.play('success');
}

// Marcadores para guardar los datos dentro del PDF (así se puede volver a importar con fotos)
const PDF_MARK_START = 'MC7DATA<';
const PDF_MARK_END = '>MC7DATA';
const utf8ToB64 = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64ToUtf8 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0)));

/**
 * PDF del catálogo con fotos.
 * - Para clientes (withCosts=false): solo precio de venta, sin costos.
 * - Inventario (withCosts=true): incluye costo, precio mínimo, stock y código.
 */
export async function exportPDF(catalogId: string | null = null, withCosts = false) {
  const sc = scope(catalogId);
  if (sc.records.length === 0) { toast('No hay productos para exportar'); return; }
  toast('Generando PDF con fotos...', 5000);
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const store = getState().activeStore?.store_name || getState().contactInfo?.business || APP_NAME;
    const contact = getState().contactInfo;
    const PW = 210, M = 12, colW = (PW - M * 2 - 6) / 2, cardH = withCosts ? 62 : 56, imgW = 38;
    let page = 1;

    const header = () => {
      doc.setFillColor(124, 67, 186); doc.rect(0, 0, PW, 22, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      doc.text(store, M, 11);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(withCosts ? 'Inventario completo' : 'Catálogo de productos', M, 17);
      doc.text(new Date().toLocaleDateString('es'), PW - M, 11, { align: 'right' });
      if (contact?.whatsapp) doc.text(`WhatsApp: ${contact.whatsapp}`, PW - M, 17, { align: 'right' });
    };
    const footer = () => {
      doc.setTextColor(150, 140, 160); doc.setFontSize(7.5);
      doc.text(`${APP_NAME} · Página ${page}`, PW / 2, 291, { align: 'center' });
    };
    header();
    let y = 30;

    const byCatalog = sc.catalogs.length ? sc.catalogs.map(c => ({ cat: c, items: sc.records.filter(r => r.catalog_id === c.id) })) : [];
    const orphan = sc.records.filter(r => !sc.catalogs.some(c => c.id === r.catalog_id));
    if (orphan.length) byCatalog.push({ cat: { id: '', name: 'Otros', label: '', color: '#7c43ba', cover: '', favorite: false }, items: orphan });

    const newPage = () => { footer(); doc.addPage(); page++; header(); y = 30; };

    for (const group of byCatalog) {
      if (!group.items.length) continue;
      if (y > 260) newPage();
      doc.setTextColor(32, 23, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(group.cat.name, M, y + 4);
      doc.setDrawColor(124, 67, 186); doc.setLineWidth(0.6); doc.line(M, y + 6.5, PW - M, y + 6.5);
      y += 11;
      for (let i = 0; i < group.items.length; i++) {
        const col = i % 2;
        if (col === 0 && y + cardH > 285) newPage();
        const r = group.items[i];
        const x = M + col * (colW + 6);
        doc.setDrawColor(232, 223, 236); doc.setLineWidth(0.3); doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, colW, cardH - 4, 3, 3, 'FD');
        // Foto completa (sin recortar)
        doc.setFillColor(246, 241, 248); doc.roundedRect(x + 2, y + 2, imgW, cardH - 8, 2, 2, 'F');
        const img = await imageBytes(r.image_url, 500);
        if (img) {
          const boxH = cardH - 10, fit = Math.min((imgW - 2) / img.w, boxH / img.h);
          const w = img.w * fit, h = img.h * fit;
          doc.addImage(img.dataUrl, 'JPEG', x + 2 + (imgW - w) / 2, y + 3 + (boxH - h) / 2, w, h);
        }
        const tx = x + imgW + 5, tw = colW - imgW - 8;
        let ty = y + 7;
        doc.setTextColor(123, 67, 168); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        if (r.brand) { doc.text(r.brand.toUpperCase(), tx, ty); ty += 4; }
        doc.setTextColor(32, 23, 40); doc.setFontSize(10);
        const name = doc.splitTextToSize(r.name, tw).slice(0, 2);
        doc.text(name, tx, ty); ty += name.length * 4.2;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 100, 120);
        const meta = [formatContent(r), r.type, r.category].filter(Boolean).join(' · ');
        if (meta) { doc.text(doc.splitTextToSize(meta, tw).slice(0, 1), tx, ty); ty += 3.8; }
        if (r.description) { const d = doc.splitTextToSize(r.description, tw).slice(0, 2); doc.text(d, tx, ty); ty += d.length * 3.4; }
        if (r.offer_text) { doc.setTextColor(146, 64, 14); doc.setFont('helvetica', 'bold'); doc.text(`Oferta: ${r.offer_text}`, tx, ty + 0.5); ty += 4; }
        doc.setTextColor(124, 67, 186); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        const priceY = y + cardH - (withCosts ? 15 : 8);
        doc.text(`${formatUSDShort(r.sale_price)} USD`, tx, priceY);
        if (withCosts) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90, 80, 100);
          doc.text(`Costo: ${formatUSDShort(r.cost_price)} · Mín: ${formatUSDShort(r.min_price)} · Stock: ${r.stock}`, tx, priceY + 4.5);
          if (r.barcode) doc.text(`Código: ${r.barcode}`, tx, priceY + 8);
        }
        if (col === 1 || i === group.items.length - 1) y += cardH;
      }
      y += 4;
    }
    footer();

    // Datos para volver a importar (sin costos en el PDF para clientes)
    const records = sc.records.map(r => withCosts ? r : { ...r, cost_price: 0, min_price: 0, stock: 0 });
    const payload = utf8ToB64(JSON.stringify({ app: APP_NAME, v: 3, withCosts, catalogs: sc.catalogs, records }));
    doc.setDocumentProperties({ title: `${store} - ${withCosts ? 'Inventario' : 'Catálogo'}`, creator: APP_NAME, subject: 'Catálogo de productos', keywords: 'minegocio7pro' });
    doc.addMetadata(`${PDF_MARK_START}${payload}${PDF_MARK_END}`, 'https://minegocio7pro.app/ns/');

    doc.save(`${fileSafe(sc.label)}_${withCosts ? 'inventario' : 'catalogo'}_${stamp()}.pdf`);
    toast(`✅ PDF descargado: ${sc.records.length} productos`);
    SoundEffects.play('success');
  } catch (e) {
    console.error(e);
    toast('Error al generar PDF: ' + (e as Error).message, 4000);
  }
}

// ==========================================
// IMPORTAR: convertir cualquier archivo en una lista para revisar
// ==========================================
const FIELD_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'producto', 'name', 'articulo', 'item', 'descripcioncorta', 'nombredelproducto'],
  brand: ['marca', 'brand', 'fabricante', 'laboratorio'],
  type: ['tipo', 'type', 'linea'],
  category: ['categoria', 'category', 'rubro', 'familia', 'subcategoria'],
  content_value: ['contenido', 'presentacion', 'tamano', 'tamanio', 'volumen', 'peso', 'medida', 'size', 'capacidad', 'cantidadcontenido'],
  content_unit: ['unidad', 'unit', 'um', 'unidaddemedida'],
  barcode: ['codigobarras', 'codigodebarras', 'codigo', 'barcode', 'ean', 'upc', 'sku', 'cod'],
  cost_price: ['costo', 'cost', 'preciocompra', 'preciodecompra', 'preciocosto'],
  sale_price: ['precioventamax', 'precioventa', 'preciodeventa', 'precio', 'price', 'pvp', 'precioventamaximo', 'preciounitario'],
  min_price: ['precioventamin', 'preciominimo', 'precioventaminimo', 'minimo', 'preciomin'],
  stock: ['stock', 'existencias', 'existencia', 'cantidad', 'qty', 'inventario', 'unidades'],
  description: ['descripcion', 'description', 'detalle', 'detalles', 'notas'],
  offer_text: ['oferta', 'promocion', 'promo', 'offer', 'descuento'],
  catalog: ['catalogo', 'catalog', 'catalogoid', 'coleccion', 'seccion'],
  image_url: ['imagen', 'imagenurl', 'image', 'imageurl', 'foto', 'fotourl', 'url'],
  id: ['id', 'identificador'],
};
const keyOf = (h: string) => normalize(h).replace(/[^a-z0-9]/g, '');
const ALIAS_LOOKUP = new Map<string, string>();
Object.entries(FIELD_ALIASES).forEach(([f, list]) => list.forEach(a => ALIAS_LOOKUP.set(a, f)));

/** "Bs 15,50", "$1.250,00", "15.5" → número */
export function parseNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^0-9,.-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const UNIT_RE = /(\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)?)\s*(ml|mililitros?|l|lt|lts|litros?|g|gr|grs|gramos?|kg|kilos?|mg|oz|onzas?|cm|mm|m|metros?|pulg|pulgadas?|u|und|unidades?)\b/i;
const UNIT_MAP: Record<string, string> = { mililitro: 'ml', mililitros: 'ml', l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', kilo: 'kg', kilos: 'kg', onza: 'oz', onzas: 'oz', metro: 'm', metros: 'm', pulgada: 'pulg', pulgadas: 'pulg', und: 'u', unidad: 'u', unidades: 'u' };
const normUnit = (u: string) => UNIT_MAP[u.toLowerCase()] || (u.toLowerCase() === 'l' ? 'L' : u.toLowerCase());

/** Separa "500 ml" en contenido y unidad */
export function splitContent(text: string): { value: string; unit: string } | null {
  const m = String(text || '').match(UNIT_RE);
  return m ? { value: m[1].replace(/\s+/g, ''), unit: normUnit(m[2]) } : null;
}

function draftFrom(obj: Record<string, unknown>): DraftProduct | null {
  const v: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    const f = ALIAS_LOOKUP.get(keyOf(k));
    if (f && v[f] === undefined && val !== null && val !== undefined && String(val).trim() !== '') v[f] = val;
  }
  const name = String(v.name ?? '').trim();
  if (!name) return null;
  let content_value = String(v.content_value ?? '').trim();
  let content_unit = String(v.content_unit ?? '').trim();
  if (content_value && !content_unit) { const sp = splitContent(content_value); if (sp) { content_value = sp.value; content_unit = sp.unit; } }
  if (!content_value) { const sp = splitContent(name); if (sp) { content_value = sp.value; content_unit = sp.unit; } }
  const sale = parseNumber(v.sale_price);
  return {
    _key: newId(), _include: true, _catalogName: v.catalog ? String(v.catalog).trim() : undefined,
    id: v.id ? String(v.id) : undefined,
    name, brand: String(v.brand ?? ''), type: String(v.type ?? ''), category: String(v.category ?? ''),
    content_value, content_unit: content_unit ? normUnit(content_unit) : '',
    barcode: String(v.barcode ?? '').replace(/\.0$/, ''), cost_price: parseNumber(v.cost_price), sale_price: sale,
    min_price: v.min_price !== undefined ? parseNumber(v.min_price) : sale,
    stock: v.stock !== undefined ? parseNumber(v.stock) : 1,
    description: String(v.description ?? ''), offer_text: String(v.offer_text ?? ''),
    image_url: typeof v.image_url === 'string' && /^(https?:|data:image)/.test(v.image_url) ? v.image_url : '',
  };
}

function openPreview(source: string, items: DraftProduct[], catalogs: Catalog[] = []) {
  if (items.length === 0) { toast('No se encontraron productos en el archivo'); SoundEffects.play('error'); return; }
  const current = getState().currentCatalogId;
  const hasNames = items.some(i => i._catalogName) || catalogs.length > 0;
  setState({
    importPreview: { source, items, catalogs, target: hasNames ? 'auto' : current || (getState().catalogs[0]?.id ?? 'new'), newCatalogName: 'Importados ' + new Date().toLocaleDateString('es') },
  });
  openModal('import-preview-modal');
}

async function parseJSONFile(file: File) {
  const data = JSON.parse(await file.text());
  const records: Product[] = Array.isArray(data) ? data : data.records || data.products || [];
  const catalogs: Catalog[] = Array.isArray(data) ? [] : data.catalogs || [];
  const items = records.map(r => {
    const d = (r.name ? { ...r } : draftFrom(r as unknown as Record<string, unknown>)) as DraftProduct | null;
    if (!d) return null;
    const cat = catalogs.find(c => c.id === r.catalog_id);
    return { ...d, _key: newId(), _include: true, _catalogName: cat?.name || (d as DraftProduct)._catalogName };
  }).filter(Boolean) as DraftProduct[];
  openPreview(file.name, items, catalogs);
}

async function parseCSVFile(file: File) {
  const text = (await file.text()).replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { toast('CSV vacío'); return; }
  const parse = (l: string) => sep === ',' ? parseCSVLine(l) : parseCSVLine(l.replace(/,/g, '\u0001').replace(/;/g, ',')).map(x => x.replace(/\u0001/g, ','));
  const headers = parse(lines[0]);
  const items = lines.slice(1).map(l => {
    const vals = parse(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i]; });
    return draftFrom(obj);
  }).filter(Boolean) as DraftProduct[];
  openPreview(file.name, items);
}

async function parseExcelFile(file: File) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets.find(w => w.rowCount > 1) || wb.worksheets[0];
      const headers: string[] = [];
      ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = String(cell.text || '').trim(); });
      // Imágenes incrustadas: fila → imagen
      const imagesByRow = new Map<number, string>();
      for (const im of ws.getImages()) {
        const media = wb.getImage(Number(im.imageId)) as unknown as { buffer?: ArrayBuffer; base64?: string; extension: string };
        const row = Math.floor(im.range.tl.nativeRow ?? im.range.tl.row) + 1;
        let b64 = media.base64 || '';
        if (!b64 && media.buffer) { const bytes = new Uint8Array(media.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); b64 = btoa(bin); }
        if (b64 && !imagesByRow.has(row)) imagesByRow.set(row, b64.startsWith('data:') ? b64 : `data:image/${media.extension === 'png' ? 'png' : 'jpeg'};base64,${b64}`);
      }
      const items: DraftProduct[] = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const obj: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          const h = headers[col];
          if (!h) return;
          const val = cell.value as unknown;
          obj[h] = val && typeof val === 'object' && 'result' in (val as object) ? (val as { result: unknown }).result
            : val && typeof val === 'object' && 'text' in (val as object) ? (val as { text: unknown }).text
            : val && typeof val === 'object' && 'richText' in (val as object) ? cell.text : val;
        });
        const d = draftFrom(obj);
        if (d) { const img = imagesByRow.get(n); if (img) d.image_url = img; items.push(d); }
      });
      openPreview(file.name, items);
      return;
    } catch (e) {
      console.warn('ExcelJS no pudo leer el archivo, se intenta con SheetJS', e);
    }
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  openPreview(file.name, rows.map(draftFrom).filter(Boolean) as DraftProduct[]);
}

// ---------- PDF ----------
async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

/** Lee líneas de texto tipo "Perfume Floral 100 ml ..... 45.00" */
export function parseTextLines(lines: string[]): DraftProduct[] {
  const SKIP = /^(precio|total|subtotal|pagina|página|catalogo|catálogo|producto|descripcion|descripción|cant|fecha|whatsapp|tel)/i;
  const PRICE_END = /(?:\$|bs\.?|usd|s\/\.?|€)?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})|\d+(?:[.,]\d{1,2})?)\s*(?:usd|bs\.?|\$)?\s*$/i;
  const out: DraftProduct[] = [];
  for (const raw of lines) {
    const line = raw.replace(/[|_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (line.length < 4 || SKIP.test(line)) continue;
    const m = line.match(PRICE_END);
    if (!m) continue;
    let name = line.slice(0, m.index).replace(/[.\-–—:·\s]+$/g, '').trim();
    if (!/[a-záéíóúñ]{3,}/i.test(name)) continue;
    const price = parseNumber(m[1]);
    if (!price) continue;
    const sp = splitContent(name);
    if (/^(cod|código|codigo)?\s*\d{6,}\s+/i.test(name)) name = name.replace(/^(cod|código|codigo)?\s*\d{6,}\s+/i, '');
    out.push({
      _key: newId(), _include: true, name, brand: '', type: '', category: '', sale_price: price, min_price: price, cost_price: 0, stock: 1,
      content_value: sp?.value || '', content_unit: sp?.unit || '', barcode: '', description: '', offer_text: '', image_url: '',
    });
  }
  return out;
}

async function pageImages(page: import('pdfjs-dist').PDFPageProxy, pdfjs: typeof import('pdfjs-dist')): Promise<string[]> {
  const ops = await page.getOperatorList();
  const names: string[] = [];
  ops.fnArray.forEach((fn, i) => { if (fn === pdfjs.OPS.paintImageXObject) names.push(ops.argsArray[i][0]); });
  const out: string[] = [];
  for (const name of names) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = await new Promise(res => { try { (page.objs.has(name) ? res(page.objs.get(name)) : page.objs.get(name, res)); } catch { res(null); } });
    if (!obj || !obj.width || obj.width < 40 || obj.height < 40) continue;
    const c = document.createElement('canvas');
    c.width = obj.width; c.height = obj.height;
    const ctx = c.getContext('2d')!;
    if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
    else if (obj.data) {
      const img = ctx.createImageData(obj.width, obj.height);
      const src = obj.data as Uint8ClampedArray;
      const per = src.length / (obj.width * obj.height);
      for (let p = 0, q = 0; p < obj.width * obj.height; p++) {
        if (per >= 3) { img.data[q++] = src[p * per]; img.data[q++] = src[p * per + 1]; img.data[q++] = src[p * per + 2]; }
        else { const g = src[p]; img.data[q++] = g; img.data[q++] = g; img.data[q++] = g; }
        img.data[q++] = per === 4 ? src[p * 4 + 3] : 255;
      }
      ctx.putImageData(img, 0, 0);
    } else continue;
    out.push(c.toDataURL('image/jpeg', 0.85));
  }
  return out;
}

async function parsePDFFile(file: File) {
  toast('Leyendo PDF...', 4000);
  const buf = await file.arrayBuffer();
  // 1) PDF creado por MiNegocio7pro: trae todos los datos y fotos
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  let raw = new TextDecoder('latin1').decode(new Uint8Array(buf));
  if (raw.indexOf(PDF_MARK_START) < 0) {
    try { raw = (await pdf.getMetadata()).metadata?.getRaw?.() || ''; } catch { raw = ''; }
  }
  const a = raw.indexOf(PDF_MARK_START);
  if (a > -1) {
    const b = raw.indexOf(PDF_MARK_END, a);
    try {
      const data = JSON.parse(b64ToUtf8(raw.slice(a + PDF_MARK_START.length, b).replace(/\s/g, '')));
      const catalogs: Catalog[] = data.catalogs || [];
      const items = (data.records as Product[]).map(r => ({ ...r, _key: newId(), _include: true, _catalogName: catalogs.find(c => c.id === r.catalog_id)?.name }));
      if (!data.withCosts) toast('PDF para clientes: no incluye costos ni stock', 3500);
      openPreview(file.name, items, catalogs);
      return;
    } catch (e) { console.warn('Datos del PDF dañados, se leerá el texto', e); }
  }
  // 2) Otro PDF: leer el texto (y las fotos si coinciden con los productos)
  const items: DraftProduct[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of tc.items as any[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: it.transform[4], s: it.str });
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(x => x.s).join(' '));
    const found = parseTextLines(lines);
    try {
      const imgs = await pageImages(page, pdfjs);
      if (imgs.length === found.length) found.forEach((d, i) => { d.image_url = imgs[i]; });
    } catch { /* sin imágenes */ }
    items.push(...found);
  }
  openPreview(file.name, items);
}

// ---------- Imágenes ----------
/** Varias fotos → un producto por foto (nombre tomado del archivo) */
export async function importPhotosAsProducts(files: FileList | File[]) {
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!list.length) return;
  toast(`Procesando ${list.length} fotos...`, 3000);
  const items: DraftProduct[] = [];
  for (const f of list) {
    const img = await autoFrameProduct(await compressImage(f));
    const base = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b(img|image|foto|photo|dsc|pxl|wa)\s*\d*/gi, '').replace(/\s+/g, ' ').trim();
    const sp = splitContent(base);
    items.push({
      _key: newId(), _include: true, name: base && /[a-z]{2,}/i.test(base) ? base.charAt(0).toUpperCase() + base.slice(1) : 'Producto sin nombre',
      brand: '', type: '', category: '', content_value: sp?.value || '', content_unit: sp?.unit || '', sale_price: 0, min_price: 0, cost_price: 0, stock: 1,
      barcode: '', description: '', offer_text: '', image_url: img,
    });
  }
  openPreview(`${list.length} fotos`, items);
}

let ocrWorker: Promise<import('tesseract.js').Worker> | null = null;
async function getOCR() {
  if (!ocrWorker) {
    ocrWorker = import('tesseract.js').then(T => T.createWorker(['spa', 'eng'], 1, {
      workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr/lang', gzip: true, workerBlobURL: false,
    }));
    ocrWorker.catch(() => { ocrWorker = null; });
  }
  return ocrWorker;
}

/** Lee el texto de una foto (ej. una lista de precios o la etiqueta de un producto) */
export async function readTextFromImage(src: Blob | string): Promise<string> {
  const worker = await getOCR();
  const { data } = await worker.recognize(src);
  return data.text || '';
}

/** Foto de una lista de precios → productos */
export async function importPriceListImage(file: File) {
  toast('Leyendo el texto de la imagen... (puede tardar unos segundos)', 6000);
  try {
    const text = await readTextFromImage(await compressImage(file, 2000, 0.9));
    const items = parseTextLines(text.split(/\r?\n/));
    if (!items.length) { toast('No se encontraron productos con precio en la imagen. Prueba con una foto más nítida.', 4000); return; }
    openPreview(file.name, items);
  } catch (e) {
    console.error(e);
    toast('No se pudo leer el texto de la imagen', 3500);
  }
}

/** Punto de entrada: detecta el formato y abre la revisión */
export async function importAnyFile(file: File) {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.json')) await parseJSONFile(file);
    else if (name.endsWith('.csv') || name.endsWith('.txt')) await parseCSVFile(file);
    else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) await parseExcelFile(file);
    else if (name.endsWith('.pdf')) await parsePDFFile(file);
    else if (file.type.startsWith('image/')) await importPriceListImage(file);
    else toast('Formato no soportado');
  } catch (e) {
    console.error(e);
    toast('Error al leer el archivo: ' + (e as Error).message, 4000);
    SoundEffects.play('error');
  }
}

// ==========================================
// CONFIRMAR IMPORTACIÓN
// ==========================================
export async function commitImport() {
  const pv = getState().importPreview;
  if (!pv) return 0;
  const s = getState();
  const catalogs = [...s.catalogs];
  const records = [...s.records];
  const newCatalogs: Catalog[] = [];
  const touched: Product[] = [];

  const findOrCreate = (name: string | undefined, source?: Catalog): string => {
    const n = (name || source?.name || '').trim();
    if (!n) return catalogs[0]?.id || createCat('General');
    const found = catalogs.find(c => normalize(c.name) === normalize(n) || c.id === source?.id);
    return found ? found.id : createCat(n, source);
  };
  const createCat = (name: string, src?: Catalog) => {
    const cat: Catalog = { id: 'cat_' + newId(), name, label: src?.label || name.toUpperCase().slice(0, 15), color: src?.color || '#7c43ba', cover: src?.cover || fallbackCover, favorite: false };
    catalogs.push(cat); newCatalogs.push(cat);
    return cat.id;
  };

  let targetId = pv.target;
  if (targetId === 'new') targetId = createCat(pv.newCatalogName.trim() || 'Importados');

  for (const d of pv.items.filter(i => i._include && i.name?.trim())) {
    const { _key, _catalogName, _include, ...rest } = d;
    void _key; void _include;
    const srcCat = pv.catalogs.find(c => c.id === rest.catalog_id);
    const catalog_id = targetId === 'auto' ? findOrCreate(_catalogName, srcCat) : targetId;
    const existingIdx = rest.id ? records.findIndex(r => r.id === rest.id) : -1;
    const product: Product = {
      name: '', brand: '', type: '', category: '', cost_price: 0, sale_price: 0, min_price: 0, stock: 1, sold: false, image_url: '',
      description: '', barcode: '', offer_text: '', content_value: '', content_unit: '',
      ...rest, id: existingIdx >= 0 ? rest.id! : (rest.id && !records.some(r => r.id === rest.id) ? rest.id : newId()), catalog_id,
    } as Product;
    if (existingIdx >= 0) records[existingIdx] = { ...records[existingIdx], ...product };
    else records.push(product);
    touched.push(product);
  }
  setState({ catalogs, records, importPreview: null });
  await DB.bulkUpsert(newCatalogs, touched);
  toast(`✅ Importados ${touched.length} productos${newCatalogs.length ? ` y ${newCatalogs.length} catálogos` : ''}`);
  SoundEffects.play('success');
  return touched.length;
}

