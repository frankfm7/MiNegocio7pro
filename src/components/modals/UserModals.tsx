import { useEffect, useState } from 'react';
import { AlertCircle, Camera, Cloud, EyeOff, FileUp, Maximize2, QrCode, ScanLine, Search, ShieldCheck, Ruler, Ticket } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, getState, localUser, setState, toast, useStore } from '../../store';
import { changePassword, roleLabel, updateMyName } from '../../lib/session';
import Avatar from '../Avatar';
import { CONTACT_KEY } from '../../lib/constants';

export function ChangePasswordModal() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [busy, setBusy] = useState(false);
  const recovery = location.hash.includes('type=recovery');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 6) { toast('Mínimo 6 caracteres'); return; }
    if (next !== confirmPass) { toast('Las contraseñas no coinciden'); return; }
    setBusy(true);
    try {
      await changePassword(recovery ? '' : current, next);
      toast('✅ Contraseña actualizada');
      closeModal('change-password-modal');
      setCurrent(''); setNext(''); setConfirmPass('');
      if (recovery) history.replaceState(null, '', location.pathname);
    } catch (err) { toast((err as Error).message, 3500); }
    setBusy(false);
  };

  return (
    <Modal id="change-password-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5"><h2 className="font-bold text-xl hero-title">{recovery ? 'Crear contraseña nueva' : 'Cambiar contraseña'}</h2><CloseButton onClick={() => closeModal('change-password-modal')} /></div>
        <form className="space-y-4" onSubmit={submit}>
          {!recovery && <div><label className="block font-bold text-sm mb-1.5">Contraseña actual *</label><input value={current} onChange={e => setCurrent(e.target.value)} type="password" required className="w-full input-field rounded-xl p-3" autoComplete="current-password" /></div>}
          <div><label className="block font-bold text-sm mb-1.5">Nueva contraseña *</label><input value={next} onChange={e => setNext(e.target.value)} type="password" required minLength={6} className="w-full input-field rounded-xl p-3" placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></div>
          <div><label className="block font-bold text-sm mb-1.5">Confirmar nueva contraseña *</label><input value={confirmPass} onChange={e => setConfirmPass(e.target.value)} type="password" required className="w-full input-field rounded-xl p-3" autoComplete="new-password" /></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => closeModal('change-password-modal')} className="flex-1 py-3 rounded-xl btn-ghost font-bold text-sm">Cancelar</button>
            <button type="submit" disabled={busy} className="flex-1 py-3 rounded-xl btn-primary font-bold text-sm">{busy ? 'Guardando...' : 'Cambiar'}</button>
          </div>
        </form>
      </article>
    </Modal>
  );
}

export function UserProfileModal() {
  const open = useStore(s => !!s.modals['user-profile-modal']);
  const authUser = useStore(s => s.authUser);
  const user = useStore(s => s.currentUser);
  const store = useStore(s => s.activeStore);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setName(store?.name || authUser?.name || ''); }, [open, authUser, store]);

  const save = async () => {
    if (!name.trim()) { toast('El nombre es obligatorio'); return; }
    setBusy(true);
    try { await updateMyName(name.trim()); toast('Perfil actualizado ✓'); closeModal('user-profile-modal'); }
    catch (e) { toast((e as Error).message, 3500); }
    setBusy(false);
  };

  return (
    <Modal id="user-profile-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5"><h2 className="font-bold text-xl hero-title">Mi perfil</h2><CloseButton onClick={() => closeModal('user-profile-modal')} /></div>
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-1">
            <Avatar size={96} />
            <p className="text-[11px] text-[#756c7e]">{authUser?.avatar ? 'Foto de tu cuenta de Google' : 'Inicia sesión con Google para mostrar tu foto'}</p>
          </div>
          <div><label className="block font-bold text-sm mb-1.5">Nombre (aparece en las ventas)</label><input value={name} onChange={e => setName(e.target.value)} type="text" className="w-full input-field rounded-xl p-3" /></div>
          <div><label className="block font-bold text-sm mb-1.5">Correo electrónico</label><input value={authUser?.email || ''} type="email" className="w-full input-field rounded-xl p-3 bg-[#f6f1f8]" readOnly /></div>
          {store && <div><label className="block font-bold text-sm mb-1.5">Rol en {store.store_name}</label><input value={roleLabel(user.role)} type="text" className="w-full input-field rounded-xl p-3 bg-[#f6f1f8]" readOnly /></div>}
          <button type="button" disabled={busy} onClick={save} className="w-full py-3 rounded-xl btn-primary font-bold">{busy ? 'Guardando...' : 'Guardar cambios'}</button>
        </div>
      </article>
    </Modal>
  );
}

const HELP = [
  [Cloud, 'Tus datos o los de una tienda', 'Sin cuenta, todo se guarda solo en tu dispositivo. Con una cuenta puedes crear tu tienda en la nube o unirte a una con un código.'],
  [Ticket, 'Invitar vendedores', 'En Equipo e invitaciones genera un código y envíalo por WhatsApp. Cada tienda tiene sus propios datos, separados de las demás.'],
  [QrCode, 'QR de productos', 'Imprime los QR de un catálogo en PDF. Con la app se abre el producto al instante; con otro lector solo se ve nombre, contenido y precio.'],
  [Search, 'Buscador inteligente', 'Escribe parte del nombre, la marca o el contenido; entiende palabras sin acentos y pequeños errores.'],
  [Camera, 'Buscar por foto', 'Enfoca el producto con la cámara: se compara la forma, los colores, el texto de la etiqueta y el código.'],
  [ShieldCheck, 'Respaldo de datos', 'Crea copias de seguridad de todos tus datos y restáuralas cuando necesites.'],
  [QrCode, 'QR de cobro', 'Sube la imagen QR de tu banco o billetera para mostrarla al cobrar.'],
  [EyeOff, 'Modo Cliente', 'Oculta costos, ganancias y ventas al mostrar el catálogo a un comprador.'],
  [Maximize2, 'Ver imagen en grande', 'En el detalle de un producto toca la foto para verla a pantalla completa. Al tomar fotos usa el marco para que perfumes y botellas se vean completos.'],
  [Ruler, 'Contenido del producto', 'Indica cuántos ml, litros, gramos, kilos o qué medidas tiene cada producto.'],
  [FileUp, 'Importar / Exportar', 'Excel con fotos, PDF (para clientes o inventario), JSON y CSV. Importa también desde PDF, fotos de productos o fotos de listas de precios.'],
  [ScanLine, 'Escanear códigos', 'Usa la cámara para escanear códigos de barras de tus productos.'],
  [AlertCircle, 'Stock bajo', 'Recibe alertas cuando tus productos tengan 3 unidades o menos.'],
] as const;

export function HelpModal() {
  return (
    <Modal id="help-modal">
      <article className="modal-card w-full max-w-lg bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Cómo usar la app</h2><CloseButton onClick={() => closeModal('help-modal')} /></div>
        <div className="space-y-3">
          {HELP.map(([Icon, title, text]) => (
            <div key={title} className="help-item"><Icon className="w-5 h-5" /><div><p className="font-bold text-sm">{title}</p><p className="text-xs text-[#756c7e] mt-1">{text}</p></div></div>
          ))}
        </div>
      </article>
    </Modal>
  );
}

export function ContactsModal() {
  const open = useStore(s => !!s.modals['contacts-modal']);
  const [c, setC] = useState({ name: '', whatsapp: '', email: '', business: '' });
  useEffect(() => {
    if (open) { const info = getState().contactInfo; setC({ name: info?.name || '', whatsapp: info?.whatsapp || '', email: info?.email || '', business: info?.business || '' }); }
  }, [open]);
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setC(prev => ({ ...prev, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const info = { name: c.name.trim(), whatsapp: c.whatsapp.trim(), email: c.email.trim(), business: c.business.trim() };
    setState({ contactInfo: info, ...(getState().mode === 'local' ? { currentUser: localUser(info) } : {}) });
    localStorage.setItem(CONTACT_KEY, JSON.stringify(info));
    closeModal('contacts-modal');
    toast('Datos guardados ✓');
  };

  return (
    <Modal id="contacts-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Datos del negocio</h2><CloseButton onClick={() => closeModal('contacts-modal')} /></div>
        <form className="space-y-4" onSubmit={submit}>
          <div><label className="block font-bold text-sm mb-1.5">Nombre completo</label><input value={c.name} onChange={set('name')} type="text" className="w-full input-field rounded-xl p-3" placeholder="Ej: María García" /></div>
          <div><label className="block font-bold text-sm mb-1.5">WhatsApp</label><input value={c.whatsapp} onChange={set('whatsapp')} type="tel" className="w-full input-field rounded-xl p-3" placeholder="Ej: +591 70000000" /></div>
          <div><label className="block font-bold text-sm mb-1.5">Correo electrónico</label><input value={c.email} onChange={set('email')} type="email" className="w-full input-field rounded-xl p-3" placeholder="Ej: maria@email.com" /></div>
          <div><label className="block font-bold text-sm mb-1.5">Negocio / Empresa</label><input value={c.business} onChange={set('business')} type="text" className="w-full input-field rounded-xl p-3" placeholder="Ej: Tienda María" /></div>
          <button type="submit" className="w-full py-3 rounded-xl btn-primary font-bold">Guardar datos</button>
        </form>
      </article>
    </Modal>
  );
}
