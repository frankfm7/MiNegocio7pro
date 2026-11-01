import { useEffect, useState } from 'react';
import {
  AlertCircle, Cloud, Download, FileImage, FileJson, FileSpreadsheet, FileText, FileType, Images, Info, Loader, QrCode, ScanText, ShieldCheck, Upload,
} from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, setState, toast, useStore } from '../../store';
import { backupNow, isAutoBackupOn, listCloudBackups, restoreCloudBackup, setAutoBackup } from '../../lib/cloudBackup';
import type { CloudBackup } from '../../types';
import { createBackup, restoreBackup } from '../../lib/exporters';
import { commitImport, exportCSV, exportExcel, exportJSON, exportPDF, importAnyFile, importPhotosAsProducts, importPriceListImage } from '../../lib/io';
import { exportCatalogQRsPDF } from '../../lib/qr';
import { cardImage, formatUSDShort } from '../../lib/format';

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
  const [saving, setSaving] = useState(false);
  if (!pv) return <Modal id="import-preview-modal" closeOnBackdrop={false}>{null}</Modal>;

  const update = (key: string, patch: Record<string, unknown>) =>
    setState({ importPreview: { ...pv, items: pv.items.map(i => (i._key === key ? { ...i, ...patch } : i)) } });
  const included = pv.items.filter(i => i._include).length;
  const withImages = pv.items.filter(i => i._include && i.image_url).length;
  const hasAuto = pv.items.some(i => i._catalogName) || pv.catalogs.length > 0;
  const cancel = () => { setState({ importPreview: null }); closeModal('import-preview-modal'); };
  const save = async () => { setSaving(true); await commitImport(); setSaving(false); closeModal('import-preview-modal'); };

  return (
    <Modal id="import-preview-modal" className="z-[70] bg-[#1e1427]/70" closeOnBackdrop={false}>
      <article className="modal-card w-full max-w-2xl bg-white rounded-3xl max-h-[94vh] flex flex-col">
        <div className="p-5 border-b border-[#ede7f0] flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-xl hero-title">Revisar importación</h2>
            <p className="text-xs text-[#756c7e] mt-1 truncate">{pv.source} · {included} de {pv.items.length} productos · {withImages} con foto</p>
          </div>
          <CloseButton onClick={cancel} />
        </div>
        <div className="p-5 border-b border-[#ede7f0] grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1">Guardar en</label>
            <select value={pv.target} onChange={e => setState({ importPreview: { ...pv, target: e.target.value } })} className="w-full input-field rounded-xl p-2.5 text-sm">
              {hasAuto && <option value="auto">Según el archivo (crea catálogos si faltan)</option>}
              {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="new">➕ Catálogo nuevo…</option>
            </select>
          </div>
          {pv.target === 'new' && (
            <div>
              <label className="block text-xs font-bold mb-1">Nombre del catálogo nuevo</label>
              <input value={pv.newCatalogName} onChange={e => setState({ importPreview: { ...pv, newCatalogName: e.target.value } })} className="w-full input-field rounded-xl p-2.5 text-sm" />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2">
          {pv.items.map(i => (
            <div key={i._key} className={`flex items-center gap-2 sm:gap-3 p-2 rounded-2xl border ${i._include ? 'border-[#ede7f0] bg-white' : 'border-dashed border-[#e8dfec] opacity-50'}`}>
              <input type="checkbox" checked={i._include} onChange={e => update(i._key, { _include: e.target.checked })} className="w-4 h-4 accent-[#7c43ba] flex-shrink-0" aria-label="Incluir" />
              <div className="w-12 h-12 rounded-xl product-photo-frame flex-shrink-0 grid place-items-center overflow-hidden">
                {i.image_url ? <img src={cardImage(i as { image_url: string })} alt="" className="w-full h-full object-contain" /> : <FileImage className="w-5 h-5 text-[#d4c5e0]" />}
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_90px] gap-1.5">
                <input value={i.name || ''} onChange={e => update(i._key, { name: e.target.value })} className="input-field rounded-lg px-2 py-1.5 text-sm font-bold min-w-0" placeholder="Nombre" />
                <div className="flex items-center gap-1">
                  <input type="number" step="0.01" min={0} value={i.sale_price ?? 0} onChange={e => update(i._key, { sale_price: Number(e.target.value), min_price: i.min_price === i.sale_price ? Number(e.target.value) : i.min_price })} className="input-field rounded-lg px-2 py-1.5 text-sm w-full" aria-label="Precio" />
                </div>
                <p className="text-[11px] text-[#756c7e] truncate sm:col-span-2">
                  {[i.brand, i.content_value ? `${i.content_value} ${i.content_unit || ''}` : '', i._catalogName && pv.target === 'auto' ? `→ ${i._catalogName}` : '', `Stock ${i.stock ?? 1}`, `${formatUSDShort(i.sale_price)} USD`].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-[#ede7f0] flex gap-2">
          <button type="button" onClick={cancel} className="flex-1 py-3 rounded-xl btn-ghost font-bold">Cancelar</button>
          <button type="button" disabled={saving || included === 0} onClick={save} className="flex-1 py-3 rounded-xl btn-success font-bold flex items-center justify-center gap-2">
            {saving ? <><Loader className="w-4 h-4 animate-spin" /> Guardando...</> : <>Importar {included}</>}
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
