import { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, Cloud, Contact, EyeOff, FileUp, FolderPlus, Globe, Image as ImageIcon, MessageCircle, QrCode, Receipt, Rocket, ShieldCheck, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { CURRENCIES, CURRENCY_KEY, currency } from '../../lib/format';
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

type Step = string;
interface Section { icon: typeof Cloud; title: string; intro?: string; steps: Step[] }

/** Guía completa, por temas. Cada tema se abre y se cierra tocándolo. */
const GUIDE: Section[] = [
  { icon: Rocket, title: 'Primeros pasos', intro: 'Puedes usar la app sin cuenta o con tu tienda en la nube.', steps: [
    'Sin cuenta: todo se guarda solo en este celular o computadora. Nadie más ve tus datos.',
    'Con cuenta: toca **Entrar** (arriba a la derecha) → Google o correo → **Crear mi propia tienda**. Tus datos quedan en la nube y en todos tus dispositivos.',
    'Si ya tenías datos sin cuenta, al crear la tienda la app te ofrece subirlos.',
    'Instala la app en el celular: menú ☰ → **Instalar la app**. Funciona también sin internet; los cambios se suben solos al volver la conexión.',
    'Moneda: menú ☰ → **Datos del negocio** → *Moneda de los precios* (Bs, USD, S/...). Ahí también van el nombre del negocio, el WhatsApp y el código de país.',
  ] },
  { icon: FolderPlus, title: 'Catálogos y productos', steps: [
    'Crea un catálogo con **Añadir catálogo** en la pantalla principal (ej. "Perfumes", "Maquillaje"). Toca la ⭐ para dejarlo como favorito.',
    'Dentro del catálogo toca **Añadir** para crear un producto: nombre, marca, tipo, contenido (ml, g, L...), stock y precios.',
    'Precios: **Costo** (lo que pagaste), **Precio de venta**, **Precio mínimo** (hasta cuánto puedes rebajar) y **Precio de catálogo** (opcional: se muestra tachado para que el cliente vea que le das mejor precio).',
    '**Código de la empresa** (opcional): el código de Ésika, L\'Bel, Cyzone, Yanbal... Sirve para reconocer el producto al importar facturas y sumarle el stock.',
    '**Nombre común** (ej. "Protector solar" para "Total Block", "Perfume de mujer" para "Ccori Rose"): se ve debajo del nombre y sirve para buscar. Si lo dejas vacío, la app lo sugiere sola según el nombre.',
    'Para editar: abre el producto → **Editar**. Para borrar, duplicar o ver el historial de precios usa el botón ⋮ del detalle.',
    'Buscador: escribe parte del nombre, el nombre común (ej. "protector solar"), la marca, el contenido o el código. Entiende palabras sin acentos y pequeños errores. El ícono de cámara busca por foto y el de escáner lee códigos de barras o QR.',
  ] },
  { icon: ImageIcon, title: 'Fotos de los productos (editor)', steps: [
    'Al elegir una foto (Galería o Cámara) se abre el editor. Para una foto que ya existe: **Editar producto → Ajustar foto**.',
    '**Encuadre**: vertical, cuadrada u horizontal; zoom con la barra o pellizcando; arrastra con el dedo para mover; girar, espejo y **Centrar** (pone el producto al centro y del tamaño justo).',
    '**Fondo**: original, blanco, negro u otro color. Activa **Quitar el fondo de la foto** (mejor si la foto se tomó sobre una pared o mesa lisa) y ajusta la *Sensibilidad*. Corrige con el pincel **Borrar** / **Recuperar** y **Deshacer**. Opcional: sombra suave.',
    '**Luz y color**: Auto-mejorar, brillo, contraste, color y nitidez.',
    'Cada foto empieza normal: lo que ajustas en una no se aplica a la siguiente.',
    'En el catálogo, si la foto tiene fondo liso, la tarjeta usa ese mismo color para que se vea de borde a borde. Toca la foto en el detalle para verla en grande.',
  ] },
  { icon: Receipt, title: 'Vender un producto', steps: [
    'Abre el producto → **Vender**. Elige la cantidad y el precio (sale el precio de venta; puedes cambiarlo).',
    'Elige cómo te pagan: **Efectivo**, **QR** o **Fiado**. Si es fiado, elige o crea el cliente: la deuda queda anotada en *Clientes y fiados*.',
    'Toca **Confirmar**: se descuenta el stock y aparece el **recibo**. Desde ahí lo envías por **WhatsApp** (escribe el número o deja vacío para elegir el contacto) o lo guardas o compartes como **imagen**.',
    'Antes de vender ves el costo y el precio de catálogo (el costo se oculta en modo cliente).',
  ] },
  { icon: ShoppingCart, title: 'Venta rápida de varios productos (Vender)', steps: [
    'Toca **Vender** en la barra de abajo. Escanea los códigos de barras o QR de cada producto, o toca **Agregar** para buscarlos a mano.',
    'Ajusta cantidades, aplica un **Descuento** si quieres y elige el método de pago.',
    'Toca **Finalizar**: se registran todas las ventas, se descuenta el stock y sale el recibo con todos los productos, el descuento y el total, listo para WhatsApp o imagen.',
  ] },
  { icon: MessageCircle, title: 'Pedidos por WhatsApp (carrito)', steps: [
    'En cada producto toca **+ Pedido** (o **+ Carrito** en el detalle) para armar un pedido.',
    'El ícono del carrito (arriba) muestra el pedido actual: cambia cantidades y toca **Enviar por WhatsApp**.',
    'Ideal para tomar pedidos de clientes y venderlos después.',
  ] },
  { icon: TrendingUp, title: 'Ventas, recibos e informes', steps: [
    '**Ventas** (barra de abajo) muestra lo vendido hoy por efectivo, QR y fiado; **Informes** muestra todo el historial y un gráfico de 7 días.',
    'Para seleccionar ventas: **mantén presionada** una venta (medio segundo). Luego toca o mantén presionadas otras para agregarlas o quitarlas. Cuando no queda ninguna seleccionada, la selección se cierra sola.',
    'Con las ventas elegidas: **Recibo** (genera el recibo de venta con todas, para WhatsApp o imagen), **Copiar**, **Compartir** o **Eliminar** (solo administradores; te pregunta si devuelves las unidades al stock, por ejemplo si se anuló la venta).',
    '**Cierre de caja** (Ventas o menú ☰): total cobrado por efectivo, QR, fiado y por vendedor, más los abonos de fiados. Envíalo por WhatsApp, cópialo o guárdalo como imagen (**Tabla de cierre**).',
    'En Informes puedes **Exportar Excel o CSV** con todas las ventas.',
  ] },
  { icon: FileUp, title: 'Importar productos desde una factura o recibo', intro: 'Sirve para cargar de una vez lo que pediste a Belcorp (Ésika, L\'Bel, Cyzone), Yanbal u otra empresa.', steps: [
    'Barra de abajo **Datos → Importar → Foto de factura, recibo o detalle de pedido**. Puedes elegir varias fotos (varias páginas).',
    'Toma la foto de frente, con buena luz, sin sombras y con la hoja plana. Tarda de 20 a 40 segundos por foto.',
    'La app reconoce el código, el nombre, la marca, la cantidad, el costo y el precio de catálogo. Revistas, catálogos, flyers y regalos quedan desmarcados.',
    'Revisa la lista: corrige lo marcado con ⚠, cambia el **Tu precio** si quieres y elige el **catálogo** donde guardar.',
    'Factura en dólares (Belcorp): la app detecta el tipo de cambio de la misma hoja y convierte a tu moneda. Puedes cambiar el valor "1 USD = ... Bs" antes de guardar.',
    'Si el producto ya existe (mismo código, código casi igual o nombre parecido) verás "Ya existe": al guardar se **suma el stock** y se actualizan costo y precio de catálogo. **El nombre, la foto y tu precio de venta no cambian.**',
    'Si la app unió dos productos que no son el mismo, toca **No es el mismo** y se guardará como producto nuevo.',
    'También puedes importar Excel, CSV, JSON, PDF o fotos de listas de precios desde la misma ventana, y exportar tu catálogo en Excel (con fotos) o PDF.',
  ] },
  { icon: Contact, title: 'Clientes y fiados', steps: [
    'Menú ☰ → **Clientes y fiados**: lista de clientes con lo que te deben.',
    'Las ventas con pago **Fiado** se anotan solas. Registra los **abonos** cuando te paguen (efectivo o QR).',
    'Envía un recordatorio de pago por WhatsApp desde la ficha del cliente.',
  ] },
  { icon: AlertCircle, title: 'Stock bajo y agotados', steps: [
    'La app avisa cuando un producto tiene pocas unidades (mínimo general en *Stock bajo*, o el mínimo propio de cada producto en *Editar producto*) o se agota.',
    'Toca **Ocultar** en el aviso de la pantalla principal, o **Ya lo vi** en cada lista. Solo vuelve a avisar si otro producto se agota o baja de stock.',
    'En *Agotados* puedes exportar la lista de reposición.',
  ] },
  { icon: EyeOff, title: 'Modo cliente y precio mínimo secreto', steps: [
    'Activa el **Modo cliente** (ícono del ojo arriba) antes de mostrar el celular a un comprador: se ocultan costos, ganancias, ventas y el precio mínimo.',
    'Fuera del modo cliente, el detalle muestra el precio mínimo debajo del precio de venta, como siempre.',
    'En modo cliente, para consultarlo sin que se note, **toca 3 veces seguidas el precio de venta**: aparece una ventanita con el **Mínimo**. Ciérrala tocando fuera o en Cerrar.',
  ] },
  { icon: QrCode, title: 'QR, etiquetas y cobro', steps: [
    'Cada producto tiene su **QR**. Con la app se abre el producto al instante; con otro lector solo se ven el nombre, el contenido y el precio (nunca los costos).',
    'Menú ☰ → **Etiquetas (QR + barras)**: imprime etiquetas en A4 o en impresora térmica. También puedes imprimir todos los QR de un catálogo en PDF.',
    'Menú ☰ → **QR de cobro**: sube el QR de tu banco o billetera para mostrarlo al cobrar.',
  ] },
  { icon: Globe, title: 'Catálogo público', steps: [
    'Menú ☰ → **Catálogo público**: actívalo, elige el nombre del enlace y el WhatsApp que recibe pedidos.',
    'Comparte el enlace o su QR: tus clientes ven productos y precios (sin costos) y te piden por WhatsApp, sin instalar nada.',
  ] },
  { icon: Users, title: 'Equipo e invitaciones', steps: [
    'Menú ☰ → **Equipo e invitaciones → Invitar**: elige el rol y envía el código o enlace por WhatsApp.',
    'Roles: **Administrador** (todo), **Co-administrador**, **Supervisor** y **Vendedor** (vende, pero no ve costos ni edita).',
    'En la lista ves a cada miembro con **En línea** (verde) si tiene la app abierta, o **Últ. vez ...** (negro) con su última conexión. Desde ⋮ puedes cambiar el rol, bloquear o quitar.',
    'Cada venta guarda quién la hizo (con su foto) y el cierre de caja separa por vendedor.',
  ] },
  { icon: ShieldCheck, title: 'Respaldos y seguridad', steps: [
    'Menú ☰ → **Respaldo de datos**: crea copias de seguridad (en la nube si tienes tienda) y restáuralas si hace falta. La app hace una copia automática al abrirla (máximo una cada 20 horas).',
    'También puedes descargar todo en un archivo para guardarlo donde quieras.',
    'Cada tienda solo ve sus propios datos: otras personas que instalen la app no ven los tuyos.',
  ] },
];

/** Convierte **texto** en negrita */
function rich(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <b key={i} className="text-[#201728]">{part.slice(2, -2)}</b> : part));
}

export function HelpModal() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Modal id="help-modal">
      <article className="modal-card w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-1"><h2 className="font-bold text-xl hero-title">Cómo usar la app</h2><CloseButton onClick={() => closeModal('help-modal')} /></div>
        <p className="text-xs text-[#756c7e] mb-4">Toca un tema para ver los pasos.</p>
        <div className="space-y-2">
          {GUIDE.map((sec, i) => {
            const Icon = sec.icon;
            const isOpen = open === i;
            return (
              <div key={sec.title} className={`help-item !block rounded-2xl border ${isOpen ? 'border-[#cdb6e2]' : 'border-[#ede7f0]'}`}>
                <button type="button" onClick={() => setOpen(isOpen ? null : i)} className="w-full flex items-center gap-3 text-left" aria-expanded={isOpen}>
                  <Icon className="w-5 h-5 flex-shrink-0 text-[#7c43ba]" />
                  <span className="font-bold text-sm flex-1">{sec.title}</span>
                  <ChevronDown className={`w-4 h-4 text-[#756c7e] transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="mt-3 pl-8">
                    {sec.intro && <p className="text-xs text-[#4a3f55] mb-2">{sec.intro}</p>}
                    <ol className="list-decimal pl-4 space-y-1.5 text-xs text-[#5c5266] leading-relaxed">
                      {sec.steps.map((st, k) => <li key={k}>{rich(st)}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </article>
    </Modal>
  );
}

export function ContactsModal() {
  const open = useStore(s => !!s.modals['contacts-modal']);
  const [c, setC] = useState({ name: '', whatsapp: '', email: '', business: '', countryCode: '' });
  const [cur, setCur] = useState(currency());
  useEffect(() => {
    if (open) { setCur(currency()); const info = getState().contactInfo; setC({ name: info?.name || '', whatsapp: info?.whatsapp || '', email: info?.email || '', business: info?.business || '', countryCode: info?.countryCode || '' }); }
  }, [open]);
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setC(prev => ({ ...prev, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(CURRENCY_KEY, cur);
    setState({ appCurrency: cur });
    const info = { name: c.name.trim(), whatsapp: c.whatsapp.trim(), email: c.email.trim(), business: c.business.trim(), countryCode: c.countryCode.replace(/\D/g, '') };
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
          <div><label className="block font-bold text-sm mb-1.5">Código de país (para enviar WhatsApp)</label><input value={c.countryCode} onChange={set('countryCode')} inputMode="numeric" className="w-full input-field rounded-xl p-3" placeholder="Ej: 591 (Bolivia), 51 (Perú), 57 (Colombia)" /></div>
          <div><label className="block font-bold text-sm mb-1.5">Correo electrónico</label><input value={c.email} onChange={set('email')} type="email" className="w-full input-field rounded-xl p-3" placeholder="Ej: maria@email.com" /></div>
          <div><label className="block font-bold text-sm mb-1.5">Negocio / Empresa</label><input value={c.business} onChange={set('business')} type="text" className="w-full input-field rounded-xl p-3" placeholder="Ej: Tienda María" /></div>
          <div>
            <label className="block font-bold text-sm mb-1.5">Moneda de los precios</label>
            <select value={cur} onChange={e => setCur(e.target.value)} className="w-full input-field rounded-xl p-3">
              {CURRENCIES.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
            <p className="text-[11px] text-[#756c7e] mt-1">Solo cambia la moneda que se muestra; no convierte los precios ya guardados.</p>
          </div>
          <button type="submit" className="w-full py-3 rounded-xl btn-primary font-bold">Guardar datos</button>
        </form>
      </article>
    </Modal>
  );
}
