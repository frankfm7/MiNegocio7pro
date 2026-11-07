import QRCode from 'qrcode';
import type { Product, QrCodeItem } from '../types';
import type { PublicProductData } from '../store';
import { supabaseClient } from './supabase';
import { getState, toast } from '../store';
import { addToPendingChanges } from './db';
import { currency, formatContent, formatUSD, formatUSDShort, newId } from './format';
import { idbGet, idbSet, qrsKey } from './storage';
import { APP_NAME } from './constants';

// ==========================================
// QR DE PRODUCTOS
// ==========================================
// El QR guarda un ENLACE a la app: al escanearlo con la cámara del celular se
// abre MiNegocio7pro directamente en ese producto (no un texto suelto).
//   https://tu-app.vercel.app/?p=<id>&n=<nombre>&pr=<precio>...
// Si quien escanea no tiene acceso a la tienda, la app muestra la ficha pública
// con los datos del propio enlace. Nunca lleva costos ni ganancias.
// Para que los QR apunten siempre a tu dirección oficial (y no a una vista previa),
// define VITE_PUBLIC_URL en Vercel (ej. https://minegocio7pro.vercel.app).

const appOrigin = () => ((import.meta.env.VITE_PUBLIC_URL as string | undefined) || location.origin).replace(/\/+$/, '');

/**
 * Código corto del producto (8 dígitos), sale siempre igual para el mismo producto.
 * Va en el QR compacto y en el código de barras de las etiquetas cuando el producto
 * no tiene código de barras propio. Con pocos datos, los puntos del QR y las barras salen grandes.
 */
export function productShortCode(p: Pick<Product, 'id'>): string {
  let h = 2166136261;
  for (let i = 0; i < p.id.length; i++) { h ^= p.id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return String((h >>> 0) % 100000000).padStart(8, '0');
}

/** Busca un producto por su código corto */
export function findByShortCode(records: Product[], code: string) {
  const c = code.trim();
  return /^\d{8}$/.test(c) ? records.find(r => productShortCode(r) === c) : undefined;
}

/**
 * QR compacto (como el de las revistas): solo un enlace corto con el código del producto,
 * ej. https://minegocio7pro.vercel.app/?q=12345678.3f9a1c
 * Al escanearlo se abre la ficha ACTUAL del producto (nombre y precio al día, aunque la
 * etiqueta se haya impreso hace meses). Los QR antiguos (enlace largo) siguen funcionando.
 */
/** Texto apto para el modo alfanumérico del QR: MAYÚSCULAS sin tildes, solo letras, números, espacio y . - / */
const qrSafe = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/,/g, '.').replace(/[^0-9A-Z .\-/]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Contenido del QR del producto: TEXTO, no un enlace. Con la cámara de cualquier celular solo se
 * ve "PERFUME FLORAL - ESIKA - 100 ML - REF 12345678" (nombre, empresa y contenido, sin abrir nada).
 * Dentro de la app, el escáner usa el número REF para abrir el producto al instante.
 * Va en mayúsculas sin tildes para que el QR quede chico (25 a 29 cuadritos por lado).
 */
export function generateProductQRText(p: Product): string {
  let name = qrSafe(p.name) || 'PRODUCTO';
  if (name.length > 30) name = name.slice(0, 30).replace(/\s+\S*$/, '') || name.slice(0, 30);
  const parts = [name, qrSafe(p.brand || ''), qrSafe(formatContent(p))].filter(Boolean);
  return `${parts.join(' - ')} - REF ${productShortCode(p)}`;
}

/** Lee un QR de texto "NOMBRE - EMPRESA - 100 ML - REF 12345678" */
export function shortFromText(t: string): { code: string; label: string } | null {
  const m = /^(.*?)\s*-?\s*REF\s+(\d{8})\s*$/i.exec(t.trim());
  return m ? { code: m[2], label: m[1].replace(/\s*-\s*$/, '') } : null;
}

/** Código corto de un enlace /Q/12345678 */
export function shortFromPath(pathname: string): { code: string; store?: string } | null {
  const m = /^\/q\/(\d{8})\/?$/i.exec(pathname || '');
  return m ? { code: m[1] } : null;
}

/** Enlace largo con los datos del producto (para compartir por mensaje, no para imprimir) */
export function generateProductLinkFull(p: Product): string {
  const q = new URLSearchParams();
  q.set('p', p.id);
  q.set('n', p.name);
  if (p.brand) q.set('b', p.brand);
  const content = formatContent(p);
  if (content) q.set('c', content);
  q.set('pr', formatUSD(p.sale_price));
  if (p.offer_text) q.set('o', p.offer_text);
  const st = getState().activeStore;
  const storeName = st?.store_name || getState().contactInfo?.business;
  if (storeName) q.set('s', storeName);
  if (st?.store_id) q.set('t', st.store_id);
  return `${appOrigin()}/?${q.toString()}`;
}

/** Datos de un QR compacto (?q=12345678.3f9a1c) */
export function shortFromParams(q: URLSearchParams): { code: string; store?: string } | null {
  const m = /^(\d{8})(?:\.([0-9a-f]{4,12}))?$/i.exec(q.get('q') || '');
  return m ? { code: m[1], store: m[2]?.toLowerCase() } : null;
}

const b64decode = (s: string) => {
  const raw = atob(s);
  try { return decodeURIComponent(escape(raw)); } catch { return raw; }
};

/** Datos públicos de un enlace de producto (?p=...). Devuelve null si no lo es */
export function publicFromParams(q: URLSearchParams): PublicProductData | null {
  const id = q.get('p');
  if (!id) return null;
  return { id, n: q.get('n') || 'Producto', b: q.get('b') || undefined, cv: q.get('c') || undefined, p: q.get('pr') || undefined, o: q.get('o') || undefined, s: q.get('s') || undefined };
}

/** Lee un QR de producto: enlace nuevo, texto con "Ref: MC7:" o el formato antiguo "CATPRO:" */
export function decodeProductQR(text: string): { id: string | null; public: PublicProductData; storeId?: string; short?: string; storePrefix?: string } | null {
  const t = text.trim();
  const st = shortFromText(t);
  if (st) {
    const hit = findByShortCode(getState().records, st.code);
    const [n, b, cv] = st.label.split(' - ');
    return { id: hit?.id || null, public: { id: hit?.id || '', n: hit?.name || n || 'Producto', b, cv }, short: st.code };
  }
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const sh = shortFromPath(u.pathname) || shortFromParams(u.searchParams);
      if (sh) {
        const hit = findByShortCode(getState().records, sh.code);
        return { id: hit?.id || null, public: { id: hit?.id || '', n: hit?.name || 'Producto' }, short: sh.code, storePrefix: sh.store };
      }
      const pub = publicFromParams(u.searchParams);
      if (pub && u.searchParams.get('n')) return { id: pub.id!, public: pub, storeId: u.searchParams.get('t') || undefined };
    } catch { /* no es un enlace válido */ }
    return null;
  }
  if (t.startsWith('CATPRO:')) {
    try {
      const decoded = JSON.parse(b64decode(t.substring(7)));
      const priv = JSON.parse(b64decode(decoded.priv));
      return { id: String(priv.id), public: decoded.pub };
    } catch { return null; }
  }
  const ref = t.match(/(?:^|\n)\s*Ref:\s*MC7:([^\s]+)\s*$/i);
  if (!ref) return null;
  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const get = (label: string) => lines.find(l => l.toLowerCase().startsWith(label.toLowerCase() + ':'))?.slice(label.length + 1).trim();
  return {
    id: ref[1],
    public: { id: ref[1], n: lines[0], b: get('Marca'), cv: get('Contenido'), p: get('Precio'), o: get('Oferta'), s: get('Tienda') },
  };
}

export async function generateProductQRImage(product: Product, size = 300) {
  const text = generateProductQRText(product);
  // Corrección de errores "M" si no agranda el QR; si lo agranda, "L" (como las revistas) para que los puntos sean grandes
  const level = QRCode.create(text, { errorCorrectionLevel: 'M' }).version <= QRCode.create(text, { errorCorrectionLevel: 'L' }).version ? 'M' : 'L';
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: level, color: { dark: '#000000', light: '#ffffff' } });
}

const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function printProductQR(product: Product, qrSrc: string) {
  const w = window.open('', '', 'width=420,height=640');
  if (!w) { toast('Permite las ventanas emergentes para imprimir'); return; }
  const content = formatContent(product);
  w.document.write(`<html><head><title>QR - ${escapeHtml(product.name)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:20px}img{width:260px;margin:12px 0}h2{margin:8px 0}p{margin:4px 0;color:#555}</style></head>
    <body><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.brand)}${content ? ' · ' + escapeHtml(content) : ''}</p><img src="${qrSrc}" alt="QR"><p><strong>${formatUSD(product.sale_price)}</strong></p>
    <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

/**
 * PDF listo para imprimir con los QR de un catálogo (o de todos):
 * 4 columnas x 6 filas por hoja A4, con nombre, contenido y precio.
 */
export async function exportCatalogQRsPDF(catalogId: string | null) {
  const { records, catalogs } = getState();
  const products = (catalogId ? records.filter(r => r.catalog_id === catalogId) : records)
    .slice().sort((a, b) => a.name.localeCompare(b.name));
  if (products.length === 0) { toast('No hay productos para generar QR'); return; }
  toast(`Generando ${products.length} códigos QR...`, 4000);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cat = catalogId ? catalogs.find(c => c.id === catalogId) : null;
  const title = cat ? cat.name : 'Todos los productos';
  // 4 por fila (antes 3); el tamaño del QR es el mismo que se eligió en Etiquetas (1,5 cm por defecto)
  const cols = 4, rows = 6, marginX = 10, marginTop = 18, cellW = (210 - marginX * 2) / cols, cellH = (297 - marginTop - 10) / rows;
  const qrMm = Number(localStorage.getItem('mn7_label_qrmm')) || 15;
  const header = (page: number) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(124, 67, 186);
    doc.text(`${title} · Códigos QR`, marginX, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(`${APP_NAME} · Página ${page}`, 200, 11, { align: 'right' });
  };
  let page = 1;
  header(page);
  for (let i = 0; i < products.length; i++) {
    const slot = i % (cols * rows);
    if (i > 0 && slot === 0) { doc.addPage(); page++; header(page); }
    const p = products[i];
    const x = marginX + (slot % cols) * cellW;
    const y = marginTop + Math.floor(slot / cols) * cellH;
    doc.setDrawColor(220, 210, 230); doc.setLineDashPattern([1.5, 1.5], 0);
    doc.roundedRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3, 3, 3);
    doc.setLineDashPattern([], 0);
    const qrSize = Math.min(qrMm, cellW - 8, cellH - 20);
    doc.addImage(await generateProductQRImage(p, 360), 'PNG', x + (cellW - qrSize) / 2, y + 5, qrSize, qrSize, undefined, 'FAST');
    let ty = y + 7 + qrSize;
    doc.setTextColor(32, 23, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const nameLines = doc.splitTextToSize(p.name, cellW - 8).slice(0, 2);
    doc.text(nameLines, x + cellW / 2, ty + 2, { align: 'center' });
    ty += nameLines.length * 3.8 + 1;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 100, 120);
    const sub = [p.brand, formatContent(p)].filter(Boolean).join(' · ');
    if (sub) { doc.text(doc.splitTextToSize(sub, cellW - 8)[0], x + cellW / 2, ty + 2, { align: 'center' }); ty += 3.6; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(124, 67, 186);
    doc.text(`${formatUSDShort(p.sale_price)} ${currency()}`, x + cellW / 2, ty + 3, { align: 'center' });
  }
  doc.save(`codigos_qr_${(cat?.name || 'todos').replace(/[^a-z0-9]+/gi, '_')}.pdf`);
  toast(`✅ PDF con ${products.length} códigos QR listo para imprimir`);
}

// ==========================================
// QR DE COBRO
// ==========================================
// En modo local se guardan en el dispositivo; en una tienda, en la tabla qrs.
const QR_TABLE = 'qrs';
const isCloud = () => getState().mode === 'cloud' && !!getState().activeStore && !!supabaseClient;
const localList = () => idbGet<QrCodeItem[]>(qrsKey(isCloud() ? getState().activeStore!.store_id : 'local'), []);
const saveList = (list: QrCodeItem[]) => idbSet(qrsKey(isCloud() ? getState().activeStore!.store_id : 'local'), list);

export async function loadUserQRs(): Promise<QrCodeItem[]> {
  const { currentUser, isOnline } = getState();
  if (!isCloud()) return localList();
  if (!isOnline) return (await localList()).filter(q => q.user_id === currentUser.id);
  try {
    const { data, error } = await supabaseClient!.from(QR_TABLE).select('*')
      .eq('store_id', getState().activeStore!.store_id).eq('user_id', currentUser.id).order('is_primary', { ascending: false });
    if (error) throw error;
    await saveList((data || []) as QrCodeItem[]);
    return (data || []) as QrCodeItem[];
  } catch {
    return (await localList()).filter(q => q.user_id === currentUser.id);
  }
}

/** QR principal del dueño de la tienda (lo ven los vendedores) */
export async function loadOwnerPrimaryQR(): Promise<QrCodeItem | null> {
  if (!isCloud() || !getState().isOnline) return null;
  try {
    const sid = getState().activeStore!.store_id;
    // Con el archivo 10: el QR del dueño de verdad (no el de un administrador)
    const rpc = await supabaseClient!.rpc('owner_payment_qr', { p_store: sid });
    if (!rpc.error) return (rpc.data as QrCodeItem) || null;
    const { data } = await supabaseClient!.from(QR_TABLE).select('*')
      .eq('store_id', sid).eq('role_owner', true).eq('is_primary', true).limit(1).maybeSingle();
    return (data as QrCodeItem) || null;
  } catch { return null; }
}

export async function createQR(image: string, label: string, isPrimary: boolean) {
  const { currentUser } = getState();
  const qr: QrCodeItem = {
    id: 'qr_' + newId(), user_id: currentUser.id, image, label: label || 'Mi QR', is_primary: isPrimary,
    role_owner: currentUser.role === 'admin',
  };
  await saveList([...(await localList()), qr]);
  if (isCloud()) {
    const row = { ...qr, store_id: getState().activeStore!.store_id };
    if (!getState().isOnline) addToPendingChanges('createQR', row);
    else {
      const { error } = await supabaseClient!.from(QR_TABLE).insert([row]);
      if (error) { console.error(error); addToPendingChanges('createQR', row); }
    }
  }
  return qr;
}

export async function updateQR(id: string, updates: Partial<QrCodeItem>) {
  await saveList((await localList()).map(q => (q.id === id ? { ...q, ...updates } : q)));
  if (isCloud()) {
    const { error } = getState().isOnline ? await supabaseClient!.from(QR_TABLE).update(updates).eq('id', id) : { error: 'offline' };
    if (error) addToPendingChanges('updateQR', { id, updates });
  }
  return true;
}

export async function deleteQRById(id: string) {
  await saveList((await localList()).filter(q => q.id !== id));
  if (isCloud()) {
    const { error } = getState().isOnline ? await supabaseClient!.from(QR_TABLE).delete().eq('id', id) : { error: 'offline' };
    if (error) addToPendingChanges('deleteQR', id);
  }
  return true;
}

export async function setPrimaryQR(id: string) {
  const list = await localList();
  for (const q of list) if (q.is_primary && q.id !== id) await updateQR(q.id, { is_primary: false });
  await updateQR(id, { is_primary: true });
  return true;
}
