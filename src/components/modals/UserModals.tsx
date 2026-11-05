import { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, FileText, Cloud, Contact, EyeOff, FileUp, FolderPlus, Globe, Image as ImageIcon, MessageCircle, QrCode, Receipt, Rocket, ShieldCheck, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { CURRENCIES, CURRENCY_KEY, currency } from '../../lib/format';
import { closeModal, getState, localUser, setState, toast, useStore } from '../../store';
import { changePassword, roleLabel, updateMyName } from '../../lib/session';
import Avatar from '../Avatar';
import { CONTACT_KEY } from '../../lib/constants';
import { loadReceiptSettings, saveReceiptSettings, suggestedPrefix } from '../../lib/receipts';
import { businessName } from '../../lib/whatsapp';
import type { ReceiptSettings } from '../../types';

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
    'Moneda: menú ☰ → **Datos de la tienda (recibo)** → *Moneda de los precios* (Bs, USD, S/...). Ahí también van el nombre del negocio, el WhatsApp y el código de país.',
  ] },
  { icon: FolderPlus, title: 'Catálogos y productos', steps: [
    'Crea un catálogo con **Añadir catálogo** en la pantalla principal (ej. "Perfumes", "Maquillaje"). Toca la ⭐ para dejarlo como favorito.',
    'Dentro del catálogo toca **Añadir** para crear un producto: nombre, marca, tipo, contenido (ml, g, L...), stock y precios.',
    'Costos y precios: **Costo de factura** (lo que te venden), **Costo mínimo de venta** (escribe el valor o un % sobre la factura: 10 + 5% = 10.50) y **Precio de venta máx.** (valor o % sobre el mínimo o la factura; es el que se ve en el catálogo). Si el precio de venta queda debajo del mínimo, la app avisa en rojo.',
    'Si la factura viene en dólares, escribe el **costo en $** y el **tipo de cambio**: se convierte solo al costo de factura. El **precio de revista de la empresa** (opcional) se muestra tachado para que el cliente vea cuánto ahorra.',
    'En el catálogo cada tarjeta muestra el **precio de venta** y el **mínimo**; al abrir el producto ves el **mínimo** en el cuadro del precio y abajo el desglose: costo de adquisición, precio de catálogo y ganancia estimada. Para cerrarlo toca **fuera** de la ventana, la **✕**, o **dos veces seguidas** en la zona de detalles (un solo toque ya no lo cierra, para que no se cierre por accidente).',
    'Al crear un producto, si el **nombre**, el **código** o el **código de barras** coinciden con uno que ya tienes, sale el aviso **¿Es ese producto?**: *Sí, abrir el que existe* (trabajas sobre ese) o *No, es otro producto*. Un mismo nombre con **otra presentación** (50 ml y 100 ml) cuenta como producto distinto.',
    '**Código de la empresa** (opcional): el código de Ésika, L\'Bel, Cyzone, Yanbal... Sirve para reconocer el producto al importar facturas y sumarle el stock.',
    '**Nombre común** (ej. "Protector solar" para "Total Block", "Perfume de mujer" para "Ccori Rose"): se ve debajo del nombre y sirve para buscar. Si lo dejas vacío, la app lo sugiere sola según el nombre.',
    'Para editar: abre el producto → **Editar**. Para borrar, duplicar o ver el historial de precios usa el botón ⋮ del detalle.',
    'Buscador: escribe parte del nombre, el nombre común (ej. "protector solar"), la marca, el contenido o el código. Entiende palabras sin acentos y pequeños errores. El ícono de cámara busca por foto y el de escáner lee códigos de barras o QR.',
  ] },
  { icon: ImageIcon, title: 'Fotos de los productos (editor)', steps: [
    'Al elegir una foto (Galería o Cámara) se abre el editor. Para una foto que ya existe: **Editar producto → Ajustar foto**.',
    '**Encuadre**: vertical, cuadrada u horizontal; zoom con la barra o pellizcando; arrastra con el dedo para mover; girar, espejo y **Centrar** (pone el producto al centro y del tamaño justo).',
    '**Fondo**: original, blanco, negro u otro color. Activa **Quitar el fondo de la foto**: el modo **Inteligente (IA)** reconoce el producto aunque el fondo tenga colores, sombras u objetos (la 1ª vez descarga unos 15 MB; después funciona sin internet). Ajusta el **Recorte** si quedó algo del fondo o se comió un borde. El modo **Por color del fondo** sirve para fotos sobre pared o mesa lisa (*Sensibilidad*). Corrige con el pincel **Borrar** / **Recuperar** y **Deshacer**. Opcional: sombra suave.',
    '**Luz y color**: Auto-mejorar, brillo, contraste, color y nitidez.',
    'Cada foto empieza normal: lo que ajustas en una no se aplica a la siguiente.',
    'En el catálogo, si la foto tiene fondo liso, la tarjeta usa ese mismo color para que se vea de borde a borde.',
    'En el detalle, **toca la foto** para verla en grande; para cerrarla, **toca dos veces** (o la ✕).',
  ] },
  { icon: Receipt, title: 'Vender: uno o varios productos', steps: [
    'Abre el producto → **Vender**. Elige la cantidad y el precio (sale el precio de venta; puedes cambiarlo).',
    '**Confirmar** vende solo ese producto: se descuenta el stock y aparece el **recibo** ("¡Venta exitosa!").',
    '**Agregar a la venta** lo pone en la **venta en curso** y vuelves al catálogo para seguir eligiendo. Abajo aparece el botón verde **Finalizar venta** con el total; se queda hasta que finalices o la descartes con la ✕.',
    'Con una venta en curso, el botón verde dice **Agregar y finalizar**: agrega ese producto y abre la venta para cobrar.',
    'En **Finalizar venta** eliges el pago (**Efectivo**, **QR** o **Fiado**), puedes aplicar un **descuento** y tocas **Finalizar venta**: sale **un solo recibo** con todos los productos.',
    '¿El cliente quiere algo más después de pagar? En el recibo toca **Agregar más productos a esta venta**: vuelves al catálogo, agregas lo nuevo y al finalizar sale **un solo recibo** con lo ya cobrado más lo nuevo.',
    'Desde el recibo lo envías por **WhatsApp** o lo guardas/compartes como **imagen**. **Cerrar (terminar venta)** termina la atención.',
    'Si es **Fiado**, elige o crea el cliente: la deuda queda en *Clientes y fiados*.',
  ] },
  { icon: Receipt, title: 'Recibos numerados y datos de la tienda', steps: [
    'Cada recibo lleva un **número correlativo** con el código de tu tienda, por ejemplo **PA7-000123**. Lo asigna la base de datos de la tienda: aunque varios vendedores vendan al mismo tiempo, **nunca se repite ni se salta**.',
    'Configúralo en menú ☰ → **Datos de la tienda (recibo)**, arriba de todo: nombre de la tienda, **código de la tienda**, desde qué número empezar (solo se puede adelantar), **teléfono, celular, dirección y NIT**, y si cada dato se muestra o no. En una tienda lo cambian solo los administradores y vale para todo el equipo.',
    'El recibo (imagen) lleva el **logo**, los datos de la tienda, el número, la fecha y el nombre del negocio repetido en diagonal como **marca de agua**.',
    'Si el cliente lo pide, en el recibo abre **Datos que pide el cliente** y escribe **N° de factura, código de autorización, N° de pedido o NIT/CI del cliente**: salen en la imagen y en el WhatsApp.',
    'Sin internet el recibo sale con un número **provisional**; al volver la conexión se le asigna el número definitivo en orden.',
    'Desde Ventas o Informes (mantener presionada → **Recibo**): si las ventas elegidas son de un mismo recibo se abre ese recibo (**copia**, mismo número); si no tienen recibo se emite uno nuevo. **Una venta nunca sale en dos recibos**: si eliges ventas de recibos distintos la app te avisa.',
    '**Enviar por WhatsApp**: escribe el número del cliente en el recibo y toca *Enviar por WhatsApp*: se abre su chat con el detalle de la venta ya escrito (si no tiene código de país se usa el de tu país). También puedes *Compartir imagen + texto*, elegir el contacto o copiar el texto.',
    '**Cierres de caja** (y su tabla/imagen) se numeran **ANA-C-000001** al enviarlos, copiarlos o generar la imagen; un mismo día conserva siempre su número. Los **informes** de Excel/CSV se numeran **ANA-I-000001**.',
    'Menú ☰ → **Recibos y cierres**: lista de todos los recibos, cierres e informes emitidos (de todo el equipo), con buscador. Puedes **verlos**, **reenviarlos** como imagen o volver a **descargar** un informe.',
  ] },
  { icon: ShoppingCart, title: 'Venta rápida con escáner (Vender)', steps: [
    'Toca **Vender** en la barra de abajo: se abre la venta en curso. **Escanear** lee códigos de barras o QR, **Buscar** agrega a mano y **Catálogo** te lleva a elegir productos.',
    'Si cierras la ventana (✕ o tocando afuera) la venta NO se pierde: queda el botón **Finalizar venta**. **Descartar** la borra.',
  ] },
  { icon: FileText, title: 'Nota de venta (varios productos con descuento)', steps: [
    'En el catálogo **mantén presionado** un producto: queda marcado y aparece la barra **Nota de venta**. Toca otros productos para agregarlos o quitarlos.',
    'La barra tiene, en una sola línea: **Eliminar** (borra los elegidos), **Duplicar** (crea copias sin código), **Compartir** (envía la lista con precios) y **Nota de venta**. Eliminar y Duplicar solo los ven los administradores.',
    'En la nota ajusta las **cantidades** y aplica descuentos **por producto** (% o monto) o **globales** (a todos). Los totales (subtotal, descuento, total final) se ven al instante.',
    '**Regla de oro**: ningún descuento puede dejar un producto por debajo de su **costo mínimo de venta**. Si pides más, la app lo limita al mínimo y te avisa en rojo.',
    '**Guardar borrador** deja la nota guardada para seguir después (Borradores guardados). **Procesar venta** registra la venta con esos precios, descuenta el stock y saca el recibo numerado con el descuento.',
  ] },
  { icon: MessageCircle, title: 'Pedidos por WhatsApp (carrito)', steps: [
    'En el detalle de un producto toca **+ Carrito** para armar un pedido.',
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
    'Barra de abajo **Datos → Importar → Factura, recibo o detalle de pedido (foto o PDF)**. Puedes elegir varias fotos (varias páginas) o el **PDF** de la factura electrónica.',
    'Con el **PDF** la lectura es casi perfecta: la tabla se lee por columnas, así una descripción escrita en 2 o 3 líneas queda en su producto, con su cantidad. Un PDF escaneado se lee como foto.',
    'El **código del producto** es el número **antes del guión** (ej. 5109-20014207 → 5109); lo de después es el código de servicio.',
    '**Ajustar precios de toda la lista**: *Mi costo* = factura ± % (ej. +5 por envío); *Descuento de la empresa* (31% editable) muestra el costo referencial = catálogo − 31% y puedes usarlo como tu costo; *Mi precio de venta* = catálogo ± % (ej. −10) o costo + % de ganancia (ej. +40). Toca **Aplicar a toda la lista** y luego edita cada producto si quieres.',
    'Toma la foto de frente, con buena luz, sin sombras y con la hoja plana. Tarda de 20 a 40 segundos por foto.',
    'La app reconoce el código, el nombre, la marca, la cantidad, el costo y el precio de catálogo. Revistas, catálogos, flyers y regalos quedan desmarcados.',
    'Revisa la lista: corrige lo marcado con ⚠, cambia el **Tu precio** si quieres y elige el **catálogo** donde guardar.',
    'Factura en dólares (Belcorp): la app detecta el tipo de cambio de la misma hoja y convierte a tu moneda. Puedes cambiar el valor "1 USD = ... Bs" antes de guardar.',
    'La app busca primero por el **código del producto** (es lo más seguro) y después por nombre. Si el nombre es igual pero la **presentación** cambia (ej. 50 ml y 100 ml), se toman como productos distintos.',
    'Si el producto ya existe (mismo código, código casi igual o nombre parecido con la misma presentación) verás "Ya existe": al guardar se **suma el stock** y se actualizan costo y precio de catálogo. **El nombre, la foto y tu precio de venta no cambian.**',
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
    'Activa el **Modo cliente** antes de mostrar el celular a un comprador: se ocultan costos, ganancias, ventas y el precio mínimo.',
    'Atajo rápido: en el detalle de un producto toca **Modo cliente** (sobre la foto). El botón desaparece mientras el modo está activo; para volver al modo normal sal del detalle y usa el ícono del ojo de arriba.',
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
  const cfg = useStore(s => s.receiptSettings);
  const cloud = useStore(s => s.mode === 'cloud');
  const canEditReceipt = useStore(s => s.mode !== 'cloud' || s.isAdmin());
  const [rc, setRc] = useState<ReceiptSettings>({ prefix: '' });
  const [startAt, setStartAt] = useState('');
  useEffect(() => {
    if (open) { setRc({ showPhone: true, showMobile: true, showAddress: true, showNit: true, ...cfg }); setStartAt(''); void loadReceiptSettings(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (open) setRc(prev => ({ ...prev, prefix: prev.prefix || cfg.prefix, next: cfg.next })); }, [cfg, open]);
  useEffect(() => {
    if (open) { setCur(currency()); const info = getState().contactInfo; setC({ name: info?.name || '', whatsapp: info?.whatsapp || '', email: info?.email || '', business: info?.business || '', countryCode: info?.countryCode || '' }); }
  }, [open]);
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setC(prev => ({ ...prev, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (canEditReceipt) {
      const n = parseInt(startAt, 10);
      const ok = await saveReceiptSettings(rc, n > 0 ? n : undefined);
      if (!ok) return;
    }
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
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Datos de la tienda y del negocio</h2><CloseButton onClick={() => closeModal('contacts-modal')} /></div>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset id="receipt-settings" disabled={!canEditReceipt} className="p-3 rounded-2xl bg-[#f6f1f8] space-y-3 disabled:opacity-70">
            <legend className="px-2 font-bold text-sm text-[#7c43ba]">🏪 Datos de la tienda (salen en recibos y cierres){cloud ? ' · para toda la tienda' : ''}</legend>
            {!canEditReceipt && <p className="text-[11px] text-[#756c7e]">Solo los administradores pueden cambiar estos datos.</p>}
            <div><label className="block font-bold text-xs mb-1">Nombre de la tienda</label><input value={rc.name || ''} onChange={e => setRc({ ...rc, name: e.target.value })} className="w-full input-field rounded-xl p-2.5" placeholder={businessName()} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block font-bold text-xs mb-1">Código de la tienda</label><input value={rc.prefix} onChange={e => setRc({ ...rc, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) })} className="w-full input-field rounded-xl p-2.5 font-mono font-bold" placeholder={suggestedPrefix(businessName())} /></div>
              <div><label className="block font-bold text-xs mb-1">Empezar desde N°</label><input value={startAt} onChange={e => setStartAt(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-full input-field rounded-xl p-2.5" placeholder={rc.next ? String(rc.next) : '1'} /></div>
            </div>
            <p className="text-[11px] text-[#756c7e]">Próximo recibo: <b className="font-mono text-[#201728]">{(rc.prefix || cfg.prefix || suggestedPrefix(businessName()))}-{String(Math.max(Number(startAt) || 0, rc.next || 1)).padStart(6, '0')}</b>. Los números siguen en orden y nunca se repiten{cloud ? ', aunque vendan varios del equipo a la vez' : ''}; solo se pueden adelantar, no retroceder.</p>
            {([['phone', 'showPhone', 'Teléfono', 'tel'], ['mobile', 'showMobile', 'Celular', 'tel'], ['address', 'showAddress', 'Dirección', 'text'], ['nit', 'showNit', 'NIT', 'text']] as const).map(([k, show, label, type]) => (
              <div key={k}>
                <div className="flex justify-between items-center mb-1"><label className="font-bold text-xs">{label}</label>
                  <label className="text-[11px] text-[#756c7e] flex items-center gap-1"><input type="checkbox" checked={rc[show] !== false} onChange={e => setRc({ ...rc, [show]: e.target.checked })} className="accent-[#7c43ba]" /> Mostrar en el recibo</label></div>
                <input value={rc[k] || ''} onChange={e => setRc({ ...rc, [k]: e.target.value })} type={type} className="w-full input-field rounded-xl p-2.5" />
              </div>
            ))}
          </fieldset>
          <p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e] pt-1">Tus datos</p>
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
