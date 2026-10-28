import { ArrowRight } from 'lucide-react';
import { useStore } from '../store';
import { enterStore } from '../actions';

export default function WelcomeScreen() {
  const visible = useStore(s => s.welcomeVisible);
  if (!visible) return null;
  return (
    <section id="welcome-screen" className="welcome" onClick={e => { if (!(e.target as HTMLElement).closest('#enter-store')) enterStore(); }}>
      <img src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1200" loading="lazy" alt="" />
      <div className="welcome-content">
        <p className="uppercase tracking-[.2em] font-bold text-xs opacity-80">Mi Catálogo 7pro</p>
        <h1>Tu negocio, <br />organizado y listo para vender.</h1>
        <p className="max-w-md mx-auto text-base sm:text-lg leading-relaxed opacity-90">Gestiona tus productos, controla el stock y genera pedidos al instante desde tu móvil o computadora.</p>
        <button id="enter-store" type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); enterStore(); }} className="mt-6 rounded-full px-7 py-3.5 font-bold inline-flex items-center gap-2 bg-white text-[#7c43ba] hover:bg-[#f6f1f8] transition shadow-xl">
          <span>Entrar a la tienda</span><ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <p className="welcome-tap-hint">Toca cualquier parte para entrar</p>
    </section>
  );
}
