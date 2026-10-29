import type { AuthUser, Role, StoreInvite, StoreMember, StoreMembership } from '../types';
import { supabaseClient } from './supabase';
import { getState, localUser, openModal, runAfterAccount, setState, toast } from '../store';
import { DB, startAutoSync, startHeartbeat, stopAutoSync, stopHeartbeat, uploadLocalToStore } from './db';
import { SoundEffects } from './sound';
import { readJSON } from './format';
import { AVATAR_KEY } from './constants';

const NO_DB = 'Falta conectar Supabase: en Vercel agrega VITE_SUPABASE_URL y VITE_SUPABASE_KEY y haz Redeploy';
const ACTIVE_KEY = 'mc7_active';
const MEMBERSHIPS_KEY = 'mc7_memberships';

export function roleLabel(role?: string) {
  if (role === 'admin') return 'Administrador';
  if (role === 'coadmin') return 'Co-Administrador';
  if (role === 'supervisor') return 'Supervisor';
  return 'Vendedor';
}

/** Traduce los errores más comunes de Supabase */
function friendly(e: unknown): Error {
  const msg = (e as { message?: string })?.message || String(e);
  if (/Invalid login credentials/i.test(msg)) return new Error('Correo o contraseña incorrectos');
  if (/Email not confirmed/i.test(msg)) return new Error('Debes confirmar tu correo. Revisa tu bandeja de entrada.');
  if (/User already registered/i.test(msg)) return new Error('Ese correo ya tiene una cuenta. Inicia sesión.');
  if (/Password should be at least/i.test(msg)) return new Error('La contraseña debe tener al menos 6 caracteres');
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return new Error('Falta activar Google en Supabase (Authentication → Providers → Google)');
  if (/rate limit/i.test(msg)) return new Error('Demasiados intentos. Espera unos minutos.');
  if (/Failed to fetch|NetworkError/i.test(msg)) return new Error('Sin conexión a internet');
  if (/function .* does not exist|Could not find the function/i.test(msg)) return new Error('Falta ejecutar el archivo supabase/1-migracion-multi-tienda.sql en Supabase');
  return new Error(msg);
}

function toAuthUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const m = u.user_metadata || {};
  // Google entrega la foto como avatar_url (o picture) y el nombre como full_name (o name)
  const avatar = String(m.avatar_url || m.picture || '');
  if (avatar) cacheAvatar(u.id, avatar); // se recuerda para mostrarla al abrir sin internet
  return { id: u.id, email: u.email || '', name: String(m.name || m.full_name || (u.email || '').split('@')[0]), avatar: avatar || cachedAvatar(u.id) || undefined };
}

/** Última foto conocida (para verla al instante y sin internet) */
function cachedAvatar(uid: string) {
  try { const c = JSON.parse(localStorage.getItem(AVATAR_KEY) || 'null'); return c?.uid === uid ? String(c.url) : ''; } catch { return ''; }
}
function cacheAvatar(uid: string, url: string) {
  try { if (url) localStorage.setItem(AVATAR_KEY, JSON.stringify({ uid, url })); else localStorage.removeItem(AVATAR_KEY); } catch { /* sin espacio */ }
}

// ==========================================
// CAMBIAR ENTRE DATOS LOCALES Y TIENDAS
// ==========================================
async function activate(mode: 'local' | 'cloud', m: StoreMembership | null) {
  stopAutoSync();
  stopHeartbeat();
  const s = getState();
  const user = mode === 'cloud' && m && s.authUser
    ? { id: s.authUser.id, name: m.name || s.authUser.name, username: '', email: s.authUser.email, phone: '', role: m.role, status: m.status }
    : localUser(s.contactInfo);
  setState({
    mode, activeStore: mode === 'cloud' ? m : null, currentUser: user, dataReady: false,
    catalogs: [], records: [], sales: [], pendingChanges: [], cart: [], clientMode: false,
    currentView: 'catalogs', currentCatalogId: null, query: '', globalQuery: '', modals: {}, formOpen: false,
  });
  localStorage.setItem(ACTIVE_KEY, JSON.stringify({ mode, storeId: m?.store_id || null }));
  await DB.init();
  if (mode === 'cloud') { startAutoSync(); startHeartbeat(); }
}

export async function switchToLocal() {
  await activate('local', null);
  setState({ accountVisible: false });
  toast('📱 Usando los datos de este dispositivo');
}

export async function openStore(m: StoreMembership) {
  if (m.status === 'blocked') { toast('Tu acceso a esta tienda está bloqueado'); return; }
  await activate('cloud', m);
  setState({ accountVisible: false });
  toast(`🏪 Conectado a ${m.store_name}`);
  SoundEffects.play('success');
  runAfterAccount();
}

// ==========================================
// INICIO
// ==========================================
export async function initSession() {
  // Limpiar datos de la versión anterior (guardaba contraseñas en el dispositivo)
  ['offline_users', 'current_user', 'last_login_date', 'pending_changes'].forEach(k => localStorage.removeItem(k));

  const saved = readJSON<{ mode: 'local' | 'cloud'; storeId: string | null }>(ACTIVE_KEY, { mode: 'local', storeId: null });
  const cachedMemberships = readJSON<StoreMembership[]>(MEMBERSHIPS_KEY, []);

  const invite = new URLSearchParams(location.search).get('invite');
  if (invite) setState({ pendingInviteCode: invite.toUpperCase() });

  let authUser: AuthUser | null = null;
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data.session?.user) authUser = toAuthUser(data.session.user);
    } catch { /* sin conexión: la sesión se lee del dispositivo */ }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setTimeout(() => openModal('change-password-modal'), 300); }
      if (event === 'SIGNED_OUT') {
        setState({ authUser: null, memberships: [] });
        if (getState().mode === 'cloud') activate('local', null);
      } else if (session?.user) {
        setState({ authUser: toAuthUser(session.user) });
      }
    });
  }
  setState({ authUser, memberships: authUser ? cachedMemberships : [] });

  const m = authUser && saved.mode === 'cloud' ? cachedMemberships.find(x => x.store_id === saved.storeId) : null;
  await activate(m ? 'cloud' : 'local', m || null);

  if (authUser) {
    loadMemberships().then(list => {
      const active = getState().activeStore;
      if (!active) return;
      const fresh = list.find(x => x.store_id === active.store_id);
      if (!fresh || fresh.status === 'blocked') { toast('Ya no tienes acceso a esa tienda'); activate('local', null); }
      else if (fresh.role !== active.role) setState({ activeStore: fresh, currentUser: { ...getState().currentUser, role: fresh.role } });
    }).catch(() => {});
  }
  if (getState().pendingInviteCode) setState({ accountVisible: true, accountStep: authUser ? 'stores' : 'auth', accountReason: 'Tienes una invitación para unirte a una tienda' });
}

// ==========================================
// CUENTA
// ==========================================
export async function signIn(email: string, password: string) {
  if (!supabaseClient) throw new Error(NO_DB);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw friendly(error);
  setState({ authUser: toAuthUser(data.user), accountStep: 'stores' });
  await loadMemberships();
  toast(`¡Hola, ${getState().authUser?.name}! 👋`);
}

/** Devuelve true si la cuenta quedó lista; false si hay que confirmar el correo */
export async function signUp(email: string, password: string, name: string) {
  if (!supabaseClient) throw new Error(NO_DB);
  const { data, error } = await supabaseClient.auth.signUp({
    email: email.trim().toLowerCase(), password,
    options: { data: { name: name.trim() }, emailRedirectTo: location.origin + location.pathname + location.search },
  });
  if (error) throw friendly(error);
  if (!data.session || !data.user) return false;
  setState({ authUser: toAuthUser(data.user), accountStep: 'stores', memberships: [] });
  return true;
}

/** Inicia sesión con Google: la foto y el nombre vienen de la cuenta de Google */
export async function signInWithGoogle() {
  if (!supabaseClient) throw new Error(NO_DB);
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname + location.search },
  });
  if (error) throw friendly(error);
}

export async function resetPassword(email: string) {
  if (!supabaseClient) throw new Error(NO_DB);
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + '/' });
  if (error) throw friendly(error);
}

export async function changePassword(current: string, next: string) {
  const u = getState().authUser;
  if (!supabaseClient || !u) throw new Error('Debes iniciar sesión');
  if (current) {
    const check = await supabaseClient.auth.signInWithPassword({ email: u.email, password: current });
    if (check.error) throw new Error('La contraseña actual no es correcta');
  }
  const { error } = await supabaseClient.auth.updateUser({ password: next });
  if (error) throw friendly(error);
}

export async function signOut() {
  if (!confirm('¿Cerrar sesión? Volverás a los datos de este dispositivo.')) return;
  stopAutoSync();
  stopHeartbeat();
  try { await supabaseClient?.auth.signOut(); } catch { /* sin conexión */ }
  localStorage.removeItem(MEMBERSHIPS_KEY);
  setState({ authUser: null, memberships: [], accountStep: 'auth' });
  await activate('local', null);
  toast('Sesión cerrada');
}

export async function updateMyName(name: string) {
  const s = getState();
  if (!supabaseClient || !s.authUser) return;
  await supabaseClient.auth.updateUser({ data: { name } });
  if (s.activeStore) {
    const { error } = await supabaseClient.rpc('update_my_member_name', { p_store: s.activeStore.store_id, p_name: name });
    if (error) throw friendly(error);
  }
  const activeStore = s.activeStore ? { ...s.activeStore, name } : null;
  setState({ authUser: { ...s.authUser, name }, activeStore, currentUser: { ...s.currentUser, name } });
  await loadMemberships();
}

// ==========================================
// TIENDAS
// ==========================================
export async function loadMemberships(): Promise<StoreMembership[]> {
  const u = getState().authUser;
  if (!supabaseClient || !u) return [];
  const { data, error } = await supabaseClient
    .from('store_members')
    .select('store_id, role, status, name, stores(name, owner_id)')
    .eq('user_id', u.id);
  if (error) throw friendly(error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: StoreMembership[] = (data || []).map((r: any) => {
    const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;
    return { store_id: r.store_id, store_name: store?.name || 'Tienda', role: r.role, status: r.status, name: r.name || u.name, is_owner: store?.owner_id === u.id };
  });
  localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(list));
  setState({ memberships: list });
  return list;
}

export async function createStore(name: string, uploadLocal: boolean) {
  if (!supabaseClient || !getState().authUser) throw new Error('Debes iniciar sesión');
  const { data, error } = await supabaseClient.rpc('create_store', { p_name: name.trim(), p_owner_name: getState().authUser!.name });
  if (error) throw friendly(error);
  const sid = data as string;
  let uploaded = 0;
  if (uploadLocal) uploaded = await uploadLocalToStore(sid);
  const list = await loadMemberships();
  const m = list.find(x => x.store_id === sid);
  if (m) await openStore(m);
  if (uploaded) toast(`🏪 Tienda creada con ${uploaded} productos`);
}

export async function joinStore(code: string) {
  if (!supabaseClient || !getState().authUser) throw new Error('Debes iniciar sesión');
  const { data, error } = await supabaseClient.rpc('join_store', { p_code: code.trim().toUpperCase(), p_name: getState().authUser!.name });
  if (error) throw friendly(error);
  const row = Array.isArray(data) ? data[0] : data;
  setState({ pendingInviteCode: '' });
  history.replaceState(null, '', location.pathname);
  const list = await loadMemberships();
  const m = list.find(x => x.store_id === row?.store_id);
  if (m) await openStore(m);
}

export async function leaveStore(m: StoreMembership) {
  if (m.is_owner) { toast('Eres el dueño de esta tienda; no puedes salir'); return; }
  if (!confirm(`¿Salir de "${m.store_name}"? Necesitarás un nuevo código para volver.`)) return;
  const u = getState().authUser!;
  const { error } = await supabaseClient!.from('store_members').delete().eq('store_id', m.store_id).eq('user_id', u.id);
  if (error) throw friendly(error);
  if (getState().activeStore?.store_id === m.store_id) await activate('local', null);
  await loadMemberships();
}

// ==========================================
// EQUIPO E INVITACIONES (administradores)
// ==========================================
const sid = () => getState().activeStore?.store_id || '';

export async function listMembers(): Promise<StoreMember[]> {
  const { data, error } = await supabaseClient!.from('store_members').select('*').eq('store_id', sid()).order('joined_at');
  if (error) throw friendly(error);
  return (data || []) as StoreMember[];
}

export async function updateMember(userId: string, patch: Partial<Pick<StoreMember, 'role' | 'status'>>) {
  const { data, error } = await supabaseClient!.from('store_members').update(patch).eq('store_id', sid()).eq('user_id', userId).select();
  if (error) throw friendly(error);
  if (!data || data.length === 0) throw new Error('No tienes permiso para cambiar a este usuario');
}

export async function removeMember(userId: string) {
  const { data, error } = await supabaseClient!.from('store_members').delete().eq('store_id', sid()).eq('user_id', userId).select();
  if (error) throw friendly(error);
  if (!data || data.length === 0) throw new Error('No tienes permiso para quitar a este usuario');
}

export async function listInvites(): Promise<StoreInvite[]> {
  const { data, error } = await supabaseClient!.from('store_invites').select('*').eq('store_id', sid()).order('created_at', { ascending: false });
  if (error) throw friendly(error);
  return (data || []) as StoreInvite[];
}

export async function createInvite(role: Role, days: number, maxUses: number): Promise<string> {
  const { data, error } = await supabaseClient!.rpc('create_invite', { p_store: sid(), p_role: role, p_days: days, p_max_uses: maxUses });
  if (error) throw friendly(error);
  return data as string;
}

export async function revokeInvite(code: string) {
  const { error } = await supabaseClient!.from('store_invites').update({ revoked: true }).eq('code', code);
  if (error) throw friendly(error);
}

export function inviteLink(code: string) {
  return `${location.origin}/?invite=${encodeURIComponent(code)}`;
}

export function inviteMessage(code: string, role: Role) {
  const store = getState().activeStore?.store_name || 'mi tienda';
  return `Hola 👋 Te invito a ${store} en *MiNegocio7pro* como ${roleLabel(role)}.\n\n` +
    `1. Abre este enlace e instala la app: ${inviteLink(code)}\n` +
    `2. Crea tu cuenta con tu correo (o inicia sesión).\n` +
    `3. Si te lo pide, escribe el código: *${code}*`;
}
