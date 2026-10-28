import { useEffect, useState } from 'react';
import { Download, MoreVertical, PlusSquare, Share, X } from 'lucide-react';
import Modal, { CloseButton } from './Modal';
import { closeModal, getState, openModal, setState, toast, useStore } from '../store';
import { APP_NAME } from '../lib/constants';

const DISMISS_KEY = 'mc7_install_dismissed';
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Abre el diálogo de instalación del navegador o, si no existe, las instrucciones */
export async function installApp() {
  const p = getState().installPrompt;
  if (p) {
    await p.prompt();
    const choice = await p.userChoice;
    if (choice.outcome === 'accepted') toast('✅ Instalando la app...');
    setState({ installPrompt: null });
    return;
  }
  openModal('install-help-modal');
}

/** Escucha los eventos de instalación (se monta una sola vez) */
export function useInstallEvents() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setState({ installPrompt: e as unknown as NonNullable<ReturnType<typeof getState>['installPrompt']> });
    };
    const onInstalled = () => { setState({ installPrompt: null, isStandalone: true }); toast(`✅ ${APP_NAME} instalada`); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
}

/** Aviso pequeño en la pantalla de catálogos para instalar la app */
export function InstallBanner() {
  const prompt = useStore(s => s.installPrompt);
  const standalone = useStore(s => s.isStandalone);
  const [dismissed, setDismissed] = useState(() => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now());
  if (standalone || dismissed || (!prompt && !isIOS())) return null;
  const dismiss = () => { localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 86400000)); setDismissed(true); };
  return (
    <div className="mb-4 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-[#7c43ba] to-[#5f3291] text-white flex items-center gap-3 shadow-lg">
      <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl flex-shrink-0 bg-white/10" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-sm">Instala {APP_NAME}</p>
        <p className="text-xs opacity-90">Ábrela como app desde tu pantalla de inicio, también sin internet.</p>
      </div>
      <button type="button" onClick={installApp} className="px-3 py-2 rounded-xl bg-white text-[#7c43ba] font-bold text-sm flex items-center gap-1 flex-shrink-0"><Download className="w-4 h-4" /> Instalar</button>
      <button type="button" onClick={dismiss} className="w-8 h-8 rounded-full hover:bg-white/15 grid place-items-center flex-shrink-0" aria-label="Ahora no"><X className="w-4 h-4" /></button>
    </div>
  );
}

export function InstallHelpModal() {
  const ios = isIOS();
  const step = (icon: React.ReactNode, text: React.ReactNode) => (
    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#f6f1f8]"><span className="w-8 h-8 rounded-lg bg-white grid place-items-center flex-shrink-0 text-[#7c43ba]">{icon}</span><span className="text-sm pt-1">{text}</span></li>
  );
  return (
    <Modal id="install-help-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Instalar la app</h2><CloseButton onClick={() => closeModal('install-help-modal')} /></div>
        <ol className="space-y-2">
          {ios ? (
            <>
              {step(<Share className="w-4 h-4" />, <>Abre esta página en <b>Safari</b> y toca el botón <b>Compartir</b>.</>)}
              {step(<PlusSquare className="w-4 h-4" />, <>Elige <b>“Agregar a inicio”</b> y confirma con <b>Agregar</b>.</>)}
            </>
          ) : (
            <>
              {step(<MoreVertical className="w-4 h-4" />, <>En Chrome toca el menú <b>⋮</b> (arriba a la derecha).</>)}
              {step(<Download className="w-4 h-4" />, <>Elige <b>“Instalar aplicación”</b> (o “Agregar a pantalla principal”) y confirma.</>)}
            </>
          )}
        </ol>
        <p className="text-xs text-[#756c7e] mt-4">La app debe abrirse desde su dirección <b>https://</b> (por ejemplo la de Vercel). En la computadora también puedes instalarla con el ícono ⊕ de la barra de direcciones.</p>
      </article>
    </Modal>
  );
}
