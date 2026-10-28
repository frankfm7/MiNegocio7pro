import { useEffect, useState } from 'react';
import { Copy, FileUp, Mail, MessageCircle, Pencil, X } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, getState, openModal, toast, useStore } from '../../store';
import { deleteCatalogWithConfirm, openCatalogForm } from '../../actions';
import { DB } from '../../lib/db';
import { coverFor, fallbackCover } from '../../lib/constants';
import { readFileAsBase64 } from '../../lib/image';

const COLORS = ['#7c43ba', '#be416d', '#23805d', '#3875a5', '#d97706', '#6b7280'];

export function CreateCatalogModal() {
  return (
    <Modal id="create-catalog-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-5"><h2 className="font-bold text-xl hero-title">Nuevo Catálogo</h2><CloseButton onClick={() => closeModal('create-catalog-modal')} /></div>
        <p className="text-sm text-[#756c7e]">¿Cómo quieres crear el catálogo?</p>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="option-card" onClick={() => { closeModal('create-catalog-modal'); setTimeout(() => openCatalogForm(), 100); }}>
            <Pencil className="w-8 h-8" /><p className="font-bold text-sm text-center">Crear manual</p><p className="text-xs text-[#756c7e] text-center">Diseña tu catálogo</p>
          </button>
          <button className="option-card" onClick={() => { closeModal('create-catalog-modal'); setTimeout(() => openModal('import-export-modal'), 100); }}>
            <FileUp className="w-8 h-8" /><p className="font-bold text-sm text-center">Desde archivo</p><p className="text-xs text-[#756c7e] text-center">Excel, CSV o JSON</p>
          </button>
        </div>
      </article>
    </Modal>
  );
}

export function CatalogFormModal() {
  const open = useStore(s => !!s.modals['catalog-modal']);
  const editingId = useStore(s => s.editingCatalogId);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const cat = editingId ? getState().catalogs.find(c => c.id === editingId) : null;
    setName(cat?.name || ''); setLabel(cat?.label || ''); setColor(cat?.color || COLORS[0]);
    setFile(null); setPreview(cat ? (cat.cover && cat.cover !== fallbackCover ? cat.cover : coverFor(cat.color, cat.name)) : null);
  }, [open, editingId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const l = label.trim() || n.toUpperCase().slice(0, 15);
    let cover = editingId ? getState().catalogs.find(c => c.id === editingId)?.cover || fallbackCover : fallbackCover;
    if (file) {
      try { cover = await readFileAsBase64(file); } catch { toast('Error imagen'); return; }
    }
    if (editingId) { await DB.updateCatalog(editingId, { name: n, label: l, color, cover }); toast('Catálogo actualizado ✓'); }
    else { await DB.createCatalog({ name: n, label: l, color, cover }); toast('Catálogo creado ✓'); }
    closeModal('catalog-modal');
  };

  return (
    <Modal id="catalog-modal">
      <form id="catalog-form" onSubmit={submit} className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto relative">
        <button type="button" onClick={() => closeModal('catalog-modal')} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#f1ecf4] grid place-items-center hover:bg-[#e8dfec] z-10"><X className="w-4 h-4" /></button>
        <h2 className="font-bold text-xl hero-title pr-10">{editingId ? 'Editar Catálogo' : 'Nuevo Catálogo'}</h2>
        <p className="text-sm mt-2 text-[#756c7e]">Crea una nueva categoría para organizar tus productos.</p>
        <label className="block text-sm font-bold mt-5 mb-1">Nombre del catálogo *</label>
        <input value={name} onChange={e => setName(e.target.value)} required maxLength={40} className="w-full input-field rounded-xl p-3" placeholder="Ej: Ropa deportiva" />
        <label className="block text-sm font-bold mt-4 mb-1">Etiqueta (corta)</label>
        <input value={label} onChange={e => setLabel(e.target.value)} maxLength={20} className="w-full input-field rounded-xl p-3" placeholder="Ej: DEPORTES" />
        <label className="block text-sm font-bold mt-4 mb-1">Color destacado</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
              className={`w-10 h-10 rounded-full cursor-pointer shadow-md ${color === c ? 'ring-4' : ''}`}
              style={{ background: c, ['--tw-ring-color' as string]: c + '4d' }} />
          ))}
        </div>
        <label className="block text-sm font-bold mt-4 mb-1">Imagen de portada</label>
        <input accept="image/*" className="w-full input-field rounded-xl p-2 text-xs" type="file" onChange={e => {
          const f = e.target.files?.[0];
          if (f) { setFile(f); setPreview(URL.createObjectURL(f)); toast('Imagen de catálogo cargada ✓'); }
        }} />
        {preview && <img src={preview} className="image-preview" style={{ display: 'block' }} alt="" />}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={() => closeModal('catalog-modal')} className="flex-1 btn-ghost rounded-xl py-3 font-bold">Cancelar</button>
          <button type="submit" className="flex-1 btn-primary rounded-xl py-3 font-bold">Guardar</button>
        </div>
        {editingId && (
          <button type="button" onClick={() => deleteCatalogWithConfirm(editingId)} className="w-full mt-3 rounded-xl py-2 text-sm font-bold text-[#a43658] hover:bg-[#fff0f3]">Eliminar este catálogo</button>
        )}
      </form>
    </Modal>
  );
}

export function ShareCatalogModal() {
  const share = useStore(s => s.share);
  const copy = () => {
    if (!share) return;
    navigator.clipboard.writeText(share.text).then(() => toast('Texto copiado ✓')).catch(() => toast('No se pudo copiar'));
  };
  return (
    <Modal id="share-catalog-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Compartir catálogo</h2><CloseButton onClick={() => closeModal('share-catalog-modal')} /></div>
        <p className="text-sm text-[#756c7e] mb-4">Comparte este catálogo con tus clientes.</p>
        <div className="p-3 rounded-xl bg-[#f6f1f8] mb-4">
          <p className="text-xs text-[#756c7e] uppercase tracking-wide mb-1">Texto para compartir</p>
          <div className="flex gap-2">
            <input type="text" readOnly value={share ? share.text.substring(0, 200) + '...' : ''} className="flex-1 input-field rounded-lg p-2 text-sm" />
            <button type="button" onClick={copy} className="btn-primary rounded-lg px-3"><Copy className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => share && window.open(`https://wa.me/?text=${encodeURIComponent(share.text)}`, '_blank')} className="flex-1 py-3 rounded-xl btn-whatsapp font-bold flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
          <button type="button" onClick={() => share && window.open(`mailto:?subject=${encodeURIComponent('Catálogo: ' + share.catalog.name)}&body=${encodeURIComponent(share.text)}`, '_blank')} className="flex-1 py-3 rounded-xl btn-ghost font-bold flex items-center justify-center gap-2"><Mail className="w-4 h-4" /> Email</button>
        </div>
      </article>
    </Modal>
  );
}
