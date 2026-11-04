import type { Product, ReceiptData, Sale, View } from './types';
import { closeModal, getState, openAccount, openModal, setState, toast, type ModalId } from './store';
import { SoundEffects } from './lib/sound';
import { DB, attachReceipt, issueReceipt, syncPendingChanges } from './lib/db';
import { formatContent, formatUSD } from './lib/format';
import { decodeProductQR, publicFromParams } from './lib/qr';
import { openStore } from './lib/session';
import { businessName, openWhatsApp } from './lib/whatsapp';
import { esc, htmlToImage } from './lib/htmlImage';
import { buildCashSummary, dateKeyOf, todayKey } from './lib/cashClose';
import { APP_NAME, WELCOME_KEY } from './lib/constants';
import { searchProducts } from './lib/search';

/** true si el usuario es administrador; si no, avisa que no tiene permiso */
function requireAdmin() {
  if (getState().isAdmin()) return true;
  toast('Solo los administradores de la tienda pueden hacer esto');
  return false;
}

export function navigate(view: View, catalogId: string | null = null) {
  setState({ currentView: view, currentCatalogId: view === 'products' ? catalogId : null, query: '', sidebarOpen: false });
  window.scrollTo(0, 0);
}

export function openCatalog(id: string) { navigate('products', id); }

export function goBack() {
  setState({ currentView: 'catalogs', currentCatalogId: null, query: '', globalQuery: '' });
  window.scrollTo(0, 0);
}

/** Abre un modal de administración (equipo, respaldos...) */
export function openAdminModal(id: ModalId) {
  if (!requireAdmin()) return false;
  openModal(id);
  SoundEffects.play('click');
  return true;
}

/** Equipo e invitaciones: necesitan una tienda en la nube */
export function openTeam() {
  const s = getState();
  if (s.mode !== 'cloud') {
    openAccount('Para tener vendedores crea tu tienda en la nube (tus datos de este dispositivo se pueden subir)');
    return;
  }
  openAdminModal('team-modal');
}

export function enterStore() {
  try { sessionStorage.setItem(WELCOME_KEY, 'true'); } catch { /* modo privado */ }
  setState({ welcomeVisible: false, currentView: 'catalogs', currentCatalogId: null });
  SoundEffects.play('success');
}

export function showWelcome() {
  try { sessionStorage.removeItem(WELCOME_KEY); } catch { /* modo privado */ }
  setState({ welcomeVisible: true, sidebarOpen: false });
}

export function toggleDarkMode() {
  const darkMode = !getState().darkMode;
  setState({ darkMode });
  localStorage.setItem('dark_mode', String(darkMode));
  toast(darkMode ? 'Modo oscuro 🌙' : 'Modo claro ☀️');
  SoundEffects.play('click');
}

export function toggleSound() {
  const soundEnabled = !getState().soundEnabled;
  setState({ soundEnabled });
  localStorage.setItem('sound_enabled', String(soundEnabled));
  toast(soundEnabled ? '🔊 Sonido activado' : '🔇 Sonido silenciado');
  if (soundEnabled) SoundEffects.play('click');
}

export function toggleClientMode() {
  const clientMode = !getState().clientMode;
  setState({ clientMode });
  toast(clientMode ? 'Modo cliente activado.' : 'Modo dueño activado.');
  SoundEffects.play('click');
}

// ==========================================
// CARRITO
// ==========================================
export function addCart(r: Product) {
  if (Number(r.stock) < 1) { toast('Este producto está agotado.'); SoundEffects.play('error'); return; }
  const cart = getState().cart.map(l => ({ ...l }));
  const line = cart.find(x => x.id === r.id);
  if (line) {
    if (line.qty < r.stock) { line.qty++; toast(`Cantidad: ${line.qty}`); } else toast('Stock máximo.');
  } else {
    cart.push({ id: r.id, qty: 1 });
    toast('Añadido al pedido ✓');
    SoundEffects.play('success');
  }
  setState({ cart });
}

export function sendCartWhatsApp() {
  const { cart, records } = getState();
  if (cart.length === 0) return;
  let msg = '🛒 *NUEVO PEDIDO*\n\n';
  let total = 0;
  cart.forEach(line => {
    const r = records.find(x => x.id === line.id);
    if (!r) return;
    const sub = Number(r.sale_price) * line.qty;
    total += sub;
    const content = formatContent(r);
    msg += `▪️ ${line.qty}x ${r.name}${content ? ` (${content})` : ''}\n   ${formatUSD(sub)}\n`;
  });
  msg += `\n*TOTAL: ${formatUSD(total)}*`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// ==========================================
// PRODUCTOS
// ==========================================
export function openDetail(r: Product) {
  setState({ detail: r });
  openModal('detail-modal');
  SoundEffects.play('click');
}

export function openSaleModal(r: Product) {
  if (Number(r.stock) < 1) { toast('No hay stock disponible'); SoundEffects.play('error'); return; }
  setState({ saleProduct: r, selectedPaymentMethod: 'Efec.' });
  openModal('sale-modal');
}

export function openForm(r: Product | null = null) {
  if (!requireAdmin()) return;
  setState({ editing: r, formOpen: true, scannedBarcodeForForm: null });
}
export function closeForm() { setState({ formOpen: false }); }

export function openCatalogForm(id: string | null = null) {
  if (!requireAdmin()) return;
  setState({ modals: { 'catalog-modal': true }, editingCatalogId: id });
}

export async function duplicateProduct(r: Product) {
  const { id: _omit, ...rest } = r;
  void _omit;
  await DB.createRecord({ ...rest, name: r.name + ' (copia)' });
  toast('Duplicado ✓');
}

export async function deleteProduct(r: Product) {
  if (!confirm('¿Eliminar?')) return;
  await DB.deleteRecord(r.id);
  closeModal('detail-modal');
  toast('Eliminado');
}

export async function clearCatalogProducts(catalogId: string) {
  const { catalogs, records } = getState();
  const cat = catalogs.find(c => c.id === catalogId);
  const ids = records.filter(r => r.catalog_id === catalogId).map(r => r.id);
  if (ids.length === 0) { toast('No hay productos para eliminar'); return; }
  if (!confirm(`¿Eliminar los ${ids.length} productos de "${cat?.name}"?`)) return;
  await DB.deleteMultipleRecords(ids);
  toast(`${ids.length} productos eliminados ✓`);
  SoundEffects.play('success');
}

export async function deleteCatalogWithConfirm(catalogId: string) {
  const { catalogs, records, currentCatalogId } = getState();
  const cat = catalogs.find(c => c.id === catalogId);
  const count = records.filter(r => r.catalog_id === catalogId).length;
  if (!confirm(`¿Eliminar "${cat?.name}" y sus ${count} productos?`)) return;
  await DB.deleteCatalog(catalogId);
  if (currentCatalogId === catalogId) setState({ currentCatalogId: null, currentView: 'catalogs' });
  closeModal('catalog-modal');
  toast('Catálogo eliminado');
  SoundEffects.play('success');
}

export function shareCatalogByLink(catalogId: string) {
  const { catalogs, records } = getState();
  const cat = catalogs.find(c => c.id === catalogId);
  if (!cat) return;
  const products = records.filter(r => r.catalog_id === catalogId);
  if (products.length === 0) { toast('Este catálogo no tiene productos'); return; }
  let text = `🛍️ *${cat.name}*\n\n`;
  products.forEach(p => {
    if (Number(p.stock) > 0) {
      const content = formatContent(p);
      text += `▪️ *${p.name}* (${p.brand})${content ? ` · ${content}` : ''}\n   ${formatUSD(p.sale_price)}\n`;
      if (p.offer_text) text += `   🏷️ ${p.offer_text}\n`;
      if (p.description) text += `   ${p.description}\n`;
      text += '\n';
    }
  });
  text += `📱 _Catálogo compartido desde ${APP_NAME}_`;
  setState({ share: { text, catalog: cat } });
  openModal('share-catalog-modal');
}

// ==========================================
// VENTA INDIVIDUAL
// ==========================================
/** Valida el cliente cuando el pago es "Fiado". Devuelve el cliente o null (con aviso) */
function fiadoCustomer(method: string) {
  if (method !== 'Fiado') return undefined;
  const { saleCustomerId, customers } = getState();
  const c = customers.find(x => x.id === saleCustomerId);
  if (!c) { toast('Elige a qué cliente se le fía'); SoundEffects.play('error'); return null; }
  return c;
}

export async function confirmSale(qty: number, unitPrice: number) {
  const { saleProduct: r, selectedPaymentMethod, currentUser } = getState();
  if (!r) return false;
  if (isNaN(unitPrice) || unitPrice <= 0) { toast('Ingresa un precio válido'); SoundEffects.play('error'); return false; }
  if (r.stock < qty) { toast('No hay suficiente stock'); SoundEffects.play('error'); return false; }
  const method = selectedPaymentMethod || 'Efec.';
  const customer = fiadoCustomer(method);
  if (customer === null) return false;
  const profit = (unitPrice - Number(r.cost_price)) * qty;
  try {
    const sale = await DB.addSale({
      product_id: r.id, product_name: r.name, brand: r.brand || '', catalog_id: r.catalog_id || '',
      cost_price: Number(r.cost_price), actual_price: unitPrice * qty, unit_price: unitPrice, profit, quantity: qty,
      payment_method: method,
      seller_id: currentUser ? currentUser.id : 'unknown', seller_name: currentUser ? currentUser.name : 'Desconocido',
      customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
    });
    if (customer) await DB.addMovement({ customer_id: customer.id, type: 'fiado', amount: unitPrice * qty, method: 'Fiado', sale_id: sale.id, note: `${qty}x ${r.name}` });
    const rc = await issueReceipt([sale.id], unitPrice * qty);
    closeModal('sale-modal');
    closeModal('detail-modal');
    setState({
      saleCustomerId: '',
      receiptData: {
        number: rc.number, provisional: rc.provisional,
        date: new Date().toLocaleString('es'), seller: currentUser ? currentUser.name : 'Desconocido', payment: method,
        customer: customer ? { name: customer.name, phone: customer.phone } : null,
        items: [{ product: r, quantity: qty, price: unitPrice }], subtotal: unitPrice * qty, discount: 0, total: unitPrice * qty,
      },
    });
    openModal('sale-receipt-modal');
    toast(`¡Venta registrada! ${qty}x ${r.name}${customer ? ` · fiado a ${customer.name}` : ''} 🎉`, 3000);
    SoundEffects.play('success');
    return true;
  } catch (e) {
    console.error('❌ Error al procesar la venta:', e);
    toast('❌ Error al registrar la venta');
    return false;
  }
}

// ==========================================
// ESCÁNER DE CÓDIGOS
// ==========================================
export function openBarcodeScanner(target: 'form' | 'quick-scan' | null = null) {
  setState({ barcodeScanTarget: target });
  openModal('barcode-scanner-modal');
}

/** Busca el producto de un código leído (QR de la app, código de barras o texto) */
export function findProductByCode(code: string) {
  const { records } = getState();
  const text = code.trim();
  const qr = decodeProductQR(text);
  let product = qr?.id ? records.find(r => r.id === qr.id) : undefined;
  if (!product) product = records.find(r => r.barcode && r.barcode.trim() === text);
  // QR de otro dispositivo/tienda: intentar por nombre
  if (!product && qr?.public.n) {
    const hits = searchProducts(records, [qr.public.n, qr.public.b, qr.public.cv].filter(Boolean).join(' '));
    if (hits.length === 1) product = hits[0];
  }
  return { product, qr };
}

/** Devuelve true si el escáner debe seguir activo */
export function handleBarcodeScanned(code: string): boolean {
  const { quickScanMode, barcodeScanTarget } = getState();

  if (barcodeScanTarget === 'form') {
    setState({ scannedBarcodeForForm: code.trim(), barcodeScanTarget: null });
    toast(`Código: ${code}`);
    closeModal('barcode-scanner-modal');
    return false;
  }

  const { product, qr } = findProductByCode(code);

  if (quickScanMode || barcodeScanTarget === 'quick-scan') {
    if (product) addToQuickScan(product, 1);
    else toast(qr ? `"${qr.public.n}" no está en tus catálogos` : `Producto no encontrado: ${code}`, 3000);
    return true;
  }

  closeModal('barcode-scanner-modal');
  if (product) {
    toast(`Producto: ${product.name}`);
    openDetail(product);
  } else if (qr) {
    // QR de un producto que no está en esta tienda: mostrar su información pública
    setState({ publicProduct: qr.public });
    openModal('public-product-modal');
  } else if (getState().isAdmin() && confirm(`Código "${code}" no encontrado.\n\n¿Crear un producto nuevo con este código?`)) {
    openForm();
    setState({ scannedBarcodeForForm: code.trim() });
  } else if (!getState().isAdmin()) toast(`Código "${code}" no encontrado`, 3000);
  return false;
}

/**
 * Enlace de un QR (?p=<id>...): abre el producto dentro de la app.
 * - Si está en tus datos, abre su ficha completa.
 * - Si es de otra tienda de la que eres miembro, cambia a esa tienda y lo abre.
 * - Si no tienes acceso, muestra la ficha pública que viene en el enlace.
 */
export async function openProductFromLink(q: URLSearchParams) {
  const pub = publicFromParams(q);
  if (!pub?.id) return;
  setState({ welcomeVisible: false, currentView: 'catalogs', currentCatalogId: null });
  const find = () => getState().records.find(r => r.id === pub.id);
  let product = find();
  const sid = q.get('t');
  const s = getState();
  if (!product && sid && s.activeStore?.store_id !== sid) {
    const m = s.memberships.find(x => x.store_id === sid && x.status !== 'blocked');
    if (m) { await openStore(m); product = find(); }
  }
  if (product) { openDetail(product); return; }
  setState({ publicProduct: pub });
  openModal('public-product-modal');
}

// ==========================================
// LISTA DE VENTAS (ESCANEO RÁPIDO)
// ==========================================
export function startQuickScanMode() {
  // Si ya hay una venta en curso, se retoma (no se borra)
  const s = getState();
  if (!s.quickScanItems.length && !s.receiptCarry) setState({ quickScanDiscount: 0 });
  setState({ quickScanMode: true });
  openModal('quick-scan-modal');
}

/** Cierra la lista sin borrar la venta en curso (queda el botón flotante "Finalizar venta") */
export function hideQuickScan() {
  closeModal('quick-scan-modal');
  setState({ barcodeScanTarget: null });
}

/** Descarta la venta en curso (pregunta si hay productos) */
export function stopQuickScanMode(ask = true) {
  const s = getState();
  if (ask && (s.quickScanItems.length || s.receiptCarry) && !confirm('¿Descartar la venta en curso? Los productos que agregaste se quitarán de la lista (lo ya cobrado no cambia).')) return;
  setState({ quickScanMode: false, quickScanItems: [], quickScanDiscount: 0, barcodeScanTarget: null, receiptCarry: null });
  closeModal('quick-scan-modal');
}

/** Desde "Registrar venta": agrega el producto a la venta en curso y vuelve al catálogo */
export function addToCurrentSale(product: Product, quantity: number, price: number) {
  if (isNaN(price) || price <= 0) { toast('Ingresa un precio válido'); SoundEffects.play('error'); return false; }
  const items = getState().quickScanItems.map(i => ({ ...i }));
  const inList = items.filter(i => i.product.id === product.id).reduce((a, i) => a + i.quantity, 0);
  if (Number(product.stock) < inList + quantity) { toast('No hay suficiente stock'); SoundEffects.play('error'); return false; }
  const same = items.find(i => i.product.id === product.id && i.price === price);
  if (same) same.quantity += quantity; else items.push({ product, quantity, price });
  setState({ quickScanItems: items, quickScanMode: true });
  closeModal('sale-modal');
  closeModal('detail-modal');
  SoundEffects.play('success');
  toast(`🛒 Agregado a la venta: ${quantity} x ${product.name}`, 2200);
  return true;
}

/** Desde el recibo: seguir vendiendo al mismo cliente; al finalizar sale un solo recibo con todo */
export function addMoreToReceipt() {
  const r = getState().receiptData;
  if (!r) return;
  setState({ receiptCarry: r, quickScanItems: [], quickScanDiscount: 0, quickScanMode: true });
  closeModal('sale-receipt-modal');
  // Volver al catálogo donde estaba (o a la lista de catálogos)
  const view = getState().currentView;
  if (view !== 'products' && view !== 'catalogs') navigate(getState().currentCatalogId ? 'products' : 'catalogs', getState().currentCatalogId);
  toast('Elige el producto → Vender → Agregar a la venta', 3000);
}

export function addToQuickScan(product: Product, quantity = 1) {
  const items = getState().quickScanItems.map(i => ({ ...i }));
  const existing = items.find(i => i.product.id === product.id);
  if (existing) existing.quantity += quantity;
  else items.push({ product, quantity, price: product.sale_price });
  setState({ quickScanItems: items });
  SoundEffects.play('success');
  toast(`${product.name} agregado`);
}

export async function finalizeQuickScan() {
  const { quickScanItems, quickScanDiscount, currentUser, selectedPaymentMethod, receiptCarry } = getState();
  if (!quickScanItems.length && receiptCarry) {
    // No se agregó nada: se vuelve al recibo anterior
    setState({ receiptData: receiptCarry, receiptCarry: null, quickScanMode: false });
    closeModal('quick-scan-modal'); openModal('sale-receipt-modal');
    return;
  }
  if (!quickScanItems.length) { toast('No hay productos para vender'); return; }
  const subtotal = quickScanItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = subtotal - quickScanDiscount;
  const method = selectedPaymentMethod || 'Efec.';
  const customer = fiadoCustomer(method);
  if (customer === null) return;
  if (!confirm(`¿Registrar venta por ${formatUSD(total)}${customer ? ` (fiado a ${customer.name})` : ''}?`)) return;

  const newReceipt: ReceiptData = {
    date: new Date().toLocaleString('es'), seller: currentUser ? currentUser.name : 'Desconocido',
    payment: method, customer: customer ? { name: customer.name, phone: customer.phone } : null,
    items: [...quickScanItems], subtotal, discount: quickScanDiscount, total,
  };
  // Si se estaban agregando productos a un recibo ya cobrado, sale UN solo recibo con todo
  const receipt: ReceiptData = receiptCarry ? {
    ...newReceipt,
    date: receiptCarry.date,
    payment: receiptCarry.payment === method ? method : `${receiptCarry.payment} + ${method}`,
    customer: newReceipt.customer || receiptCarry.customer || null,
    items: [...receiptCarry.items, ...quickScanItems],
    subtotal: receiptCarry.subtotal + subtotal,
    discount: receiptCarry.discount + quickScanDiscount,
    total: receiptCarry.total + total,
    reprint: false,
  } : newReceipt;
  try {
    let firstSaleId = '';
    const saleIds: string[] = [];
    for (const item of quickScanItems) {
      const sale = await DB.addSale({
        product_id: item.product.id, product_name: item.product.name, brand: item.product.brand || '',
        catalog_id: item.product.catalog_id || '', cost_price: Number(item.product.cost_price),
        actual_price: item.price * item.quantity, unit_price: item.price,
        profit: (item.price - Number(item.product.cost_price)) * item.quantity, quantity: item.quantity,
        payment_method: method,
        seller_id: currentUser ? currentUser.id : 'unknown', seller_name: currentUser ? currentUser.name : 'Desconocido',
        discount: quickScanDiscount > 0 ? quickScanDiscount / quickScanItems.length : 0,
        customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
      });
      if (!firstSaleId) firstSaleId = sale.id;
      saleIds.push(sale.id);
    }
    // Número del recibo: el mismo del recibo anterior si se agregaron productos, o uno nuevo
    if (receiptCarry?.number) {
      await attachReceipt(receiptCarry.number, saleIds, total);
      receipt.number = receiptCarry.number; receipt.provisional = receiptCarry.provisional;
    } else {
      const rc = await issueReceipt(saleIds, total);
      receipt.number = rc.number; receipt.provisional = rc.provisional;
    }
    if (customer) await DB.addMovement({ customer_id: customer.id, type: 'fiado', amount: total, method: 'Fiado', sale_id: firstSaleId, note: `${quickScanItems.length} producto(s)` });
    SoundEffects.play('success');
    setState({ quickScanItems: [], quickScanDiscount: 0, receiptData: receipt, saleCustomerId: '', receiptCarry: null, quickScanMode: false });
    closeModal('quick-scan-modal');
    openModal('sale-receipt-modal');
    if (getState().isOnline) setTimeout(() => syncPendingChanges(), 500);
  } catch (e) {
    console.error('❌ Error en finalizeQuickScan:', e);
    toast('Error al procesar la venta: ' + (e as Error).message, 5000);
  }
}

// ==========================================
// IMÁGENES: RECIBO Y CIERRE DEL DÍA
// ==========================================
export function showImagePreview(dataUrl: string, filename: string) {
  setState({ previewImage: { dataUrl, filename } });
  openModal('image-preview-modal');
}

const row = (label: string, value: string, color = '') =>
  `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#666;">${label}</span><span style="font-weight:bold;${color ? `color:${color};` : ''}">${value}</span></div>`;

/** Nombre y datos de la tienda que salen en el recibo (según "Datos del negocio") */
export function receiptStore() {
  const cfg = getState().receiptSettings;
  const name = (cfg.name || '').trim() || businessName();
  const lines: string[] = [];
  if (cfg.showAddress !== false && cfg.address) lines.push(`📍 ${cfg.address}`);
  const phones = [cfg.showPhone !== false && cfg.phone ? `Tel. ${cfg.phone}` : '', cfg.showMobile !== false && cfg.mobile ? `Cel. ${cfg.mobile}` : ''].filter(Boolean).join(' · ');
  if (phones) lines.push(`📞 ${phones}`);
  if (cfg.showNit !== false && cfg.nit) lines.push(`NIT ${cfg.nit}`);
  return { name, lines };
}

/** Líneas opcionales que el cliente pidió (factura, autorización, pedido, NIT del cliente) */
function extraLines(r: ReceiptData): [string, string][] {
  const e = r.extra || {};
  return ([
    ['N° de factura', e.invoice], ['Cód. de autorización', e.auth], ['N° de pedido', e.order], ['NIT / CI del cliente', e.customerNit],
  ] as [string, string | undefined][]).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v!.trim()]);
}

/** Recibo en texto (para WhatsApp) */
export function receiptText(r: ReceiptData) {
  const st = receiptStore();
  const lines = [`🧾 *${st.name}*`, ...st.lines, '', `*RECIBO DE VENTA${r.number ? ` N° ${r.number}` : ''}*${r.provisional ? ' (provisional)' : ''}`, `Fecha: ${r.date}`];
  if (r.customer) lines.push(`Cliente: ${r.customer.name}`);
  extraLines(r).forEach(([k, v]) => lines.push(`${k}: ${v}`));
  lines.push('');
  r.items.forEach(i => {
    const c = formatContent(i.product);
    lines.push(`• ${i.quantity} x ${i.product.name}${c ? ` (${c})` : ''} — ${formatUSD(i.price * i.quantity)}`);
  });
  lines.push('');
  if (r.discount > 0) lines.push(`Descuento: -${formatUSD(r.discount)}`);
  lines.push(`*TOTAL: ${formatUSD(r.total)}*`, `Pago: ${r.payment}${r.payment === 'Fiado' ? ' (queda como deuda)' : ''}`, '', '¡Gracias por su compra! 🙌');
  return lines.join('\n');
}

export function sendReceiptWhatsApp(phone: string) {
  const r = getState().receiptData;
  if (!r) return;
  openWhatsApp(phone || r.customer?.phone || '', receiptText(r));
}

/** Marca de agua: el nombre del negocio repetido en diagonal, semitransparente */
function watermarkHtml(name: string) {
  const word = esc(name.toUpperCase());
  const row = Array.from({ length: 6 }, () => word).join('&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;');
  const rows = Array.from({ length: 22 }, (_, i) => `<div style="white-space:nowrap;margin-left:${(i % 2) * -60}px;">${row}</div>`).join('');
  return `<div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;">
    <div style="position:absolute;left:-60%;top:-40%;width:220%;transform:rotate(-30deg);transform-origin:center;
      font:800 17px Arial,sans-serif;letter-spacing:2px;line-height:46px;color:rgba(124,67,186,0.10);">${rows}</div></div>`;
}

export async function generateReceiptImage() {
  const r = getState().receiptData;
  if (!r) return;
  try {
    toast('Generando imagen del recibo...', 2000);
    const st = receiptStore();
    const items = r.items.map(i => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #eee;">
        <div style="flex:1;"><div style="font-weight:bold;font-size:14px;">${esc(i.product.name)}</div>
        <div style="font-size:12px;color:#666;">${esc(i.product.brand)}${formatContent(i.product) ? ' · ' + esc(formatContent(i.product)) : ''} · ${i.quantity} x ${formatUSD(i.price)}</div></div>
        <div style="font-weight:bold;color:#7c43ba;white-space:nowrap;">${formatUSD(i.price * i.quantity)}</div></div>`).join('');
    const extras = extraLines(r).map(([k, v]) => row(esc(k) + ':', esc(v))).join('');
    const html = `<div style="position:relative;">
      ${watermarkHtml(st.name)}
      <div style="position:relative;z-index:1;">
      <div style="display:flex;align-items:center;gap:12px;padding-bottom:14px;border-bottom:2px solid #7c43ba;margin-bottom:14px;">
        <img src="/icon-192.png" style="width:58px;height:58px;border-radius:14px;" />
        <div style="flex:1;min-width:0;">
          <div style="font-size:19px;font-weight:800;color:#201728;line-height:1.15;">${esc(st.name)}</div>
          ${st.lines.map(l => `<div style="font-size:11.5px;color:#555;margin-top:2px;">${esc(l)}</div>`).join('')}
        </div>
      </div>
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-size:13px;letter-spacing:3px;font-weight:bold;color:#7c43ba;">RECIBO DE VENTA</div>
        ${r.number ? `<div style="font-size:24px;font-weight:900;color:#201728;margin-top:2px;letter-spacing:1px;">N° ${esc(r.number)}</div>` : ''}
        ${r.provisional ? '<div style="font-size:11px;color:#d97706;">Número provisional (sin conexión)</div>' : ''}
        ${r.reprint ? '<div style="font-size:11px;color:#756c7e;">Copia del recibo</div>' : ''}
      </div>
      <div style="background:rgba(246,241,248,0.92);padding:12px 14px;border-radius:12px;margin-bottom:16px;">
        ${row('Fecha:', esc(r.date))}${row('Vendedor:', esc(r.seller))}${row('Método de pago:', esc(r.payment))}${r.customer ? row('Cliente:', esc(r.customer.name)) : ''}${extras}
      </div>
      <h2 style="font-size:15px;margin:0 0 6px;color:#201728;">Productos:</h2>${items}
      <div style="margin-top:16px;padding-top:12px;border-top:2px solid #e8dfec;">${row('Subtotal:', formatUSD(r.subtotal))}${r.discount > 0 ? row('Descuento:', '-' + formatUSD(r.discount), '#d97706') : ''}
        <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #7c43ba;"><span style="font-weight:bold;font-size:18px;">TOTAL:</span><span style="font-weight:bold;font-size:20px;color:#7c43ba;">${formatUSD(r.total)}</span></div></div>
      <div style="text-align:center;margin-top:18px;padding-top:12px;border-top:2px solid #e8dfec;">
        <p style="color:#444;font-size:13px;margin:0;font-weight:bold;">¡Gracias por su compra!</p>
        <p style="color:#999;font-size:10px;margin:6px 0 0;">Emitido con Mi Negocio 7pro</p>
      </div>
      </div></div>`;
    showImagePreview(await htmlToImage(html), `recibo_${(r.number || String(Date.now())).replace(/[^\w-]/g, '_')}.png`);
  } catch (e) {
    console.error('Error al generar imagen:', e);
    toast('Error al generar la imagen del recibo');
  }
}

export async function generateDailyCloseImage(dateKey = todayKey()) {
  const sum = buildCashSummary(dateKey);
  const showProfit = getState().isAdmin();
  const day = getState().sales.filter(s => dateKeyOf(new Date(s.date)) === dateKey);
  if (day.length === 0 && sum.abonoCount === 0) { toast('No hay movimientos ese día'); return; }
  const methods = sum.byMethod.map(m => row(`${m.method === 'Efec.' ? '💵' : m.method === 'QR' ? '📱' : m.method === 'Fiado' ? '📒' : '•'} ${m.method === 'Fiado' ? 'Fiado (por cobrar)' : esc(m.method)} (${m.count}):`, formatUSD(m.total), m.method === 'Fiado' ? '#a43658' : '#7c43ba')).join('');
  const sellers = sum.bySeller.map(v => row(esc(v.name) + ` (${v.count}):`, formatUSD(v.total))).join('');
  const items = day.map(s => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
      <div style="flex:1;"><div style="font-weight:bold;font-size:14px;">${esc(s.product_name)}</div><div style="font-size:12px;color:#666;">x${s.quantity || 1} - ${esc(s.payment_method || 'Efec.')}${s.customer_name ? ' - ' + esc(s.customer_name) : ''} - ${esc(s.seller_name || '')}</div></div>
      <div style="font-weight:bold;color:#7c43ba;">${formatUSD(s.actual_price)}</div></div>`).join('');
  const html = `
    <div style="text-align:center;margin-bottom:20px;"><h1 style="color:#7c43ba;margin:0;font-size:24px;">📊 CIERRE DE CAJA</h1>
      <p style="color:#444;margin:5px 0;font-weight:bold;">${esc(businessName())}</p><p style="color:#666;margin:5px 0;">${esc(sum.label)}</p></div>
    <div style="background:#f6f1f8;padding:15px;border-radius:12px;margin-bottom:20px;">
      ${row('Ventas:', String(sum.salesCount))}${methods}
      ${sum.abonoCount ? row('💰 Abonos de fiados:', formatUSD(sum.abonoCash + sum.abonoQr), '#166534') : ''}
      ${showProfit ? row('📈 Ganancia:', formatUSD(sum.profit), '#166534') : ''}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #7c43ba;"><span style="font-weight:bold;font-size:16px;">TOTAL COBRADO:</span><span style="font-weight:bold;font-size:16px;color:#7c43ba;">${formatUSD(sum.collected)}</span></div>
      <div style="display:flex;justify-content:space-between;padding-top:6px;"><span style="font-weight:bold;">Efectivo en caja:</span><span style="font-weight:bold;">${formatUSD(sum.cashExpected)}</span></div></div>
    ${sellers ? `<h2 style="font-size:16px;margin-bottom:10px;color:#201728;">Por vendedor:</h2><div style="background:#faf7fc;padding:12px;border-radius:12px;margin-bottom:16px;">${sellers}</div>` : ''}
    <h2 style="font-size:16px;margin-bottom:10px;color:#201728;">Detalle de ventas:</h2>${items}
    <div style="text-align:center;margin-top:20px;padding-top:15px;border-top:2px solid #e8dfec;"><p style="color:#666;font-size:12px;">Generado el ${new Date().toLocaleString('es')}</p></div>`;
  try {
    toast('Generando imagen del cierre...', 2000);
    showImagePreview(await htmlToImage(html), `cierre_caja_${dateKey}.png`);
  } catch (e) {
    console.error('Error al generar imagen:', e);
    toast('Error al generar la imagen del cierre');
  }
}

// ==========================================
// HISTORIAL DE VENTAS: SELECCIÓN MÚLTIPLE
// ==========================================
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Recibo (el mismo de "Venta exitosa") armado con las ventas elegidas */
export function salesReceipt(list: Sale[]) {
  if (!list.length) return;
  const { records, customers } = getState();
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const items = sorted.map(s => {
    const qty = Number(s.quantity || 1);
    const price = Number(s.unit_price) || Number(s.actual_price) / qty;
    const product = records.find(r => r.id === s.product_id) || ({ id: s.product_id || s.id, name: s.product_name, brand: s.brand || '' } as Product);
    return { product: { ...product, id: s.id, name: s.product_name || product.name }, quantity: qty, price };
  });
  const total = sorted.reduce((a, s) => a + Number(s.actual_price || 0), 0);
  const uniq = (v: (string | null | undefined)[]) => [...new Set(v.filter(Boolean))].join(', ');
  const customerName = uniq(sorted.map(s => s.customer_name));
  const cust = customers.find(c => c.id === sorted.find(s => s.customer_id)?.customer_id);
  const first = new Date(sorted[0].date), last = new Date(sorted[sorted.length - 1].date);
  const date = first.toDateString() === last.toDateString()
    ? first.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
    : `${first.toLocaleDateString('es')} – ${last.toLocaleDateString('es')}`;
  setState({
    receiptData: {
      date, seller: uniq(sorted.map(s => s.seller_name)) || '—', payment: uniq(sorted.map(s => s.payment_method)) || 'Efec.',
      customer: customerName ? { name: customerName, phone: cust?.phone || '' } : null,
      items, subtotal: total, discount: 0, total, reprint: true,
      number: [...new Set(sorted.map(x => x.receipt_no).filter(Boolean))].join(', ') || undefined,
    },
  });
  openModal('sale-receipt-modal');
}

/** Texto de las ventas elegidas (para copiar o compartir) */
export function salesText(list: Sale[], withProfit = getState().isAdmin()) {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const total = sorted.reduce((a, s) => a + Number(s.actual_price || 0), 0);
  const profit = sorted.reduce((a, s) => a + Number(s.profit || 0), 0);
  const lines = [`🧾 *${businessName()}* · Ventas (${sorted.length})`, ''];
  sorted.forEach(s => lines.push(`• ${fmtDate(s.date)} · ${s.quantity || 1} x ${s.product_name} — ${formatUSD(s.actual_price)} (${s.payment_method || 'Efec.'}${s.customer_name ? ' · ' + s.customer_name : ''}${s.seller_name ? ' · ' + s.seller_name : ''})`));
  lines.push('', `*TOTAL: ${formatUSD(total)}*`);
  if (withProfit) lines.push(`Ganancia: ${formatUSD(profit)}`);
  return lines.join('\n');
}

export async function copySales(list: Sale[]) {
  try { await navigator.clipboard.writeText(salesText(list)); toast(`📋 ${list.length} ventas copiadas`); }
  catch { toast('No se pudo copiar'); }
}

export async function shareSales(list: Sale[]) {
  const text = salesText(list, false);
  if (navigator.share) {
    try { await navigator.share({ title: 'Ventas', text }); return; }
    catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  openWhatsApp('', text);
}

/** Elimina ventas del historial (solo administradores). Devuelve true si se borraron. */
export async function deleteSalesWithConfirm(list: Sale[]) {
  if (!list.length || !requireAdmin()) return false;
  const units = list.reduce((a, s) => a + Number(s.quantity || 1), 0);
  if (!confirm(`¿Eliminar ${list.length} ${list.length === 1 ? 'venta' : 'ventas'} del historial?\n\nTambién se quitan de Informes, del cierre de caja y de los fiados.`)) return false;
  const restore = confirm(`¿Devolver las ${units} unidades al stock?\n\nAceptar = sí (la venta se anuló o hubo devolución)\nCancelar = no (solo borrar el registro)`);
  const r = await DB.deleteSales(list.map(s => s.id), restore);
  toast(`🗑️ ${r.deleted} ${r.deleted === 1 ? 'venta eliminada' : 'ventas eliminadas'}${restore ? ` · ${units} u. devueltas al stock` : ''}`);
  SoundEffects.play('success');
  return true;
}
