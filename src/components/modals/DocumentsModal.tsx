import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, FileSpreadsheet, Loader, RefreshCw, Receipt, Search, Send, Wallet } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, setState, toast, useStore } from '../../store';
import { generateDailyCloseImage, openReceiptByNumber, sendReceiptImage } from '../../actions';
import { loadDocuments } from '../../lib/documents';
import { exportSalesCSV, exportSalesXLSX } from '../../lib/exporters';
import { formatUSD } from '../../lib/format';
import { normalize } from '../../lib/search';
import type { DocRecord } from '../../types';

type Tab = 'recibo' | 'cierre' | 'informe';
const TABS: [Tab, string, typeof Receipt][] = [['recibo', 'Recibos', Receipt], ['cierre', 'Cierres de caja', Wallet], ['informe', 'Informes', BarChart3]];

const when = (iso: string) => new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Revisión de recibos, cierres de caja e informes emitidos: ver y reenviar */
export default function DocumentsModal() {
  const open = useStore(s => !!s.modals['documents-modal']);
  const initialQuery = useStore(s => s.docsQuery);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('recibo');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try { setDocs(await loadDocuments()); } catch (e) { toast('No se pudo cargar el historial: ' + (e as Error).message); }
    setLoading(false);
  };
  useEffect(() => {
    if (!open) return;
    setQ(initialQuery || '');
    if (initialQuery) { setTab(/-C-/.test(initialQuery) ? 'cierre' : /-I-/.test(initialQuery) ? 'informe' : 'recibo'); setState({ docsQuery: '' }); }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = useMemo(() => {
    const n = normalize(q);
    return docs.filter(d => d.kind === tab).filter(d => !n || normalize([d.code, d.by, d.ref, d.data?.customer?.name, d.data?.extra?.invoice, d.data?.extra?.order, ...(d.data?.items || []).map((i: { product?: { name?: string } }) => i.product?.name)].filter(Boolean).join(' ')).includes(n));
  }, [docs, tab, q]);
  const count = (t: Tab) => docs.filter(d => d.kind === t).length;

  const run = async (key: string, fn: () => Promise<unknown> | unknown) => { setBusy(key); try { await fn(); } finally { setBusy(''); } };

  return (
    <Modal id="documents-modal">
      <article className="modal-card w-full max-w-2xl bg-white rounded-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-start gap-3 p-4 sm:p-5 border-b border-[#ede7f0]">
          <div className="min-w-0"><h2 className="font-bold text-xl hero-title">Recibos y cierres</h2><p className="text-xs text-[#756c7e]">Revisa, vuelve a abrir y reenvía lo que se emitió</p></div>
          <div className="flex gap-2 flex-shrink-0">
            <button type="button" onClick={load} className="w-9 h-9 rounded-full bg-[#f1ecf4] grid place-items-center" aria-label="Actualizar" title="Actualizar"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <CloseButton onClick={() => closeModal('documents-modal')} />
          </div>
        </div>
        <div className="px-4 sm:px-5 pt-3 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {TABS.map(([t, label, Icon]) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`py-2 rounded-xl text-[11px] sm:text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 ${tab === t ? 'bg-[#7c43ba] text-white' : 'bg-[#f3eef6] text-[#5f3291]'}`}>
                <Icon className="w-4 h-4" /> {label} <span className="opacity-70">({count(t)})</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#756c7e]" />
            <input value={q} onChange={e => setQ(e.target.value)} className="w-full input-field rounded-xl py-2 pl-9 pr-3 text-sm" placeholder="Buscar por número, cliente, producto, vendedor..." />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
          {loading && !docs.length && <p className="text-sm text-[#756c7e] flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Cargando...</p>}
          {!loading && !shown.length && (
            <p className="text-center text-sm text-[#756c7e] py-10">{q ? 'Nada coincide con la búsqueda.' : tab === 'recibo' ? 'Aún no hay recibos numerados.' : tab === 'cierre' ? 'Aún no hay cierres numerados. Se numeran al enviar, copiar o generar la imagen del cierre.' : 'Aún no hay informes. Se numeran al exportar en Excel o CSV desde Informes.'}</p>
          )}
          {shown.map(d => (
            <div key={d.kind + d.code} className="doc-row rounded-2xl border border-[#ede7f0] p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm font-mono">{d.code}</p>
                <p className="text-[11px] text-[#756c7e] truncate">
                  {d.kind === 'cierre' && d.ref ? `Día ${new Date(d.ref + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · ` : ''}
                  {d.kind === 'informe' && d.data ? `${d.data.format || ''} · ${d.data.count || 0} ventas · ` : ''}
                  {d.kind === 'recibo' && d.data?.customer?.name ? `${d.data.customer.name} · ` : ''}
                  {d.kind === 'recibo' && d.data?.items ? `${d.data.items.length} prod. · ` : ''}
                  {when(d.date)}{d.by ? ` · ${d.by}` : ''}
                </p>
              </div>
              {d.total != null && <p className="font-bold text-sm text-[#7c43ba] whitespace-nowrap">{formatUSD(d.total)}</p>}
              <div className="flex gap-1.5 flex-shrink-0">
                {d.kind === 'recibo' && <>
                  <button type="button" title="Ver recibo" aria-label="Ver recibo" onClick={() => run('v' + d.code, () => openReceiptByNumber(d.code, d.data))} className="w-9 h-9 rounded-xl btn-ghost grid place-items-center">{busy === 'v' + d.code ? <Loader className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}</button>
                  <button type="button" title="Reenviar (imagen)" aria-label="Reenviar recibo" onClick={() => run('s' + d.code, async () => { await openReceiptByNumber(d.code, d.data); await sendReceiptImage(); })} className="w-9 h-9 rounded-xl bg-[#25D366] text-white grid place-items-center">{busy === 's' + d.code ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
                </>}
                {d.kind === 'cierre' && d.ref && (
                  <button type="button" title="Ver / enviar cierre" onClick={() => run('c' + d.code, () => generateDailyCloseImage(d.ref!))} className="h-9 px-3 rounded-xl btn-primary text-xs font-bold flex items-center gap-1">{busy === 'c' + d.code ? <Loader className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Ver</button>
                )}
                {d.kind === 'informe' && (
                  <button type="button" title="Descargar otra vez (mismo número, ventas actuales)" onClick={() => run('i' + d.code, () => (d.data?.format === 'CSV' ? exportSalesCSV(d.code) : exportSalesXLSX(d.code)))} className="h-9 px-3 rounded-xl btn-ghost text-xs font-bold flex items-center gap-1"><FileSpreadsheet className="w-4 h-4" /> Bajar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </article>
    </Modal>
  );
}
