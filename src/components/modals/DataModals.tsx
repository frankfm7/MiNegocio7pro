import { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowRightLeft, Cloud, Download, PackageCheck, Receipt, FileImage, FileJson, FileSpreadsheet, FileText, FileType, Images, Info, Loader, QrCode, ScanText, ShieldCheck, Upload,
} from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, setState, toast, useStore } from '../../store';
import { backupNow, isAutoBackupOn, listCloudBackups, restoreCloudBackup, setAutoBackup } from '../../lib/cloudBackup';
import type { CloudBackup } from '../../types';
import { createBackup, restoreBackup } from '../../lib/exporters';
import { commitImport, exportCSV, exportExcel, exportJSON, exportPDF, importAnyFile, importInvoiceImages, importPhotosAsProducts, importPriceListImage, invoiceFactor } from '../../lib/io';
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
          <FileRow icon={<Receipt className="w-4 h-4" />} color="#be416d" title="Foto de factura, recibo o detalle de pedido" text="Ésika, L'Bel, Cyzone, Yanbal y otros · suma stock y precios de catálogo · varias fotos = varias páginas" accept="image/*" multiple onFiles={runFiles(f => importInvoiceImages(f))} />
          <FileRow icon={<ScanText className="w-4 h-4" />} color="#d97706" title="Foto de una lista de precios" text="Lee el texto de la imagen (nombre y precio)" accept="image/*" onFiles={runFiles(f => importPriceListImage(f[0]))} />
        </div>
        <p className="text-[11px] text-[#756c7e] mt-3">Antes de guardar verás la lista para revisar nombres, precios y el catálogo de destino.</p>
      </article>
    </Modal>
  );
}

export function ImportPreviewModal() {
  const pv = useStore(s => s.importPreview);
  const catalogs = useStore(s => s.catalogs);
  const records = useStore(s => s.records);
  const app = useStore(s => s.appCurrency);
  const [saving, setSaving] = useState(false);
  if (!pv) return <Modal id="import-preview-modal" closeOnBackdrop={false}>{null}</Modal>;

  const normalizeName = (n: string) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const update = (key: string, patch: Record<string, unknown>) =>
    setState({ importPreview: { ...pv, items: pv.items.map(i => (i._key === key ? { ...i, ...patch } : i)) } });
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
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
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
              {inv.currency !== app && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 font-bold"><input type="checkbox" checked={inv.convert} onChange={e => setInvoice({ convert: e.target.checked })} className="accent-[#7c43ba]" /> Convertir a {app}</label>
                  <span className="flex items-center gap-1"><ArrowRightLeft className="w-3.5 h-3.5" /> 1 USD =</span>
                  <input type="number" step="0.01" min={0} value={inv.rate} onChange={e => setInvoice({ rate: Number(e.target.value) })} className="input-field rounded-lg px-2 py-1 w-20 text-sm" aria-label="Tipo de cambio" />
                  <span>Bs</span>
                </div>
              )}
              {inv.currency !== app && app === 'USD' && inv.currency === 'Bs' && (
                <p className="text-[11px] text-[#92400e] sm:col-span-2">Tu app está en USD. Si vendes en bolivianos, cambia la moneda en <b>Menú → Datos del negocio</b>.</p>
              )}
            </div>
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
              return (
                <div key={i._key} className={`p-2.5 rounded-2xl border ${i._include ? 'border-[#ede7f0] bg-white' : 'border-dashed border-[#e8dfec] opacity-55'}`}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <input type="checkbox" checked={i._include} onChange={e => update(i._key, { _include: e.target.checked })} className="w-4 h-4 accent-[#7c43ba] flex-shrink-0" aria-label="Incluir" />
                    <div className="w-11 h-11 rounded-xl product-photo-frame flex-shrink-0 grid place-items-center overflow-hidden">
                      {match?.image_url || i.image_url ? <img src={cardImage({ image_url: (match?.image_url || i.image_url) as string })} alt="" className="w-full h-full object-contain" /> : <FileImage className="w-5 h-5 text-[#d4c5e0]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {match
                        ? <p className="px-2 py-1.5 rounded-lg bg-[#f0fdf4] text-sm font-bold truncate" title="El nombre del producto existente no se cambia">{match.name}</p>
                        : <input value={i.name || ''} onChange={e => update(i._key, { name: e.target.value })} className="w-full input-field rounded-lg px-2 py-1.5 text-sm font-bold min-w-0" placeholder="Nombre" />}
                      {match && i._readName && normalizeName(i._readName) !== normalizeName(match.name) && (
                        <p className="text-[10px] text-[#756c7e] mt-0.5 truncate">En la factura: “{i._readName}” · <button type="button" onClick={() => update(i._key, { _matchId: null, name: i._readName, common_name: '', sale_price: Number(i.catalog_price) || Number(i.cost_price) || 0, min_price: Number(i.cost_price) || 0 })} className="font-bold text-[#a43658] underline">No es el mismo</button></p>
                      )}
                      <p className="text-[11px] text-[#756c7e] mt-0.5 truncate">
                        {[i.sku ? `Cód. ${i.sku}` : '', i.brand, i.content_value ? `${i.content_value} ${i.content_unit || ''}` : '', i._catalogName && pv.target === 'auto' ? `→ ${i._catalogName}` : ''].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  {(match || i._note) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5 ml-6">
                      {match && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] flex items-center gap-1"><PackageCheck className="w-3 h-3" /> Ya existe: {match.stock} u. + {i.stock} = {Number(match.stock) + Number(i.stock || 0)} u.</span>}
                      {i._note && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${i._note.includes('⚠') ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#f3eef6] text-[#756c7e]'}`}>{i._note}</span>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2 ml-6">
                    <label className="text-[10px] font-bold text-[#756c7e]">Cantidad
                      <input type="number" min={0} value={num(i.stock)} onChange={e => update(i._key, { stock: Number(e.target.value) })} className="w-full input-field rounded-lg px-2 py-1 text-sm text-[#201728]" />
                    </label>
                    <label className="text-[10px] font-bold text-[#756c7e]">Costo ({cur})
                      <input type="number" step="0.01" min={0} value={num(i.cost_price)} onChange={e => update(i._key, { cost_price: Number(e.target.value) })} className="w-full input-field rounded-lg px-2 py-1 text-sm text-[#201728]" />
                      {conv(i.cost_price) && <span className="block font-normal">{conv(i.cost_price)}</span>}
                    </label>
                    <label className="text-[10px] font-bold text-[#756c7e]">Precio catálogo ({cur})
                      <input type="number" step="0.01" min={0} value={num(i.catalog_price)} onChange={e => update(i._key, { catalog_price: e.target.value === '' ? null : Number(e.target.value) })} className="w-full input-field rounded-lg px-2 py-1 text-sm text-[#201728]" />
                      {conv(i.catalog_price) && <span className="block font-normal">{conv(i.catalog_price)}</span>}
                    </label>
                    {match ? (
                      <div className="text-[10px] font-bold text-[#7c43ba]">Tu precio (se mantiene)
                        <p className="w-full rounded-lg px-2 py-1 text-sm font-bold text-[#201728] bg-[#f6f1f8]">{formatUSD(match.sale_price)}</p>
                      </div>
                    ) : (
                      <label className="text-[10px] font-bold text-[#7c43ba]">Tu precio ({cur})
                        <input type="number" step="0.01" min={0} value={num(i.sale_price)} onChange={e => update(i._key, { sale_price: Number(e.target.value), min_price: Math.min(Number(i.min_price) || 0, Number(e.target.value)) })} className="w-full input-field rounded-lg px-2 py-1 text-sm font-bold text-[#201728]" />
                        {conv(i.sale_price) && <span className="block font-normal">{conv(i.sale_price)}</span>}
                      </label>
                    )}
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
