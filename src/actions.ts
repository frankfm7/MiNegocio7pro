import type { Product, ReceiptData, View } from './types';
import { closeModal, getState, openAccount, openModal, setState, toast, type ModalId } from './store';
import { SoundEffects } from './lib/sound';
import { DB, syncPendingChanges } from './lib/db';
import { formatContent, formatUSD } from './lib/format';
import { decodeProductQR } from './lib/qr';
import { esc, htmlToImage } from './lib/htmlImage';
import { getTodaySales } from './lib/selectors';
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
export async function confirmSale(qty: number, unitPrice: number) {
  const { saleProduct: r, selectedPaymentMethod, currentUser } = getState();
  if (!r) return false;
  if (isNaN(unitPrice) || unitPrice <= 0) { toast('Ingresa un precio válido'); SoundEffects.play('error'); return false; }
  if (r.stock < qty) { toast('No hay suficiente stock'); SoundEffects.play('error'); return false; }
  const profit = (unitPrice - Number(r.cost_price)) * qty;
  try {
    await DB.addSale({
      product_id: r.id, product_name: r.name, brand: r.brand || '', catalog_id: r.catalog_id || '',
      cost_price: Number(r.cost_price), actual_price: unitPrice * qty, unit_price: unitPrice, profit, quantity: qty,
      payment_method: selectedPaymentMethod || 'Efec.',
      seller_id: currentUser ? currentUser.id : 'unknown', seller_name: currentUser ? currentUser.name : 'Desconocido',
    });
    closeModal('sale-modal');
    closeModal('detail-modal');
    toast(`¡Venta registrada! ${qty}x ${r.name} - Ganancia: ${formatUSD(profit)} 🎉`, 3000);
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

// ==========================================
// LISTA DE VENTAS (ESCANEO RÁPIDO)
// ==========================================
export function startQuickScanMode() {
  setState({ quickScanMode: true, quickScanItems: [], quickScanDiscount: 0 });
  openModal('quick-scan-modal');
  toast('Modo lista de ventas activado');
}

export function stopQuickScanMode() {
  setState({ quickScanMode: false, quickScanItems: [], quickScanDiscount: 0, barcodeScanTarget: null });
  closeModal('quick-scan-modal');
  toast('Modo escaneo rápido desactivado');
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
  const { quickScanItems, quickScanDiscount, currentUser, selectedPaymentMethod } = getState();
  if (!quickScanItems.length) { toast('No hay productos para vender'); return; }
  const subtotal = quickScanItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = subtotal - quickScanDiscount;
  if (!confirm(`¿Registrar venta por ${formatUSD(total)}?`)) return;

  const receipt: ReceiptData = {
    date: new Date().toLocaleString('es'), seller: currentUser ? currentUser.name : 'Desconocido',
    payment: selectedPaymentMethod || 'Efec.', items: [...quickScanItems], subtotal, discount: quickScanDiscount, total,
  };
  try {
    for (const item of quickScanItems) {
      await DB.addSale({
        product_id: item.product.id, product_name: item.product.name, brand: item.product.brand || '',
        catalog_id: item.product.catalog_id || '', cost_price: Number(item.product.cost_price),
        actual_price: item.price * item.quantity, unit_price: item.price,
        profit: (item.price - Number(item.product.cost_price)) * item.quantity, quantity: item.quantity,
        payment_method: selectedPaymentMethod || 'Efec.',
        seller_id: currentUser ? currentUser.id : 'unknown', seller_name: currentUser ? currentUser.name : 'Desconocido',
        discount: quickScanDiscount > 0 ? quickScanDiscount / quickScanItems.length : 0,
      });
    }
    SoundEffects.play('success');
    setState({ quickScanItems: [], quickScanDiscount: 0, receiptData: receipt });
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

export async function generateReceiptImage() {
  const r = getState().receiptData;
  if (!r) return;
  try {
    toast('Generando imagen del recibo...', 2000);
    const items = r.items.map(i => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
        <div style="flex:1;"><div style="font-weight:bold;font-size:14px;">${esc(i.product.name)}</div>
        <div style="font-size:12px;color:#666;">${esc(i.product.brand)}${formatContent(i.product) ? ' · ' + esc(formatContent(i.product)) : ''} · ${i.quantity} x ${formatUSD(i.price)}</div></div>
        <div style="font-weight:bold;color:#7c43ba;">${formatUSD(i.price * i.quantity)}</div></div>`).join('');
    const html = `
      <div style="text-align:center;margin-bottom:20px;"><h1 style="color:#7c43ba;margin:0;font-size:24px;">🧾 RECIBO DE VENTA</h1><p style="color:#666;margin:5px 0;">¡Venta Exitosa!</p></div>
      <div style="background:#f6f1f8;padding:15px;border-radius:12px;margin-bottom:20px;">${row('Fecha:', esc(r.date))}${row('Vendedor:', esc(r.seller))}${row('Método de pago:', esc(r.payment))}</div>
      <h2 style="font-size:16px;margin-bottom:10px;color:#201728;">Productos vendidos:</h2>${items}
      <div style="margin-top:20px;padding-top:15px;border-top:2px solid #e8dfec;">${row('Subtotal:', formatUSD(r.subtotal))}${row('Descuento:', r.discount > 0 ? '-' + formatUSD(r.discount) : 'Sin descuento', '#d97706')}
        <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #7c43ba;"><span style="font-weight:bold;font-size:18px;">TOTAL:</span><span style="font-weight:bold;font-size:18px;color:#7c43ba;">${formatUSD(r.total)}</span></div></div>
      <div style="text-align:center;margin-top:20px;padding-top:15px;border-top:2px solid #e8dfec;"><p style="color:#666;font-size:12px;">¡Gracias por su compra!</p></div>`;
    showImagePreview(await htmlToImage(html), `recibo_venta_${Date.now()}.png`);
  } catch (e) {
    console.error('Error al generar imagen:', e);
    toast('Error al generar la imagen del recibo');
  }
}

export async function generateDailyCloseImage() {
  const { sales, currentUser } = getState();
  const todaySales = getTodaySales(sales);
  if (todaySales.length === 0) { toast('No hay ventas hoy'); return; }
  const sum = (list: typeof todaySales, key: 'actual_price' | 'profit') => list.reduce((a, s) => a + Number(s[key] || 0), 0);
  const total = sum(todaySales, 'actual_price');
  const profit = sum(todaySales, 'profit');
  const cash = sum(todaySales.filter(s => s.payment_method === 'Efec.'), 'actual_price');
  const qr = sum(todaySales.filter(s => s.payment_method === 'QR'), 'actual_price');
  const items = todaySales.map(s => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
      <div style="flex:1;"><div style="font-weight:bold;font-size:14px;">${esc(s.product_name)}</div><div style="font-size:12px;color:#666;">x${s.quantity || 1} - ${esc(s.payment_method || 'Efec.')}</div></div>
      <div style="font-weight:bold;color:#7c43ba;">${formatUSD(s.actual_price)}</div></div>`).join('');
  const html = `
    <div style="text-align:center;margin-bottom:20px;"><h1 style="color:#7c43ba;margin:0;font-size:24px;">📊 CIERRE DE VENTAS</h1>
      <p style="color:#666;margin:5px 0;">${new Date().toLocaleDateString('es', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
    <div style="background:#f6f1f8;padding:15px;border-radius:12px;margin-bottom:20px;">
      ${row('Vendedor:', esc(currentUser ? currentUser.name : 'Vendedor'))}${row('Total de ventas:', String(todaySales.length))}
      ${row('💵 Efectivo:', formatUSD(cash), '#23805d')}${row('📱 QR:', formatUSD(qr), '#7c43ba')}${row('💰 Ganancia:', formatUSD(profit), '#166534')}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #7c43ba;"><span style="font-weight:bold;font-size:18px;">TOTAL:</span><span style="font-weight:bold;font-size:18px;color:#7c43ba;">${formatUSD(total)}</span></div></div>
    <h2 style="font-size:16px;margin-bottom:10px;color:#201728;">Detalle de ventas:</h2>${items}
    <div style="text-align:center;margin-top:20px;padding-top:15px;border-top:2px solid #e8dfec;"><p style="color:#666;font-size:12px;">Generado el ${new Date().toLocaleString('es')}</p></div>`;
  try {
    toast('Generando imagen del cierre...', 2000);
    showImagePreview(await htmlToImage(html), `cierre_ventas_${Date.now()}.png`);
  } catch (e) {
    console.error('Error al generar imagen:', e);
    toast('Error al generar la imagen del cierre');
  }
}
