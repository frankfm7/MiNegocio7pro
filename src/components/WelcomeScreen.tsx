import { ArrowRight, LogIn } from 'lucide-react';
import { openAccount, useStore } from '../store';
import { enterStore } from '../actions';
import Brand from './Brand';
import Avatar from './Avatar';

export default function WelcomeScreen() {
  const visible = useStore(s => s.welcomeVisible);
  const authUser = useStore(s => s.authUser);
  if (!visible) return null;
  const login = () => { enterStore(); openAccount(); };
  return (
    <section id="welcome-screen" className="welcome" onClick={e => { if (!(e.target as HTMLElement).closest('#enter-store, #welcome-login')) enterStore(); }}>
      <img src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1200" loading="lazy" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
      {authUser && (
        <div className="absolute top-0 inset-x-0 z-[2] flex items-center justify-center gap-3 pt-[max(20px,env(safe-area-inset-top))] pb-2">
          <Avatar size={52} />
          <p className="font-bold text-sm text-left leading-tight"><span className="opacity-80 font-medium block text-xs">Hola de nuevo</span>{authUser.name}</p>
        </div>
      )}
      <div className="welcome-content">
        <p className="font-extrabold text-2xl sm:text-3xl tracking-tight"><Brand bright /></p>
        <h1>Tu negocio, <br />organizado y listo para vender.</h1>
        <p className="max-w-md mx-auto text-base sm:text-lg leading-relaxed opacity-90">Gestiona tus productos, controla el stock y genera pedidos al instante desde tu móvil o computadora.</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button id="enter-store" type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); enterStore(); }} className="rounded-full px-7 py-3.5 font-bold inline-flex items-center gap-2 bg-white text-[#7c43ba] hover:bg-[#f6f1f8] transition shadow-xl">
            <span>Entrar a la tienda</span><ArrowRight className="w-4 h-4" />
          </button>
          {!authUser && (
            <button id="welcome-login" type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); login(); }} className="rounded-full px-6 py-2.5 font-bold text-sm inline-flex items-center gap-2 border-2 border-white/70 text-white hover:bg-white/15 transition">
              <LogIn className="w-4 h-4" /><span>Iniciar sesión</span>
            </button>
          )}
        </div>
      </div>
      <p className="welcome-tap-hint">Toca cualquier parte para entrar</p>
    </section>
  );
}
