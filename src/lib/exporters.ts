import { getState, toast, setState } from '../store';
import { SoundEffects } from './sound';
import { csvEscape, formatContent, formatUSD, formatUSDShort } from './format';
import { downloadBlob } from './image';
import { DB } from './db';
import { APP_NAME, CONTACT_KEY } from './constants';
import { getOutOfStockProducts } from './selectors';
import { issueDocument } from './documents';
import { businessName } from './whatsapp';
import type { Sale } from '../types';

// ==========================================
// INFORMES DE VENTAS
// ==========================================
/** Numera un informe nuevo (para mostrar el número ANTES de descargarlo o compartirlo) */
export async function issueReportNumber(format: 'Excel' | 'CSV' = 'Excel', list?: Sale[]) {
  return reportNumber(format, undefined, list);
}

/** Comparte el informe como archivo (WhatsApp, correo...) */
export async function shareSalesReport(code: string, list?: Sale[]) {
  const XLSX = await import('xlsx');
  const sales = list || getState().sales;
  const ws = XLSX.utils.aoa_to_sheet([[`Informe de ventas N° ${code} · ${businessName()}`], [`Generado el ${new Date().toLocaleString('es')}`], []]);
  XLSX.utils.sheet_add_json(ws, sales.map(s => ({ 'Fecha': new Date(s.date).toLocaleString('es'), 'Recibo': s.receipt_no || '', 'Producto': s.product_name, 'Cantidad': s.quantity || 1, 'Precio Real': s.actual_price, 'Método': s.payment_method || 'Efec.', 'Cliente': s.customer_name || '', 'Vendedor': s.seller_name || '', 'Ganancia': s.profit, 'Observación': s.note || '' })), { origin: 'A4' });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Informe Ventas');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const file = new File([out], `informe_ventas_${code}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: `Informe de ventas N° ${code}` }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  downloadBlob(file, file.name);
  toast('Este navegador no permite compartir archivos: se descargó el informe');
}

/** Numera el informe (ANA-I-000001) y deja la copia en "Recibos y cierres" */
async function reportNumber(format: 'Excel' | 'CSV', reuse?: string, list?: Sale[]) {
  if (reuse) return reuse;
  const sales = list || getState().sales;
  const dates = sales.map(x => x.date).sort();
  const total = sales.reduce((a, x) => a + Number(x.actual_price || 0), 0);
  return issueDocument('informe', null, { format, custom: !!list, count: sales.length, from: dates[0] || null, to: dates[dates.length - 1] || null, total }, total);
}

/** Informe de ventas en Excel. reuse = volver a descargar un informe ya numerado */
export async function exportSalesXLSX(reuse?: string, list?: Sale[]) {
  const XLSX = await import('xlsx');
  const sales = list || getState().sales;
  if (sales.length === 0) { toast('No hay ventas para exportar'); return; }
  try {
    const number = await reportNumber('Excel', reuse, list);
    const wb = XLSX.utils.book_new();
    const data = sales.map(s => ({
      'Fecha': new Date(s.date).toLocaleString('es'), 'Recibo': s.receipt_no || '', 'Producto': s.product_name, 'Marca': s.brand || '',
      'Cantidad': s.quantity || 1, 'Costo Unit.': s.cost_price, 'Precio Real': s.actual_price,
      'Método': s.payment_method || 'Efec.', 'Cliente': s.customer_name || '', 'Vendedor': s.seller_name || '', 'Ganancia': s.profit, 'Observación': s.note || '',
    }));
    const head = [[`Informe de ventas${number ? ` N° ${number}` : ''} · ${businessName()}`], [`Generado el ${new Date().toLocaleString('es')} por ${getState().currentUser?.name || ''}`], []];
    const ws = XLSX.utils.aoa_to_sheet(head);
    XLSX.utils.sheet_add_json(ws, data, { origin: 'A4' });
    XLSX.utils.book_append_sheet(wb, ws, 'Informe Ventas');
    XLSX.writeFile(wb, `informe_ventas_${number || Date.now()}.xlsx`);
    toast(`Informe${number ? ` N° ${number}` : ''} descargado ✓`);
    SoundEffects.play('success');
  } catch (e) { toast('Error: ' + (e as Error).message, 3000); }
}

export async function exportSalesCSV(reuse?: string, list?: Sale[]) {
  const sales = list || getState().sales;
  if (sales.length === 0) { toast('No hay ventas'); return; }
  const number = await reportNumber('CSV', reuse, list);
  const lines = [csvEscape(`Informe de ventas${number ? ` N° ${number}` : ''} · ${businessName()}`), '',
    ['fecha', 'recibo', 'producto', 'marca', 'cantidad', 'costo', 'precio_real', 'metodo', 'cliente', 'vendedor', 'ganancia', 'observacion'].join(',')];
  sales.forEach(s => {
    lines.push([new Date(s.date).toLocaleString('es'), csvEscape(s.receipt_no || ''), csvEscape(s.product_name), csvEscape(s.brand || ''), s.quantity || 1, s.cost_price, s.actual_price, s.payment_method || 'Efec.', csvEscape(s.customer_name || ''), csvEscape(s.seller_name || ''), s.profit, csvEscape(s.note || '')].join(','));
  });
  downloadBlob(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `informe_ventas_${number || Date.now()}.csv`);
  toast(`Informe CSV${number ? ` N° ${number}` : ''} descargado ✓`);
  SoundEffects.play('success');
}

export async function exportOutOfStock() {
  const XLSX = await import('xlsx');
  const products = getOutOfStockProducts(getState().records);
  if (products.length === 0) { toast('No hay productos agotados'); return; }
  const { catalogs } = getState();
  const wb = XLSX.utils.book_new();
  const data = products.map(r => {
    const cat = catalogs.find(c => c.id === r.catalog_id);
    return { 'Nombre': r.name, 'Marca': r.brand, 'Contenido': formatContent(r), 'Costo': Number(r.cost_price) || 0, 'Precio Máx': Number(r.sale_price) || 0, 'Catálogo': cat ? cat.name : '' };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Productos Agotados');
  XLSX.writeFile(wb, `productos_agotados_${Date.now()}.xlsx`);
  toast('Lista exportada ✓');
  SoundEffects.play('success');
}

export async function exportCartToPDF() {
  const { jsPDF } = await import('jspdf');
  const { cart, records, contactInfo } = getState();
  if (cart.length === 0) { toast('El carrito está vacío'); return; }
  try {
    const doc = new jsPDF();
    const businessName = getState().activeStore?.store_name || contactInfo?.business || APP_NAME;
    doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text(businessName, 105, 20, { align: 'center' });
    doc.setDrawColor(124, 67, 186); doc.setLineWidth(0.5); doc.line(20, 35, 190, 35);
    doc.setFontSize(14); doc.setTextColor(124, 67, 186); doc.text('PEDIDO', 105, 45, { align: 'center' });
    doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date().toLocaleString('es')}`, 20, 55);
    let y = 70;
    doc.setFont('helvetica', 'bold'); doc.setFillColor(124, 67, 186); doc.setTextColor(255, 255, 255);
    doc.rect(20, y - 5, 170, 8, 'F');
    doc.text('Producto', 25, y); doc.text('Cant.', 120, y); doc.text('P. Unit.', 140, y); doc.text('Subtotal', 170, y);
    y += 10; doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    let total = 0;
    cart.forEach(line => {
      const r = records.find(x => x.id === line.id); if (!r) return;
      const subtotal = Number(r.sale_price) * line.qty; total += subtotal;
      if (y > 260) { doc.addPage(); y = 20; }
      const content = formatContent(r);
      const fullName = content ? `${r.name} (${content})` : r.name;
      const name = fullName.length > 35 ? fullName.substring(0, 35) + '...' : fullName;
      doc.text(name, 25, y); doc.text(String(line.qty), 125, y); doc.text(formatUSDShort(r.sale_price), 140, y); doc.text(formatUSDShort(subtotal), 170, y);
      y += 8;
    });
    y += 5; doc.setDrawColor(124, 67, 186); doc.line(20, y, 190, y); y += 10;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(124, 67, 186);
    doc.text('TOTAL:', 130, y); doc.text(formatUSD(total), 170, y);
    doc.save(`pedido_${Date.now()}.pdf`);
    toast('Pedido PDF descargado ✓');
    SoundEffects.play('success');
  } catch (e) { toast('Error al generar PDF: ' + (e as Error).message, 3000); }
}

// ==========================================
// RESPALDOS
// ==========================================
export function createBackup() {
  const { catalogs, records, sales, contactInfo, customers, movements } = getState();
  const backup = { app: APP_NAME, version: '2.3', date: new Date().toISOString(), catalogs, records, sales, contactInfo, customers, movements };
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `respaldo_catalogo_${Date.now()}.json`);
  toast('Respaldo creado ✓');
  SoundEffects.play('success');
}

export async function restoreBackup(file: File) {
  try {
    const backup = JSON.parse(await file.text());
    if (!backup.catalogs || !backup.records) { toast('Archivo no válido'); return false; }
    if (!confirm('¿Restaurar? Se reemplazarán tus datos.')) return false;
    if (backup.contactInfo) { setState({ contactInfo: backup.contactInfo }); localStorage.setItem(CONTACT_KEY, JSON.stringify(backup.contactInfo)); }
    await DB.replaceAll({ catalogs: backup.catalogs, records: backup.records, sales: backup.sales || [], customers: backup.customers, movements: backup.movements });
    toast('Respaldo restaurado ✓');
    SoundEffects.play('success');
    return true;
  } catch (e) { toast('Error: ' + (e as Error).message, 3000); return false; }
}

