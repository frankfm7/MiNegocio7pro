import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader, Trash2, Upload } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, openModal, toast, useStore } from '../../store';
import { MAG_BRANDS, createMagazine, deleteMagazine, listMagazines, loadShopInfo, pageUrl, pdfPages, photoPages, saveShopInfo, updateMagazine, type Magazine, type ShopInfo } from '../../lib/magazines';

/** Revistas de la empresa para que los clientes pidan desde el catálogo público + datos de la tienda */
export default function MagazinesModal() {
  const open = useStore(s => !!s.modals['magazines-modal']);
  const store = useStore(s => s.activeStore);
  const [list, setList] = useState<Magazine[]>([]);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState(MAG_BRANDS[0]);
  const [title, setTitle] = useState('');
  const [until, setUntil] = useState('');
  const [eta, setEta] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState('');
  const [info, setInfo] = useState<ShopInfo>({});
  const [savingInfo, setSavingInfo] = useState(false);

  const load = async () => {
    try { setList(await listMagazines()); setInfo(await loadShopInfo()); setError(''); }
    catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { if (open && store) void load(); }, [open, store]);

  const upload = async () => {
    if (!files.length) { toast('Elige el PDF de la revista o las fotos de sus páginas'); return; }
    try {
      const pdf = files.find(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
      setProgress('Preparando páginas…');
      const pages = pdf ? await pdfPages(pdf, (d, t) => setProgress(`Leyendo página ${d} de ${t}…`)) : await photoPages(files.filter(f => f.type.startsWith('image/')), (d, t) => setProgress(`Preparando foto ${d} de ${t}…`));
      if (!pages.length) throw new Error('No se encontraron páginas');
      await createMagazine({ brand, title: title.trim() || `${brand} ${new Date().toLocaleDateString('es', { month: 'long' })}`, valid_until: until || null, eta_days: eta ? Number(eta) : null }, pages, (d, t) => setProgress(`Subiendo página ${d} de ${t}…`));
      toast(`✅ Revista con ${pages.length} páginas publicada`);
      setFiles([]); setTitle(''); setUntil('');
      await load();
    } catch (e) { toast((e as Error).message, 5000); }
    setProgress('');
  };

  const saveInfo = async () => {
    setSavingInfo(true);
    try { await saveShopInfo({ ...info, eta_days: info.eta_days ? Number(info.eta_days) : null }); toast('Datos de la tienda guardados ✓'); }
    catch (e) { toast((e as Error).message, 4500); }
    setSavingInfo(false);
  };
  const field = (k: keyof ShopInfo, label: string, ph: string) => (
    <div><label className="block text-xs font-bold mb-1">{label}</label><input value={String(info[k] ?? '')} onChange={e => setInfo({ ...info, [k]: e.target.value })} className="w-full input-field rounded-xl p-2.5 text-sm" placeholder={ph} /></div>
  );

  return (
    <Modal id="magazines-modal" className="z-[60] bg-[#1e1427]/60">
      <article className="modal-card w-full max-w-lg bg-white rounded-3xl p-5 max-h-[94vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-1"><h2 className="font-bold text-xl hero-title">Revistas para pedidos</h2><CloseButton onClick={() => closeModal('magazines-modal')} /></div>
        <p className="text-xs text-[#756c7e] mb-4">Sube la revista de la campaña (Ésika, L'Bel, Cyzone, Yanbal…). Tus clientes la hojean en tu <b>catálogo público</b>, eligen por código y te mandan el pedido; tú lo armas con la empresa y se lo entregas cuando llegue.</p>
        {!store && <p className="text-sm text-[#756c7e]">Necesitas tu tienda en la nube.</p>}
        {error && <p className="p-3 rounded-xl bg-[#fffbeb] border border-[#fde68a] text-sm text-[#92400e] mb-3">{error}</p>}

        <section className="rounded-2xl border border-[#ede7f0] p-3 mb-4">
          <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Upload className="w-4 h-4 text-[#7c43ba]" /> Subir una revista</h3>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div><label className="block text-xs font-bold mb-1">Empresa</label><select value={brand} onChange={e => setBrand(e.target.value)} className="w-full input-field rounded-xl p-2.5 text-sm">{MAG_BRANDS.map(b => <option key={b}>{b}</option>)}</select></div>
            <div><label className="block text-xs font-bold mb-1">Nombre</label><input id="mag-title" value={title} onChange={e => setTitle(e.target.value)} className="w-full input-field rounded-xl p-2.5 text-sm" placeholder="Campaña 17" /></div>
            <div><label className="block text-xs font-bold mb-1">Vigente hasta</label><input type="date" value={until} onChange={e => setUntil(e.target.value)} className="w-full input-field rounded-xl p-2.5 text-sm" /></div>
            <div><label className="block text-xs font-bold mb-1">Llega en (días)</label><input value={eta} onChange={e => setEta(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-full input-field rounded-xl p-2.5 text-sm" placeholder={info.eta_days ? String(info.eta_days) : 'Ej: 7'} /></div>
          </div>
          <label className="block w-full py-3 rounded-xl border-2 border-dashed border-[#cbbdd6] text-center text-sm font-bold text-[#7c43ba] cursor-pointer mb-2">
            {files.length ? `${files.length === 1 ? files[0].name : files.length + ' fotos'} ✓` : '📄 Elegir PDF o fotos de las páginas'}
            <input id="mag-files" type="file" accept="application/pdf,.pdf,image/*" multiple className="hidden" onChange={e => { setFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          </label>
          <button type="button" id="mag-upload" disabled={!!progress || !files.length} onClick={upload} className="w-full py-3 rounded-xl btn-primary font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">{progress ? <><Loader className="w-4 h-4 animate-spin" /> {progress}</> : 'Publicar revista'}</button>
          <p className="text-[10px] text-[#756c7e] mt-1.5">Hasta 120 páginas. Con PDF es más rápido y nítido. Las páginas son públicas (como la revista impresa).</p>
        </section>

        <h3 className="font-bold text-sm mb-2">Tus revistas ({list.length})</h3>
        <div className="space-y-2 mb-5">
          {list.map(m => {
            const expired = m.valid_until && m.valid_until < new Date().toISOString().slice(0, 10);
            return (
              <div key={m.id} className={`mag-row flex items-center gap-3 p-2 rounded-xl border border-[#ede7f0] ${m.active === false || expired ? 'opacity-60' : ''}`}>
                {m.pages[0] ? <img src={pageUrl(m.pages[0])} alt="" className="w-12 h-16 rounded-md object-cover bg-[#f6f1f8]" /> : <div className="w-12 h-16 rounded-md bg-[#f6f1f8]" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{m.brand} · {m.title}</p>
                  <p className="text-[11px] text-[#756c7e]">{m.pages.length} páginas{m.valid_until ? ` · hasta ${new Date(m.valid_until + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : ''}{m.eta_days ? ` · llega en ${m.eta_days} días` : ''}{expired ? ' · vencida' : m.active === false ? ' · oculta' : ''}</p>
                </div>
                <button type="button" title={m.active === false ? 'Mostrar a los clientes' : 'Ocultar'} onClick={async () => { try { await updateMagazine(m.id, { active: m.active === false }); await load(); } catch (e) { toast((e as Error).message); } }} className="w-9 h-9 rounded-full hover:bg-[#f6f1f8] grid place-items-center">{m.active === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-[#23805d]" />}</button>
                <button type="button" title="Borrar" onClick={async () => { if (!confirm(`¿Borrar la revista "${m.title}"?`)) return; try { await deleteMagazine(m); await load(); toast('Revista borrada'); } catch (e) { toast((e as Error).message); } }} className="w-9 h-9 rounded-full hover:bg-[#fff0f3] text-[#a43658] grid place-items-center"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          {!list.length && !error && <p className="text-xs text-[#756c7e] text-center py-4">Aún no subiste revistas.</p>}
        </div>

        <section id="shop-info" className="rounded-2xl bg-[#f6f1f8] p-3">
          <h3 className="font-bold text-sm mb-1">Datos de tu tienda para los clientes</h3>
          <p className="text-[11px] text-[#756c7e] mb-2">Se muestran en el catálogo público y en cada pedido.</p>
          <div className="space-y-2">
            {field('address', 'Dirección / punto de entrega', 'Ej: Av. Busch #123, frente al mercado')}
            {field('hours', 'Horario de atención', 'Ej: Lun a Sáb 9:00–19:00')}
            {field('delivery', 'Entrega', 'Ej: Delivery gratis en la zona norte, o recojo en tienda')}
            <div className="grid grid-cols-2 gap-2">
              {field('eta_days', 'Pedidos de revista llegan en (días)', 'Ej: 7')}
              {field('phone', 'Teléfono', 'Ej: 71101154')}
            </div>
            {field('about', 'Mensaje para tus clientes', 'Ej: Somos consultoras Yanbal y Ésika desde 2015')}
          </div>
          <button type="button" id="shop-info-save" disabled={savingInfo} onClick={saveInfo} className="mt-3 w-full py-2.5 rounded-xl btn-primary font-bold text-sm">{savingInfo ? 'Guardando…' : 'Guardar datos'}</button>
          <button type="button" onClick={() => { closeModal('magazines-modal'); setTimeout(() => openModal('public-shop-modal'), 120); }} className="mt-2 w-full text-xs font-bold text-[#7c43ba] underline">Ver el enlace de mi catálogo público</button>
        </section>
      </article>
    </Modal>
  );
}
