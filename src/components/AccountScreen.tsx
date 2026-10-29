import { useEffect, useState } from 'react';
import {
  ArrowLeft, Check, Cloud, Eye, EyeOff, KeyRound, Loader, LogIn, LogOut, Mail, Smartphone, Store, Ticket, UserPlus,
} from 'lucide-react';
import { setState, toast, useStore } from '../store';
import {
  createStore, joinStore, loadMemberships, openStore, resetPassword, roleLabel, signIn, signInWithGoogle, signOut, signUp, switchToLocal,
} from '../lib/session';
import { SoundEffects } from '../lib/sound';
import Brand from './Brand';
import Avatar from './Avatar';

function PasswordInput({ value, onChange, placeholder = '••••••••', autoComplete }: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} required minLength={6} value={value} onChange={e => onChange(e.target.value)} className="w-full input-field rounded-xl p-3 pr-12" placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-[#756c7e] hover:text-[#7c43ba]" aria-label={show ? 'Ocultar' : 'Mostrar'}>
        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}

function AuthStep() {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      if (tab === 'login') await signIn(email, password);
      else if (tab === 'register') {
        const ready = await signUp(email, password, name || email.split('@')[0]);
        if (ready) toast('✅ Cuenta creada');
        else { setInfo('📧 Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego vuelve a iniciar sesión.'); setTab('login'); }
      } else {
        await resetPassword(email);
        setInfo('📧 Te enviamos un enlace para crear una contraseña nueva.');
        setTab('login');
      }
    } catch (err) {
      setError('❌ ' + (err as Error).message);
      SoundEffects.play('error');
    }
    setLoading(false);
  };

  const google = async () => {
    setError(''); setLoading(true);
    try { await signInWithGoogle(); } // redirige a Google; al volver la sesión queda iniciada
    catch (err) { setError('❌ ' + (err as Error).message); SoundEffects.play('error'); setLoading(false); }
  };

  const tabCls = (t: string) => `flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === t ? 'bg-white text-[#7c43ba] shadow-sm' : 'text-[#756c7e]'}`;

  return (
    <>
      {tab !== 'forgot' && (
        <div className="flex gap-1 p-1 rounded-2xl bg-[#f3eef6] mb-5">
          <button type="button" className={tabCls('login')} onClick={() => { setTab('login'); setError(''); }}>Iniciar sesión</button>
          <button type="button" className={tabCls('register')} onClick={() => { setTab('register'); setError(''); }}>Crear cuenta</button>
        </div>
      )}
      {tab !== 'forgot' && (
        <>
          <button type="button" disabled={loading} onClick={google} className="w-full py-3 rounded-xl border-2 border-[#e8dfec] bg-white hover:bg-[#f6f1f8] font-bold text-sm text-[#201728] flex items-center justify-center gap-3">
            <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            Continuar con Google
          </button>
          <div className="flex items-center gap-3 my-4 text-[11px] uppercase tracking-wider text-[#756c7e] font-bold"><span className="flex-1 h-px bg-[#e8dfec]" />o con tu correo<span className="flex-1 h-px bg-[#e8dfec]" /></div>
        </>
      )}
      <form className="space-y-4" onSubmit={submit}>
        {tab === 'register' && (
          <div><label className="block font-bold text-sm mb-1.5">Tu nombre</label><input value={name} onChange={e => setName(e.target.value)} required className="w-full input-field rounded-xl p-3" placeholder="Ej: Ana Pérez" autoComplete="name" /></div>
        )}
        <div><label className="block font-bold text-sm mb-1.5">Correo electrónico</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full input-field rounded-xl p-3" placeholder="tucorreo@gmail.com" autoComplete="email" /></div>
        {tab !== 'forgot' && (
          <div><label className="block font-bold text-sm mb-1.5">Contraseña</label><PasswordInput value={password} onChange={setPassword} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} placeholder={tab === 'register' ? 'Mínimo 6 caracteres' : '••••••••'} /></div>
        )}
        {error && <div className="rounded-xl p-3 bg-[#fff0f3] text-[#a43658] text-sm text-center">{error}</div>}
        {info && <div className="rounded-xl p-3 bg-[#f0fdf4] text-[#166534] text-sm text-center">{info}</div>}
        <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl font-bold btn-primary flex items-center justify-center gap-2">
          {loading ? <><Loader className="w-4 h-4 animate-spin" /> Un momento...</>
            : tab === 'login' ? <><LogIn className="w-4 h-4" /> Iniciar sesión</>
            : tab === 'register' ? <><UserPlus className="w-4 h-4" /> Crear cuenta</>
            : <><Mail className="w-4 h-4" /> Enviar enlace</>}
        </button>
        {tab === 'login' && <button type="button" onClick={() => setTab('forgot')} className="w-full text-xs text-[#7c43ba] font-bold hover:underline">¿Olvidaste tu contraseña?</button>}
        {tab === 'forgot' && <button type="button" onClick={() => setTab('login')} className="w-full text-xs text-[#7c43ba] font-bold hover:underline">Volver a iniciar sesión</button>}
      </form>
    </>
  );
}

function StoresStep() {
  const authUser = useStore(s => s.authUser)!;
  const memberships = useStore(s => s.memberships);
  const active = useStore(s => s.activeStore);
  const mode = useStore(s => s.mode);
  const localCount = useStore(s => (s.mode === 'local' ? s.records.length : 0));
  const pendingCode = useStore(s => s.pendingInviteCode);
  const [code, setCode] = useState(pendingCode);
  const [storeName, setStoreName] = useState('');
  const [upload, setUpload] = useState(true);
  const [busy, setBusy] = useState<'' | 'join' | 'create'>('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { loadMemberships().catch(e => setError('❌ ' + (e as Error).message)); }, []);
  useEffect(() => { if (pendingCode) setCode(pendingCode); }, [pendingCode]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy('join');
    try { await joinStore(code); } catch (err) { setError('❌ ' + (err as Error).message); SoundEffects.play('error'); }
    setBusy('');
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy('create');
    try { await createStore(storeName, upload && mode === 'local'); } catch (err) { setError('❌ ' + (err as Error).message); SoundEffects.play('error'); }
    setBusy('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#f6f1f8]">
        <Avatar size={44} />
        <div className="min-w-0 flex-1"><p className="font-bold text-sm truncate">{authUser.name}</p><p className="text-xs text-[#756c7e] truncate">{authUser.email}</p></div>
        <button type="button" onClick={signOut} className="w-9 h-9 rounded-full hover:bg-white grid place-items-center text-[#a43658]" title="Cerrar sesión"><LogOut className="w-4 h-4" /></button>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e] mb-2">¿Con qué datos quieres trabajar?</p>
        <div className="space-y-2">
          <button type="button" onClick={switchToLocal} className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition ${mode === 'local' ? 'border-[#7c43ba] bg-[#f6f1f8]' : 'border-[#ede7f0] hover:border-[#d4c5e0]'}`}>
            <div className="w-10 h-10 rounded-xl bg-[#3875a5]/10 grid place-items-center"><Smartphone className="w-5 h-5 text-[#3875a5]" /></div>
            <div className="flex-1 min-w-0"><p className="font-bold text-sm">Mis datos en este dispositivo</p><p className="text-xs text-[#756c7e]">Solo en este celular o computadora</p></div>
            {mode === 'local' && <Check className="w-5 h-5 text-[#7c43ba]" />}
          </button>
          {memberships.map(m => (
            <button key={m.store_id} type="button" onClick={() => openStore(m)} className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition ${active?.store_id === m.store_id ? 'border-[#7c43ba] bg-[#f6f1f8]' : 'border-[#ede7f0] hover:border-[#d4c5e0]'} ${m.status === 'blocked' ? 'opacity-50' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-[#7c43ba]/10 grid place-items-center"><Store className="w-5 h-5 text-[#7c43ba]" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{m.store_name}</p>
                <p className="text-xs text-[#756c7e]">{m.is_owner ? 'Dueño · ' : ''}{roleLabel(m.role)}{m.status === 'blocked' ? ' · Bloqueado' : ''}</p>
              </div>
              {active?.store_id === m.store_id ? <Check className="w-5 h-5 text-[#7c43ba]" /> : <Cloud className="w-4 h-4 text-[#b8a8c8]" />}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={join} className="p-4 rounded-2xl border-2 border-dashed border-[#d4c5e0]">
        <p className="font-bold text-sm flex items-center gap-2"><Ticket className="w-4 h-4 text-[#7c43ba]" /> Unirme a una tienda</p>
        <p className="text-xs text-[#756c7e] mt-1 mb-3">Escribe el código de invitación que te envió el dueño de la tienda.</p>
        <div className="flex gap-2">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required className="flex-1 min-w-0 input-field rounded-xl p-3 font-mono tracking-wider uppercase" placeholder="MC7-XXXXXXXX" autoCapitalize="characters" />
          <button type="submit" disabled={!!busy} className="btn-primary rounded-xl px-4 font-bold text-sm flex items-center gap-1">{busy === 'join' ? <Loader className="w-4 h-4 animate-spin" /> : 'Unirme'}</button>
        </div>
      </form>

      {!showCreate ? (
        <button type="button" onClick={() => setShowCreate(true)} className="w-full py-3 rounded-xl btn-ghost font-bold text-sm flex items-center justify-center gap-2"><Store className="w-4 h-4" /> Crear mi propia tienda en la nube</button>
      ) : (
        <form onSubmit={create} className="p-4 rounded-2xl bg-[#f6f1f8] space-y-3">
          <p className="font-bold text-sm flex items-center gap-2"><Store className="w-4 h-4 text-[#7c43ba]" /> Nueva tienda</p>
          <p className="text-xs text-[#756c7e]">Serás el dueño. Tus datos quedan separados de otras tiendas y podrás invitar vendedores con un código.</p>
          <input value={storeName} onChange={e => setStoreName(e.target.value)} required maxLength={60} className="w-full input-field rounded-xl p-3" placeholder="Nombre de la tienda" />
          {mode === 'local' && localCount > 0 && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={upload} onChange={e => setUpload(e.target.checked)} className="mt-1 accent-[#7c43ba]" />
              <span>Subir mis {localCount} productos de este dispositivo a la nueva tienda</span>
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl btn-ghost font-bold text-sm">Cancelar</button>
            <button type="submit" disabled={!!busy} className="flex-1 py-2.5 rounded-xl btn-primary font-bold text-sm flex items-center justify-center gap-2">{busy === 'create' ? <Loader className="w-4 h-4 animate-spin" /> : 'Crear tienda'}</button>
          </div>
        </form>
      )}
      {error && <div className="rounded-xl p-3 bg-[#fff0f3] text-[#a43658] text-sm text-center">{error}</div>}
    </div>
  );
}

export default function AccountScreen() {
  const visible = useStore(s => s.accountVisible);
  const reason = useStore(s => s.accountReason);
  const authUser = useStore(s => s.authUser);
  if (!visible) return null;
  const close = () => setState({ accountVisible: false, accountReason: '' });

  return (
    <section id="login-screen" className="login-screen overflow-y-auto items-start sm:items-center py-6">
      <div className="login-container relative my-auto">
        <button type="button" onClick={close} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-[#f3eef6] grid place-items-center hover:bg-[#e8dfec] text-[#756c7e]" aria-label="Volver"><ArrowLeft className="w-4 h-4" /></button>
        <div className="login-logo"><img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl" /></div>
        <h1 className="hero-title text-2xl sm:text-3xl font-bold text-center text-[#201728]"><Brand /></h1>
        <p className="text-center text-[#756c7e] mt-2 mb-6 text-sm">
          {reason || (authUser ? 'Elige tu tienda o únete con un código' : 'Inicia sesión para conectarte a una tienda')}
        </p>
        {authUser ? <StoresStep /> : <AuthStep />}
        {!authUser && (
          <>
            <button type="button" onClick={close} className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold text-[#7c43ba] hover:bg-[#f6f1f8]">Seguir sin cuenta (datos solo en este dispositivo)</button>
            <div className="mt-3 p-3 rounded-xl bg-[#f6f1f8] text-xs text-[#756c7e] flex gap-2">
              <KeyRound className="w-4 h-4 flex-shrink-0 text-[#7c43ba]" />
              <span>¿Eres vendedor? Crea tu cuenta con tu correo y luego escribe el código de invitación que te dio el dueño.</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
