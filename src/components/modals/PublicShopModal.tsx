import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, ExternalLink, Loader, MessageCircle } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, toast, useStore } from '../../store';
import { loadShopSettings, saveShopSettings, shopLink, slugify } from '../../lib/publicShop';
import { openWhatsApp, waNumber } from '../../lib/whatsapp';

/** Catálogo público: enlace de solo lectura para clientes (sin iniciar sesión) */
export default function PublicShopModal() {
  const open = useStore(s => !!s.modals['public-shop-modal']);
  const store = useStore(s => s.activeStore);
  const contact = useStore(s => s.contactInfo);
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState('');
  const [savedSlug, setSavedSlug] = useState('');

  useEffect(() => {
    if (!open || !store) return;
    setState('loading');
    loadShopSettings().then(s => {
      if (s === 'missing') { setState('missing'); return; }
      setEnabled(s.enabled); setSlug(s.slug || slugify(store.store_name)); setSavedSlug(s.enabled ? s.slug : '');
      setWhatsapp(s.whatsapp || waNumber(contact?.whatsapp));
      setState('ready');
    });
  }, [open, store, contact]);

  const link = savedSlug ? shopLink(savedSlug) : '';
  /** Número listo para WhatsApp: acepta +591 7..., 591 7..., 7... (agrega el código del país) o un enlace wa.me */
  const normalized = (() => {
    const t = whatsapp.trim();
    const fromLink = /wa\.me\/(\+?\d+)/i.exec(t)?.[1] || /phone=(\+?\d+)/i.exec(t)?.[1];
    return waNumber(fromLink ? (fromLink.startsWith('+') ? fromLink : '+' + fromLink) : t);
  })();
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 240, margin: 2 }).then(setQr).catch(() => setQr('')); else setQr(''); }, [link]);

  const save = async () => {
    setSaving(true);
    try {
      await saveShopSettings({ enabled, slug: slugify(slug), whatsapp: normalized });
      setWhatsapp(normalized ? '+' + normalized : '');
      setSlug(slugify(slug)); setSavedSlug(enabled ? slugify(slug) : '');
      toast(enabled ? 'Catálogo público activado ✓' : 'Catálogo público desactivado');
    } catch (e) { toast((e as Error).message, 4500); }
    setSaving(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Enlace copiado ✓'); } catch { toast('No se pudo copiar'); } };

  return (
    <Modal id="public-shop-modal" className="z-[60] bg-[#1e1427]/60">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3"><h2 className="font-bold text-xl hero-title">Catálogo público</h2><CloseButton onClick={() => closeModal('public-shop-modal')} /></div>
        {!store && <p className="text-sm text-[#756c7e]">El catálogo público necesita una tienda en la nube. Inicia sesión y crea tu tienda.</p>}
        {store && state === 'loading' && <p className="text-sm text-[#756c7e] flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Cargando...</p>}
        {store && state === 'missing' && <p className="text-sm text-[#92400e] bg-[#fffbeb] border border-[#fde68a] rounded-xl p-3">Falta ejecutar <b>supabase/5-mejoras.sql</b> en Supabase para activar esta función.</p>}
        {store && state === 'ready' && (
          <div className="space-y-4">
            <p className="text-xs text-[#756c7e]">Tus clientes abren un enlace, ven tus productos con stock, arman su pedido y te lo envían por WhatsApp. <b>No ven costos</b> ni necesitan cuenta.</p>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#f6f1f8] cursor-pointer">
              <span className="font-bold text-sm">Catálogo público activado</span>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-5 h-5 accent-[#7c43ba]" />
            </label>
            <div>
              <label className="block font-bold text-sm mb-1.5">Nombre del enlace</label>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={40} className="w-full input-field rounded-xl p-3 font-mono text-sm" placeholder="mi-tienda" />
              <p className="text-[11px] text-[#756c7e] mt-1">Quedará: {shopLink(slug || 'mi-tienda')}</p>
            </div>
            <div>
              <label className="block font-bold text-sm mb-1.5">WhatsApp que recibe los pedidos</label>
              <input id="shop-whatsapp" value={whatsapp} onChange={e => setWhatsapp(e.target.value.replace(/[^0-9+ ()\-a-zA-Z/.:?=]/g, ''))} type="text" inputMode="tel" autoComplete="tel" className="w-full input-field rounded-xl p-3" placeholder="Ej: +591 71101154 o 71101154" />
              <p className="text-[11px] text-[#756c7e] mt-1">Puedes escribir el número solo (71101154), con <b>+</b> y código de país (+591 71101154) o pegar un enlace <b>wa.me</b>. Si no pones el código, se agrega el de tu país.</p>
              {normalized && (
                <div id="shop-whatsapp-preview" className="mt-2 p-2.5 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] flex items-center gap-2">
                  <span className="text-xs flex-1">Los pedidos llegarán a <b>+{normalized}</b></span>
                  <a href={`https://wa.me/${normalized}?text=${encodeURIComponent('Prueba del catálogo en línea ✅')}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#25D366] text-white">Probar</a>
                </div>
              )}
            </div>
            <p className="text-[11px] text-[#756c7e] -mt-2">Además de WhatsApp, el cliente puede <b>enviar el pedido directo a la app</b> (llega a <b>Mensajes → Pedidos</b>), por si no tiene WhatsApp.</p>
            <button type="button" disabled={saving} onClick={save} className="w-full py-3 rounded-xl btn-primary font-bold">{saving ? 'Guardando...' : 'Guardar'}</button>
            {link && (
              <div className="p-4 rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] text-center">
                {qr && <img src={qr} alt="QR del catálogo" className="mx-auto w-40 h-40 rounded-lg bg-white p-1" />}
                <p className="text-xs break-all mt-2 text-[#166534] font-bold">{link}</p>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button type="button" onClick={copy} className="btn-ghost rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar</button>
                  <a href={link} target="_blank" rel="noopener noreferrer" className="btn-ghost rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Abrir</a>
                  <button type="button" onClick={() => openWhatsApp('', `Mira nuestro catálogo 🛍️\n${link}`)} className="rounded-xl py-2 text-xs font-bold bg-[#25D366] text-white flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> Enviar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    </Modal>
  );
}
