import QRCode from 'qrcode';
import type { Product, QrCodeItem } from '../types';
import type { PublicProductData } from '../store';
import { supabaseClient } from './supabase';
import { getState, toast } from '../store';
import { addToPendingChanges } from './db';
import { formatContent, formatUSD, formatUSDShort, newId } from './format';
import { idbGet, idbSet, qrsKey } from './storage';
import { APP_NAME } from './constants';

// ==========================================
// QR DE PRODUCTOS
// ==========================================
// El QR guarda TEXTO normal: cualquier lector de QR (cámara del celular,
// Google Lens, etc.) muestra solo la información pública del producto.
// Nunca lleva costos ni ganancias. La última línea "Ref: MC7:<id>" permite
// que MiNegocio7pro encuentre el producto al instante.

const REF_PREFIX = 'MC7:';

export function generateProductQRText(p: Product): string {
  const lines = [p.name];
  if (p.brand) lines.push(`Marca: ${p.brand}`);
  const content = formatContent(p);
  if (content) lines.push(`Contenido: ${content}`);
  if (p.type || p.category) lines.push([p.type, p.category].filter(Boolean).join(' · '));
  lines.push(`Precio: ${formatUSD(p.sale_price)}`);
  if (p.offer_text) lines.push(`Oferta: ${p.offer_text}`);
  if (p.description) lines.push(p.description.length > 90 ? p.description.slice(0, 87) + '...' : p.description);
  const store = getState().activeStore?.store_name || getState().contactInfo?.business;
  if (store) lines.push(`Tienda: ${store}`);
  lines.push(`Ref: ${REF_PREFIX}${p.id}`);
  return lines.join('\n');
}

const b64decode = (s: string) => {
  const raw = atob(s);
  try { return decodeURIComponent(escape(raw)); } catch { return raw; }
};

/** Lee un QR de producto (formato nuevo o el antiguo "CATPRO:") */
export function decodeProductQR(text: string): { id: string | null; public: PublicProductData } | null {
  const t = text.trim();
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
  return QRCode.toDataURL(generateProductQRText(product), { width: size, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#201728', light: '#ffffff' } });
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
 * 3 columnas x 4 filas por hoja A4, con nombre, contenido y precio.
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
  const cols = 3, rows = 4, marginX = 10, marginTop = 18, cellW = (210 - marginX * 2) / cols, cellH = (297 - marginTop - 10) / rows;
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
    const qrSize = Math.min(cellW - 18, cellH - 30);
    doc.addImage(await generateProductQRImage(p, 360), 'PNG', x + (cellW - qrSize) / 2, y + 4, qrSize, qrSize, undefined, 'FAST');
    let ty = y + 6 + qrSize;
    doc.setTextColor(32, 23, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const nameLines = doc.splitTextToSize(p.name, cellW - 8).slice(0, 2);
    doc.text(nameLines, x + cellW / 2, ty + 2, { align: 'center' });
    ty += nameLines.length * 3.8 + 1;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 100, 120);
    const sub = [p.brand, formatContent(p)].filter(Boolean).join(' · ');
    if (sub) { doc.text(doc.splitTextToSize(sub, cellW - 8)[0], x + cellW / 2, ty + 2, { align: 'center' }); ty += 3.6; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(124, 67, 186);
    doc.text(`${formatUSDShort(p.sale_price)} USD`, x + cellW / 2, ty + 3, { align: 'center' });
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
    const { data } = await supabaseClient!.from(QR_TABLE).select('*')
      .eq('store_id', getState().activeStore!.store_id).eq('role_owner', true).eq('is_primary', true).limit(1).maybeSingle();
    return (data as QrCodeItem) || null;
  } catch { return null; }
}

export async function createQR(image: string, label: string, isPrimary: boolean) {
  const { currentUser } = getState();
  const qr: QrCodeItem = {
    id: 'qr_' + newId(), user_id: currentUser.id, image, label: label || 'Mi QR', is_primary: isPrimary,
    role_owner: currentUser.role === 'admin' || currentUser.role === 'coadmin',
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
