import { useCallback, useEffect, useState } from 'react';
import { Download, Info, MessageCircle, MoreVertical, Pencil, PlusCircle, QrCode, RefreshCw, Star, Trash2, WifiOff } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, getState, openModal, setState, toast, useStore } from '../../store';
import { compressImage } from '../../lib/image';
import { createQR, deleteQRById, loadOwnerPrimaryQR, loadUserQRs, setPrimaryQR, updateQR } from '../../lib/qr';
import { downloadDataUrl } from '../../lib/image';
import type { QrCodeItem } from '../../types';

function pickImage(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

// Se comparte entre el listado y el menú de opciones
let reloadList: () => void = () => {};
let menuQr: QrCodeItem | null = null;

export function QrModal() {
  const open = useStore(s => !!s.modals['qr-modal']);
  const user = useStore(s => s.currentUser);
  const isOnline = useStore(s => s.isOnline);
  const [qrs, setQrs] = useState<QrCodeItem[]>([]);

  const load = useCallback(async () => {
    const u = getState().currentUser;
    if (!u) { setQrs([]); return; }
    const all: QrCodeItem[] = [];
    try {
      if (u.role === 'vendedor' || u.role === 'supervisor') {
        const owner = await loadOwnerPrimaryQR();
        if (owner) all.push({ ...owner, _isOwnerQR: true });
      }
      (await loadUserQRs()).forEach(qr => all.push({ ...qr, _isOwnerQR: false }));
    } catch (e) {
      console.error('Error cargando QRs:', e);
    }
    setQrs(all);
  }, []);

  useEffect(() => { reloadList = load; }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const addNew = async () => {
    const file = await pickImage();
    if (!file) return;
    const label = prompt('Nombre del QR:', 'Mi QR');
    if (label === null) return;
    const base64 = await compressImage(file, 600, 0.9);
    const existing = await loadUserQRs();
    if (await createQR(base64, label || 'Mi QR', existing.length === 0)) { toast('QR agregado'); load(); }
  };

  return (
    <Modal id="qr-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <div><h2 className="font-bold text-xl hero-title">Códigos QR</h2><p className="text-xs text-[#756c7e] mt-1">Gestiona tus códigos de cobro</p></div>
          <CloseButton onClick={() => closeModal('qr-modal')} />
        </div>
        <div id="qr-list-container" className="space-y-6">
          {!isOnline && (
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800 mb-4"><WifiOff className="w-4 h-4 inline mr-2" />Modo offline - Mostrando QRs guardados localmente</div>
          )}
          {qrs.map(qr => {
            const canEdit = !qr._isOwnerQR;
            const headerLabel = qr._isOwnerQR
              ? <span className="text-[10px] uppercase tracking-wider font-bold text-[#7c43ba]">QR del Negocio</span>
              : user?.role === 'vendedor'
                ? <span className="text-[10px] uppercase tracking-wider font-bold text-[#23805d]">Mi QR Personal</span>
                : <span className="text-[10px] uppercase tracking-wider font-bold text-[#756c7e]">Mi QR</span>;
            return (
              <div key={qr.id + (qr._isOwnerQR ? '_owner' : '')} className={`relative rounded-2xl border-2 ${qr.is_primary ? 'border-[#7c43ba]' : 'border-[#ede7f0]'} overflow-hidden bg-white cursor-pointer`}
                onClick={e => { if ((e.target as HTMLElement).closest('.qr-menu-btn')) return; setState({ qrLightbox: { src: qr.image, label: qr.label } }); }}>
                {qr.is_primary && <span className="absolute top-2 left-2 bg-[#7c43ba] text-white text-[10px] font-bold px-2 py-1 rounded-full">Principal</span>}
                <div className="flex items-center gap-3 p-3">
                  <img src={qr.image} alt={qr.label} className="w-20 h-20 rounded-xl object-cover bg-[#f6f1f8] flex-shrink-0" />
                  <div className="flex-1 min-w-0">{headerLabel}<p className="font-bold text-sm mt-1 truncate">{qr.label}</p></div>
                  {canEdit && (
                    <button className="qr-menu-btn w-9 h-9 rounded-full hover:bg-[#f1ecf4] grid place-items-center flex-shrink-0" onClick={e => { e.stopPropagation(); menuQr = qr; openModal('qr-item-menu-modal'); }}>
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {qrs.length === 0 && (
          <div id="qr-empty-state" className="text-center py-8">
            <div className="w-24 h-24 mx-auto rounded-2xl bg-[#f6f1f8] border-2 border-dashed border-[#d4c5e0] flex items-center justify-center mb-3"><QrCode className="w-10 h-10 text-[#d4c5e0]" /></div>
            <p className="font-bold text-sm">Sin códigos QR aún</p><p className="text-xs text-[#756c7e] mt-1">Agrega tu primer código QR</p>
          </div>
        )}
        <button onClick={addNew} className="w-full mt-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border-2 border-dashed border-[#7c43ba] text-[#7c43ba] hover:bg-[#f6f1f8]"><PlusCircle className="w-5 h-5" /> Agregar nuevo QR</button>
        <div className="mt-4 p-3 rounded-xl bg-[#f6f1f8]"><p className="text-xs text-[#756c7e]"><Info className="w-3 h-3 inline" /> <b>Dueño:</b> El QR principal es visible para todos los vendedores. Puedes tener varios QRs (bancos, wallets, etc).</p></div>
      </article>
    </Modal>
  );
}

export function QrItemMenuModal() {
  const open = useStore(s => !!s.modals['qr-item-menu-modal']);
  const qr = open ? menuQr : null;
  const done = (msg: string) => { toast(msg); closeModal('qr-item-menu-modal'); reloadList(); };

  return (
    <Modal id="qr-item-menu-modal" className="z-[60] bg-[#1e1427]/70">
      {qr && (
        <article className="modal-card w-full max-w-sm bg-white rounded-3xl p-5">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Opciones del QR</h3><CloseButton onClick={() => closeModal('qr-item-menu-modal')} /></div>
          <div className="mb-4 text-center"><img src={qr.image} className="w-24 h-24 rounded-xl object-cover mx-auto mb-2" alt="" /><p className="font-bold text-sm">{qr.label}</p></div>
          <div className="space-y-2">
            {!qr.is_primary && (
              <button onClick={async () => { if (await setPrimaryQR(qr.id)) done('QR establecido como principal'); }} className="w-full py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center gap-2 justify-center"><Star className="w-4 h-4" /> Establecer como principal</button>
            )}
            <button onClick={async () => { const f = await pickImage(); if (!f) return; if (await updateQR(qr.id, { image: await compressImage(f, 600, 0.9) })) done('QR actualizado'); }} className="w-full py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center gap-2 justify-center"><RefreshCw className="w-4 h-4" /> Cambiar imagen</button>
            <button onClick={async () => { const l = prompt('Nuevo nombre:'); if (!l || !l.trim()) return; if (await updateQR(qr.id, { label: l.trim() })) done('Nombre actualizado'); }} className="w-full py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center gap-2 justify-center"><Pencil className="w-4 h-4" /> Cambiar nombre</button>
            <button onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent('Te comparto mi codigo QR: ' + qr.label), '_blank')} className="w-full py-2.5 rounded-xl btn-whatsapp font-bold text-sm flex items-center gap-2 justify-center"><MessageCircle className="w-4 h-4" /> Compartir por WhatsApp</button>
            <button onClick={() => { downloadDataUrl(qr.image, 'qr_' + qr.label + '.png'); toast('QR descargado'); }} className="w-full py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center gap-2 justify-center"><Download className="w-4 h-4" /> Descargar imagen</button>
            <button onClick={async () => { if (!confirm('¿Eliminar este QR?')) return; if (await deleteQRById(qr.id)) done('QR eliminado'); }} className="w-full py-2.5 rounded-xl font-bold text-sm text-[#a43658] hover:bg-[#fff0f3] flex items-center gap-2 justify-center"><Trash2 className="w-4 h-4" /> Eliminar QR</button>
          </div>
        </article>
      )}
    </Modal>
  );
}
