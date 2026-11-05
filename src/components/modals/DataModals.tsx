import { useEffect, useState } from 'react';
import NumField from '../NumField';
import PriceFields from '../PriceFields';
import {
  AlertCircle, ArrowRightLeft, CheckCircle2, Percent, Cloud, Download, PackageCheck, Receipt, FileImage, FileJson, FileSpreadsheet, FileText, FileType, Images, Info, Loader, QrCode, ScanText, ShieldCheck, Upload,
} from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, getState, setState, toast, useStore } from '../../store';
import { backupNow, isAutoBackupOn, listCloudBackups, restoreCloudBackup, setAutoBackup } from '../../lib/cloudBackup';
import type { CloudBackup } from '../../types';
import { createBackup, restoreBackup } from '../../lib/exporters';
import { commitImport, findExisting, suggestExisting, exportCSV, exportExcel, exportJSON, exportPDF, importAnyFile, importInvoiceImages, importPhotosAsProducts, importPriceListImage, invoiceFactor } from '../../lib/io';
import { exportCatalogQRsPDF } from '../../lib/qr';
import { formatUSD, cardImage, formatUSDShort } from '../../lib/format';

function Row({ icon, color, title, text, onClick }: { icon: React.ReactNode; color: string; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-[#ede7f0] hover:border-[#d4c5e0] hover:bg-[#faf7fb] transition text-left">
      <div className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0" style={{ background: color + '1a', color }}>{icon}</div>
      <div className="flex-1 min-w-0"><p className="font-bold text-sm">{title}</p><p className="text-xs text-[#756c7e]">{text}</p></div>
    </button>
  );
}

function FileRow({ icon, color, title, text, accept, multiple, onFiles }: { icon: React.ReactNode; color: string; title: string; text: string; accept: string; multiple?: boolean; onFiles: (f: File[]) => void }) {
  return (
    <label className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-[#d4c5e0] hover:border-[#7c43ba] hover:bg-[#f6f1f8] transition text-left cursor-pointer">
      <div className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0" style={{ background: color + '1a', color }}>{icon}</div>
      <div className="flex-1 min-w-0"><p className="font-bold text-sm">{title}</p><p className="text-xs text-[#756c7e]">{text}</p></div>
      <input type="file" accept={accept} multiple={multiple} className="hidden" onChange={e => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
    </label>
  );
}

export function ImportExportModal() {
  const currentCatalogId = useStore(s => s.currentCatalogId);
  const catalogs = useStore(s => s.catalogs);
  const records = useStore(s => s.records);
  const [scopeId, setScopeId] = useState<string>('');
  const sel = scopeId === '' ? currentCatalogId || 'all' : scopeId;
  const catId = sel === 'all' ? null : sel;
  const count = catId ? records.filter(r => r.catalog_id === catId).length : records.length;

  const run = (fn: () => unknown) => () => { closeModal('import-export-modal'); setTimeout(fn, 120); };
  const runFiles = (fn: (f: File[]) => unknown) => (f: File[]) => { closeModal('import-export-modal'); setTimeout(() => fn(f), 120); };

  return (
    <Modal id="import-export-modal">
      <article className="modal-card w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <div><h2 className="font-bold text-xl hero-title">Importar / Exportar</h2><p className="text-xs text-[#756c7e] mt-1">Todos los datos del producto, con sus fotos</p></div>
          <CloseButton onClick={() => closeModal('import-export-modal')} />
        </div>

        <h3 className="font-bold text-sm text-[#23805d] mb-2 flex items-center gap-2"><Download className="w-4 h-4" /> Exportar</h3>
        <label className="block text-xs font-bold text-[#756c7e] mb-1">¿Qué quieres exportar?</label>
        <select value={sel} onChange={e => setScopeId(e.target.value)} className="w-full input-field rounded-xl p-2.5 text-sm mb-1">
          <option value="all">Todos los catálogos ({records.length} productos)</option>
          {catalogs.map(c => <option key={c.id} value={c.id}>{c.name} ({records.filter(r => r.catalog_id === c.id).length})</option>)}
        </select>
        <p className="text-[11px] text-[#756c7e] mb-3"><Info className="w-3 h-3 inline" /> {count} productos seleccionados</p>
        <div className="grid sm:grid-cols-2 gap-2 mb-6">
          <Row icon={<FileSpreadsheet className="w-4 h-4" />} color="#23805d" title="Excel con fotos" text="Hoja de cálculo completa (.xlsx)" onClick={run(() => exportExcel(catId))} />
          <Row icon={<FileType className="w-4 h-4" />} color="#be416d" title="PDF para clientes" text="Catálogo con fotos y precios, sin costos" onClick={run(() => exportPDF(catId, false))} />
          <Row icon={<FileType className="w-4 h-4" />} color="#7c43ba" title="PDF inventario" text="Con costos, stock y códigos" onClick={run(() => exportPDF(catId, true))} />
          <Row icon={<QrCode className="w-4 h-4" />} color="#201728" title="Códigos QR (PDF)" text="Hoja para imprimir y pegar" onClick={run(() => exportCatalogQRsPDF(catId))} />
          <Row icon={<FileJson className="w-4 h-4" />} color="#3875a5" title="JSON" text="Respaldo exacto con fotos" onClick={run(() => exportJSON(catId))} />
          <Row icon={<FileText className="w-4 h-4" />} color="#d97706" title="CSV" text="Texto simple (sin fotos)" onClick={run(() => exportCSV(catId))} />
        </div>

        <h3 className="font-bold text-sm text-[#7c43ba] mb-2 flex items-center gap-2"><Upload className="w-4 h-4" /> Importar</h3>
        <div className="space-y-2">
          <FileRow icon={<Upload className="w-4 h-4" />} color="#7c43ba" title="Archivo" text="Excel (con fotos), PDF, CSV o JSON" accept=".xlsx,.xls,.ods,.csv,.txt,.json,.pdf" onFiles={runFiles(f => importAnyFile(f[0]))} />
          <FileRow icon={<Images className="w-4 h-4" />} color="#23805d" title="Fotos de productos" text="Varias fotos → un producto por foto" accept="image/*" multiple onFiles={runFiles(f => importPhotosAsProducts(f))} />
          <FileRow icon={<Receipt className="w-4 h-4" />} color="#be416d" title="Factura, recibo o detalle de pedido (foto o PDF)" text="Ésika, L'Bel, Cyzone, Yanbal y otros · suma stock y precios de catálogo · varias fotos = varias páginas" accept="image/*,.pdf,application/pdf" multiple onFiles={runFiles(async f => { const pdfs = f.filter(x => /\.pdf$/i.test(x.name) || x.type === 'application/pdf'); const imgs = f.filter(x => x.type.startsWith('image/')); for (const p of pdfs) await importAnyFile(p); if (imgs.length) await importInvoiceImages(imgs); })} />
          <FileRow icon={<ScanText className="w-4 h-4" />} color="#d97706" title="Foto de una lista de precios" text="Lee el texto de la imagen (nombre y precio)" accept="image/*" onFiles={runFiles(f => importPriceListImage(f[0]))} />
        </div>
        <p className="text-[11px] text-[#756c7e] mt-3">Antes de guardar verás la lista para revisar nombres, precios y el catálogo de destino.</p>
      </article>
    </Modal>
  );
}


interface Adjust { minPct: number | null; saleBase: 'min' | 'cost'; salePct: number | null }
const ADJ_KEY = 'mn7_import_adjust2';
const loadAdjust = (): Adjust => { try { return { minPct: null, saleBase: 'min', salePct: null, ...JSON.parse(localStorage.getItem(ADJ_KEY) || '{}') }; } catch { return { minPct: null, saleBase: 'min', salePct: null }; } };
const matchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const r2 = (n: number) => Math.round(n * 100) / 100;

export function ImportPreviewModal() {
  const pv = useStore(s => s.importPreview);
  const catalogs = useStore(s => s.catalogs);
  const records = useStore(s => s.records);
  const app = useStore(s => s.appCurrency);
  const [saving, setSaving] = useState(false);
  const [adj, setAdj] = useState<Adjust>(loadAdjust);
  if (!pv) return <Modal id="import-preview-modal" closeOnBackdrop={false}>{null}</Modal>;

  const normalizeName = (n: string) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const update = (key: string, patch: Record<string, unknown>) =>
    setState({ importPreview: { ...pv, items: pv.items.map(i => (i._key === key ? { ...i, ...patch } : i)) } });
  /** Aplica los porcentajes a toda la lista: costo mínimo = factura + %, precio de venta = mínimo/factura + % */
  const applyAdjust = () => {
    try { localStorage.setItem(ADJ_KEY, JSON.stringify(adj)); } catch { /* sin espacio */ }
    if (adj.minPct == null && adj.salePct == null) { toast('Escribe al menos un porcentaje'); return; }
    setState({ importPreview: { ...pv, items: pv.items.map(i => {
      const cost = Number(i.cost_price) || 0;
      const min = adj.minPct != null ? r2(cost * (1 + adj.minPct / 100)) : Number(i.min_price) || 0;
      const patch: Partial<typeof i> = adj.minPct != null ? { min_price: min, _minEdited: true } : {};
      if (!i._matchId && adj.salePct != null) patch.sale_price = r2((adj.saleBase === 'min' ? (min || cost) : cost) * (1 + adj.salePct / 100));
      return { ...i, ...patch };
    }) } });
    toast('✅ Porcentajes aplicados a la lista');
  };
  /** Al cambiar código o nombre se vuelve a buscar el producto en el catálogo */
  const rematch = (key: string) => {
    clearTimeout(matchTimers.get(key));
    matchTimers.set(key, setTimeout(() => {
      const cur = getState().importPreview;
      const it = cur?.items.find(x => x._key === key);
      if (!cur || !it) return;
      const ex = findExisting(String(it.sku || ''), String(it._matchId ? (it._readName || '') : (it.name || '')), String(it.brand || ''), it._matchId ? '' : [it.content_value, it.content_unit].filter(Boolean).join(' '));
      if ((ex?.id || null) === (it._matchId || null)) return;
      setState({ importPreview: { ...cur, items: cur.items.map(x => (x._key === key ? (ex
        ? { ...x, _matchId: ex.id, _readName: x._matchId ? x._readName : String(x.name || x._readName || '') }
        : { ...x, _matchId: null, name: x._readName || x.name, sale_price: Number(x.sale_price) || Number(x.catalog_price) || Number(x.cost_price) || 0 }) : x)) } });
    }, 450));
  };
  const setInvoice = (patch: Partial<NonNullable<typeof pv.invoice>>) => pv.invoice && setState({ importPreview: { ...pv, invoice: { ...pv.invoice, ...patch } } });
  const included = pv.items.filter(i => i._include);
  const withImages = included.filter(i => i.image_url).length;
  const restock = included.filter(i => i._matchId).length;
  const needsTarget = included.some(i => !i._matchId);
  const hasAuto = pv.items.some(i => i._catalogName) || pv.catalogs.length > 0;
  const inv = pv.invoice;
  const k = invoiceFactor(inv, app);
  const cur = inv ? inv.currency : app;
  const missingTarget = needsTarget && !pv.target;
  const cancel = () => { setState({ importPreview: null }); closeModal('import-preview-modal'); };
  const save = async () => {
    if (missingTarget) { toast('Elige a qué catálogo agregar los productos nuevos'); return; }
    setSaving(true); await commitImport(); setSaving(false); closeModal('import-preview-modal');
  };
  const conv = (v: unknown) => (k !== 1 && Number(v) ? ` → ${formatUSDShort(Number(v) * k)} ${app}` : '');

  return (
    <Modal id="import-preview-modal" className="z-[70] bg-[#1e1427]/70" closeOnBackdrop={false}>
      <article className="modal-card w-full min-w-0 max-w-[min(48rem,calc(100vw-2rem))] bg-white rounded-3xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#ede7f0] flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-xl hero-title">{inv ? 'Revisar factura / pedido' : 'Revisar importación'}</h2>
            <p className="text-xs text-[#756c7e] mt-1">{pv.source} · {included.length} de {pv.items.length} productos{restock ? ` · ${restock} ya existen (se suma el stock)` : ''}{withImages ? ` · ${withImages} con foto` : ''}</p>
          </div>
          <CloseButton onClick={cancel} />
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {inv && (
            <div className="mx-4 sm:mx-5 mt-4 p-3 rounded-2xl bg-[#f6f1f8] grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] items-center min-w-0">
              <div className="text-sm min-w-0">
                <p className="font-bold flex items-center gap-1.5"><Receipt className="w-4 h-4 text-[#be416d]" /> {inv.vendor === 'Factura' ? 'Documento' : inv.vendor} · precios en <b>{inv.currency}</b></p>
                {inv.totals.length > 0 && <p className="text-[11px] text-[#756c7e] mt-0.5 truncate">{inv.totals.join(' · ')}</p>}
              </div>
              {(
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {inv.currency !== app && <label className="flex items-center gap-1.5 font-bold"><input type="checkbox" checked={inv.convert} onChange={e => setInvoice({ convert: e.target.checked })} className="accent-[#7c43ba]" /> Convertir a {app}</label>}
                  <span className="flex items-center gap-1 font-bold"><ArrowRightLeft className="w-3.5 h-3.5" /> Tipo de cambio: 1 USD =</span>
                  <NumField value={inv.rate || null} onValue={n => setInvoice({ rate: n || 0 })} className="input-field rounded-lg px-2 py-1 w-20 text-sm" label="Tipo de cambio" />
                  <span>{app === 'USD' ? 'Bs' : app}</span>
                </div>
              )}
              {inv.currency !== app && app === 'USD' && inv.currency === 'Bs' && (
                <p className="text-[11px] text-[#92400e] sm:col-span-2">Tu app está en USD. Si vendes en bolivianos, cambia la moneda en <b>Menú → Datos de la tienda (recibo)</b>.</p>
              )}
            </div>
          )}

          {inv && (
            <details id="price-adjust" className="mx-4 sm:mx-5 mt-3 p-3 rounded-2xl border border-[#ede7f0] bg-white" open>
              <summary className="text-sm font-bold cursor-pointer select-none flex items-center gap-1.5"><Percent className="w-4 h-4 text-[#7c43ba]" /> Calcular precios de toda la lista</summary>
              <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
                <div className="p-2.5 rounded-xl bg-[#f6f1f8]">
                  <p className="font-bold mb-1">Costo mínimo de venta</p>
                  <p className="text-[11px] text-[#756c7e] mb-1.5">Costo de factura + % (ej. 10 + 5% = 10.50)</p>
                  <NumField value={adj.minPct} onValue={n => setAdj({ ...adj, minPct: n })} allowNegative suffix="%" label="Porcentaje del costo mínimo" className="input-field rounded-lg px-2 py-1.5 w-20 text-sm font-bold" />
                </div>
                <div className="p-2.5 rounded-xl bg-[#f6f1f8]">
                  <p className="font-bold mb-1">Precio de venta máx. (catálogo)</p>
                  <select value={adj.saleBase} onChange={e => setAdj({ ...adj, saleBase: e.target.value as Adjust['saleBase'] })} className="input-field rounded-lg px-2 py-1 text-[11px] w-full mb-1.5">
                    <option value="min">Costo mínimo + %</option>
                    <option value="cost">Costo de factura + %</option>
                  </select>
                  <NumField value={adj.salePct} onValue={n => setAdj({ ...adj, salePct: n })} allowNegative suffix="%" label="Porcentaje del precio de venta" className="input-field rounded-lg px-2 py-1.5 w-20 text-sm font-bold" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button type="button" onClick={applyAdjust} className="px-4 py-2 rounded-xl btn-primary text-xs font-bold">Aplicar a toda la lista</button>
                <p className="text-[11px] text-[#756c7e] flex-1 min-w-[12rem]">Los productos ya reconocidos solo cambian el costo mínimo (su precio de venta se mantiene). Después puedes editar cada uno.</p>
              </div>
            </details>
          )}

          <div className="p-4 sm:p-5 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">{inv ? 'Productos nuevos: ¿a qué catálogo los agrego?' : 'Guardar en'}</label>
              <select value={pv.target} onChange={e => setState({ importPreview: { ...pv, target: e.target.value } })} className={`w-full input-field rounded-xl p-2.5 text-sm ${missingTarget ? '!border-[#d97706] ring-2 ring-[#fde68a]' : ''}`}>
                {!pv.target && <option value="">— Elige un catálogo —</option>}
                {hasAuto && <option value="auto">Según el archivo (crea catálogos si faltan)</option>}
                {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="new">➕ Catálogo nuevo…</option>
              </select>
              {missingTarget && <p className="text-[11px] text-[#92400e] mt-1">No encontré un catálogo parecido. Elige uno o crea uno nuevo.</p>}
            </div>
            {pv.target === 'new' && (
              <div>
                <label className="block text-xs font-bold mb-1">Nombre del catálogo nuevo</label>
                <input value={pv.newCatalogName} onChange={e => setState({ importPreview: { ...pv, newCatalogName: e.target.value } })} className="w-full input-field rounded-xl p-2.5 text-sm" />
              </div>
            )}
          </div>

          <div className="px-3 sm:px-5 pb-4 space-y-2">
            {pv.items.map(i => {
              const match = i._matchId ? records.find(r => r.id === i._matchId) : null;
              const sugg = !match && inv ? suggestExisting(String(i.sku || ''), String(i.name || '')) : null;
              // Costo mínimo de un producto existente no editado: el suyo (en la moneda de la factura)
              const minShown = match && !i._minEdited ? r2((Number(match.min_price) || 0) / (k || 1)) : (i.min_price as number);
              return (
                <div key={i._key} className={`import-item p-2.5 rounded-2xl border ${i._include ? (match ? 'border-[#86efac] bg-[#f7fef9]' : 'border-[#ede7f0] bg-white') : 'border-dashed border-[#e8dfec] opacity-55'}`}>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <input type="checkbox" checked={i._include} onChange={e => update(i._key, { _include: e.target.checked })} className="w-4 h-4 mt-3 accent-[#7c43ba] flex-shrink-0" aria-label="Incluir" />
                    <div className="w-11 h-11 rounded-xl product-photo-frame flex-shrink-0 grid place-items-center overflow-hidden">
                      {match?.image_url || i.image_url ? <img src={cardImage({ image_url: (match?.image_url || i.image_url) as string })} alt="" className="w-full h-full object-contain" /> : <FileImage className="w-5 h-5 text-[#d4c5e0]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {match ? (
                        <>
                          <p className="match-ok text-[11px] font-bold text-[#166534] flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Producto reconocido en catálogo</p>
                          <p className="px-2 py-1.5 rounded-lg bg-[#dcfce7] text-sm font-bold truncate" title="El nombre del producto existente no se cambia">{match.name}</p>
                          <p className="text-[10px] text-[#166534] mt-0.5">Solo se actualizarán las <b>unidades</b> y los <b>costos</b>. Nombre, foto y precio de venta se mantienen.</p>
                          {i._readName && normalizeName(i._readName) !== normalizeName(match.name) && (
                            <p className="text-[10px] text-[#756c7e] mt-0.5 truncate">En la factura: “{i._readName}” · <button type="button" onClick={() => update(i._key, { _matchId: null, name: i._readName, common_name: '', sale_price: Number(i.catalog_price) || Number(i.cost_price) || 0, min_price: Number(i.cost_price) || 0 })} className="font-bold text-[#a43658] underline">No es el mismo</button></p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-[11px] font-bold text-[#7c43ba]">Producto nuevo</p>
                          <input value={i.name || ''} onChange={e => { update(i._key, { name: e.target.value, _readName: e.target.value }); rematch(i._key); }} className="w-full input-field rounded-lg px-2 py-1.5 text-sm font-bold min-w-0" placeholder="Nombre" aria-label="Nombre" />
                          {sugg && (
                            <p className="text-[10px] text-[#756c7e] mt-0.5">¿Es «<b className="text-[#201728]">{sugg.product.name}</b>»? <button type="button" onClick={() => update(i._key, { _matchId: sugg.product.id, _readName: String(i.name || '') })} className="font-bold text-[#166534] underline">Sí, es ese</button></p>
                          )}
                        </>
                      )}
                      <p className="text-[11px] text-[#756c7e] mt-0.5 truncate">
                        {[i.brand, i.content_value ? `${i.content_value} ${i.content_unit || ''}` : '', i._catalogName && pv.target === 'auto' ? `→ ${i._catalogName}` : ''].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  {(match || i._note) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5 ml-6">
                      {match && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] flex items-center gap-1"><PackageCheck className="w-3 h-3" /> Stock: {match.stock} u. + {i.stock} = {Number(match.stock) + Number(i.stock || 0)} u.</span>}
                      {i._note && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${i._note.includes('⚠') ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#f3eef6] text-[#756c7e]'}`}>{i._note}</span>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 mt-2 ml-6">
                    <label className="text-[10px] font-bold text-[#756c7e]">Cantidad (unidades)
                      <NumField value={i.stock as number} onValue={n => update(i._key, { stock: n ?? 0 })} label="Cantidad" className="w-full input-field rounded-lg px-2 py-1 text-sm text-[#201728]" />
                    </label>
                    <label className="text-[10px] font-bold text-[#756c7e]">Código del producto
                      <input value={String(i.sku || '')} onChange={e => { update(i._key, { sku: e.target.value.trim() }); rematch(i._key); }} className="w-full input-field rounded-lg px-2 py-1 text-sm text-[#201728] font-mono" aria-label="Código del producto" placeholder="Ej. 5109" />
                    </label>
                  </div>
                  <div className="mt-2 ml-6">
                    <PriceFields compact idPrefix={i._key}
                      value={{ cost: i.cost_price as number, min: minShown ?? null, sale: (match ? null : i.sale_price) as number | null }}
                      onChange={pt => update(i._key, {
                        ...(pt.cost !== undefined ? { cost_price: pt.cost ?? 0 } : {}),
                        ...(pt.min !== undefined ? { min_price: pt.min ?? 0, _minEdited: true } : {}),
                        ...(pt.sale !== undefined ? { sale_price: pt.sale ?? 0 } : {}),
                      })}
                      currency={cur}
                      costReadOnlyNote={conv(i.cost_price) ? `En ${app}:${conv(i.cost_price).replace(' →', '')}` : undefined}
                      saleLocked={match ? `${formatUSD(match.sale_price)} (se mantiene)` : undefined}
                    />
                    <label className="block text-[10px] font-bold text-[#756c7e] mt-2">Precio de revista de la empresa ({cur}, opcional)
                      <NumField value={i.catalog_price as number | null} onValue={n => update(i._key, { catalog_price: n })} label="Precio de catálogo" className="w-full input-field rounded-lg px-2 py-1 text-sm text-[#201728]" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-4 border-t border-[#ede7f0] flex gap-2">
          <button type="button" onClick={cancel} className="flex-1 py-3 rounded-xl btn-ghost font-bold">Cancelar</button>
          <button type="button" disabled={saving || included.length === 0} onClick={save} className={`flex-1 py-3 rounded-xl btn-success font-bold flex items-center justify-center gap-2 ${missingTarget ? 'opacity-60' : ''}`}>
            {saving ? <><Loader className="w-4 h-4 animate-spin" /> Guardando...</> : <>Guardar {included.length}</>}
          </button>
        </div>
      </article>
    </Modal>
  );
}

const BACKUP_KIND: Record<string, string> = { auto: 'Automático', manual: 'Manual', 'antes-de-restaurar': 'Antes de restaurar' };
const kb = (n: number | null) => (n ? (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : '');

/** Respaldos guardados en Supabase (un respaldo diario automático y los que hagas a mano) */
function CloudBackups() {
  const store = useStore(s => s.activeStore);
  const isAdmin = useStore(s => s.isAdmin());
  const isOwnerAdmin = useStore(s => s.currentUser.role === 'admin');
  const [list, setList] = useState<CloudBackup[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [auto, setAuto] = useState(isAutoBackupOn());

  const load = () => listCloudBackups().then(l => { setList(l); setError(''); }).catch(e => { setList([]); setError((e as Error).message); });
  useEffect(() => { if (store && isAdmin) load(); }, [store, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!store || !isAdmin) return null;

  const now = async () => {
    setBusy('now');
    try { await backupNow('manual'); toast('Respaldo en la nube creado ✓'); await load(); } catch (e) { toast((e as Error).message, 4500); }
    setBusy('');
  };
  const restore = async (b: CloudBackup) => {
    if (!confirm(`¿Restaurar el respaldo del ${new Date(b.created_at).toLocaleString('es')}?\n\nSe reemplazarán catálogos, productos, clientes y fiados por los de ese respaldo. Las ventas se conservan.\nAntes se guarda una copia del estado actual.`)) return;
    setBusy(b.id);
    try { await restoreCloudBackup(b.id); toast('Respaldo restaurado ✓', 3500); closeModal('backup-modal'); } catch (e) { toast((e as Error).message, 5000); }
    setBusy('');
  };

  return (
    <div className="mt-5 pt-5 border-t border-[#ede7f0]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-bold text-sm flex items-center gap-2"><Cloud className="w-4 h-4 text-[#7c43ba]" /> Respaldos en la nube</p>
        <button type="button" disabled={busy === 'now'} onClick={now} className="btn-primary rounded-full px-3 py-1.5 text-xs font-bold">{busy === 'now' ? 'Respaldando...' : 'Respaldar ahora'}</button>
      </div>
      <label className="flex items-center gap-2 text-xs text-[#756c7e] mb-3 cursor-pointer">
        <input type="checkbox" checked={auto} onChange={e => { setAuto(e.target.checked); setAutoBackup(e.target.checked); }} className="accent-[#7c43ba]" />
        Respaldo automático diario (al abrir la app, en este dispositivo)
      </label>
      {error && <p className="text-xs text-[#92400e] bg-[#fffbeb] border border-[#fde68a] rounded-xl p-3 mb-2">{error}</p>}
      {list === null && <p className="text-xs text-[#756c7e]">Cargando...</p>}
      {list && list.length === 0 && !error && <p className="text-xs text-[#756c7e]">Aún no hay respaldos en la nube.</p>}
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {list?.map(b => (
          <div key={b.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-[#faf7fc]">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs">{new Date(b.created_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {BACKUP_KIND[b.kind] || b.kind}</p>
              <p className="text-[10px] text-[#756c7e]">{b.counts?.products ?? 0} productos · {b.counts?.customers ?? 0} clientes · {b.counts?.sales ?? 0} ventas {kb(b.size_bytes) && `· ${kb(b.size_bytes)}`}</p>
            </div>
            {isOwnerAdmin && <button type="button" disabled={!!busy} onClick={() => restore(b)} className="btn-ghost rounded-full px-3 py-1.5 text-[11px] font-bold">{busy === b.id ? '...' : 'Restaurar'}</button>}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#756c7e] mt-2">Se guardan los 20 más recientes. Solo el administrador puede restaurar.</p>
    </div>
  );
}

export function BackupModal() {
  return (
    <Modal id="backup-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5"><h2 className="font-bold text-xl hero-title">Respaldo de datos</h2><CloseButton onClick={() => closeModal('backup-modal')} /></div>
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] border border-[#bbf7d0] mb-4">
          <div className="flex items-start gap-3"><ShieldCheck className="w-5 h-5 text-[#166534] flex-shrink-0 mt-0.5" /><div><p className="font-bold text-sm text-[#166534]">Protege tus datos</p><p className="text-xs text-[#756c7e] mt-1">Copia de seguridad de todos tus productos (con fotos), ventas y catálogos.</p></div></div>
        </div>
        <div className="space-y-3">
          <button onClick={createBackup} className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-[#ede7f0] hover:border-[#7c43ba] hover:bg-[#f6f1f8] transition text-left">
            <div className="w-10 h-10 rounded-xl bg-[#7c43ba]/10 grid place-items-center"><Download className="w-5 h-5 text-[#7c43ba]" /></div>
            <div className="flex-1"><p className="font-bold text-sm">Crear respaldo</p><p className="text-xs text-[#756c7e]">Descarga todos tus datos</p></div>
          </button>
          <label className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-[#d4c5e0] hover:border-[#7c43ba] hover:bg-[#f6f1f8] transition text-left cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-[#23805d]/10 grid place-items-center"><Upload className="w-5 h-5 text-[#23805d]" /></div>
            <div className="flex-1"><p className="font-bold text-sm">Restaurar respaldo</p><p className="text-xs text-[#756c7e]">Recupera datos de un archivo</p></div>
            <input type="file" accept=".json" className="hidden" onChange={async e => {
              const f = e.target.files?.[0];
              if (f && await restoreBackup(f)) closeModal('backup-modal');
              e.target.value = '';
            }} />
          </label>
        </div>
        <div className="mt-4 p-3 rounded-xl bg-[#fffbeb] border border-[#fde68a]"><p className="text-xs text-[#92400e]"><AlertCircle className="w-3 h-3 inline" /> <b>Importante:</b> Al restaurar se reemplazan los datos actuales. Crea un respaldo antes de restaurar.</p></div>
        <CloudBackups />
      </article>
    </Modal>
  );
}
