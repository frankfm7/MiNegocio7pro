// ==========================================
// MENSAJES DENTRO DE LA APP
// ==========================================
// Dos canales por tienda (tabla store_messages, archivo supabase/10):
//   equipo  → chat del dueño con su equipo (texto, fotos, videos, audios)
//   pedidos → pedidos que mandan los clientes desde el catálogo público (sin WhatsApp)
// Las fotos/videos/audios se guardan en el Storage privado "mensajes" (<tienda>/<archivo>)
// y se ven con enlaces firmados que duran 1 hora.

import { getState, setState, toast } from '../store';
import { supabaseClient } from './supabase';
import { compressImage } from './image';
import { SoundEffects } from './sound';

export type Channel = 'equipo' | 'pedidos';
export type OrderStatus = 'nuevo' | 'visto' | 'preparando' | 'listo' | 'entregado' | 'cancelado';
export interface MediaItem { path: string; type: 'image' | 'video' | 'audio' | 'file'; name?: string; size?: number }
export interface OrderLine { name: string; qty: number; price?: number; code?: string; page?: number; magazine?: string; note?: string }
export interface OrderData { items?: OrderLine[]; total?: number; phone?: string; note?: string; source?: 'catalogo' | 'revista'; eta?: string }
export interface StoreMessage {
  id: string;
  store_id: string;
  channel: Channel;
  sender_uid: string | null;
  sender_name: string;
  body: string;
  media: MediaItem[];
  order_data: OrderData | null;
  status: OrderStatus;
  read_by: string[];
  created_at: string;
  /** Mensaje que aún se está enviando (solo en este teléfono) */
  _sending?: boolean;
}

export const ORDER_STATUS: { id: OrderStatus; label: string; color: string }[] = [
  { id: 'nuevo', label: '🆕 Nuevo', color: '#be416d' },
  { id: 'visto', label: '👀 Visto', color: '#3875a5' },
  { id: 'preparando', label: '📦 Preparando', color: '#d97706' },
  { id: 'listo', label: '✅ Listo para entregar', color: '#23805d' },
  { id: 'entregado', label: '🎉 Entregado', color: '#166534' },
  { id: 'cancelado', label: '✖ Cancelado', color: '#756c7e' },
];

const BUCKET = 'mensajes';
const MAX_MB = 50;
const sid = () => (getState().mode === 'cloud' ? getState().activeStore?.store_id || null : null);
const uid = () => getState().authUser?.id || null;

/** ¿Se pueden usar los mensajes? (necesitan una tienda en la nube) */
export const messagesAvailable = () => !!(supabaseClient && sid() && uid());

/** Error claro cuando falta ejecutar el archivo 10 en Supabase */
export function friendlyMsgError(e: unknown) {
  const m = (e as { message?: string })?.message || String(e);
  if (/store_messages|schema cache|does not exist|relation/i.test(m)) return 'Para usar los mensajes ejecuta supabase/10-mensajes-revistas-roles.sql en Supabase';
  if (/bucket|Bucket not found/i.test(m)) return 'Falta el espacio de archivos "mensajes": ejecuta supabase/10-mensajes-revistas-roles.sql';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión';
  return m;
}

export async function loadMessages(channel: Channel, limit = 150): Promise<StoreMessage[]> {
  const s = sid();
  if (!supabaseClient || !s) return [];
  const { data, error } = await supabaseClient.from('store_messages').select('*')
    .eq('store_id', s).eq('channel', channel).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(friendlyMsgError(error));
  return ((data || []) as StoreMessage[]).reverse();
}

/** Cuenta los mensajes sin leer de los dos canales (para el globito rojo) */
export async function refreshUnread() {
  const s = sid(), me = uid();
  if (!supabaseClient || !s || !me) { setState({ unread: { equipo: 0, pedidos: 0 } }); return; }
  const count = async (channel: Channel) => {
    const { count: n, error } = await supabaseClient!.from('store_messages').select('id', { count: 'exact', head: true })
      .eq('store_id', s).eq('channel', channel).not('read_by', 'cs', `{${me}}`).or(`sender_uid.is.null,sender_uid.neq.${me}`);
    return error ? 0 : n || 0;
  };
  const [equipo, pedidos] = await Promise.all([count('equipo'), count('pedidos')]);
  setState({ unread: { equipo, pedidos } });
}

export async function markRead(channel: Channel) {
  const s = sid();
  if (!supabaseClient || !s) return;
  await supabaseClient.rpc('mark_messages_read', { p_store: s, p_channel: channel });
  setState({ unread: { ...getState().unread, [channel]: 0 } });
}

const kindOf = (f: Blob): MediaItem['type'] => (f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'file');
const extOf = (f: Blob & { name?: string }) => (f.name && /\.[a-z0-9]{2,5}$/i.test(f.name) ? f.name.split('.').pop()!.toLowerCase()
  : f.type.includes('jpeg') ? 'jpg' : f.type.includes('png') ? 'png' : f.type.includes('webm') ? 'webm' : f.type.includes('mp4') ? 'mp4' : f.type.includes('ogg') ? 'ogg' : f.type.includes('mpeg') ? 'mp3' : 'bin');

/** Sube una foto (comprimida), video o audio y devuelve su ruta */
async function upload(file: Blob & { name?: string }): Promise<MediaItem> {
  const s = sid()!;
  let body: Blob = file;
  const type = kindOf(file);
  if (type === 'image' && !/gif/i.test(file.type)) {
    const b64 = await compressImage(file as File, 1600, 0.85);
    body = await (await fetch(b64)).blob();
  }
  if (body.size > MAX_MB * 1024 * 1024) throw new Error(`El archivo pesa más de ${MAX_MB} MB`);
  const ext = type === 'image' && body.type.includes('jpeg') ? 'jpg' : extOf(file);
  const path = `${s}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseClient!.storage.from(BUCKET).upload(path, body, { contentType: body.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(friendlyMsgError(error));
  return { path, type, name: file.name, size: body.size };
}

/** Envía un mensaje (con archivos opcionales) */
export async function sendMessage(channel: Channel, body: string, files: (Blob & { name?: string })[] = []): Promise<StoreMessage | null> {
  const s = sid(), me = uid();
  if (!supabaseClient || !s || !me) { toast('Los mensajes necesitan una tienda en la nube'); return null; }
  if (!body.trim() && !files.length) return null;
  const media: MediaItem[] = [];
  for (const f of files) media.push(await upload(f));
  const row = { store_id: s, channel, sender_uid: me, sender_name: getState().currentUser?.name || getState().authUser?.name || '', body: body.trim().slice(0, 4000), media };
  const { data, error } = await supabaseClient.from('store_messages').insert(row).select().single();
  if (error) throw new Error(friendlyMsgError(error));
  return data as StoreMessage;
}

export async function setOrderStatus(id: string, status: OrderStatus) {
  const { error } = await supabaseClient!.from('store_messages').update({ status }).eq('id', id);
  if (error) throw new Error(friendlyMsgError(error));
}

export async function deleteMessage(m: StoreMessage) {
  const { error } = await supabaseClient!.from('store_messages').delete().eq('id', m.id);
  if (error) throw new Error(friendlyMsgError(error));
  if (m.media?.length) await supabaseClient!.storage.from(BUCKET).remove(m.media.map(x => x.path)).catch(() => {});
}

// Enlaces firmados (las fotos son privadas de la tienda)
const urlCache = new Map<string, { url: string; until: number }>();
export async function mediaUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need = paths.filter(p => { const c = urlCache.get(p); if (c && c.until > now) { out[p] = c.url; return false; } return true; });
  if (need.length && supabaseClient) {
    const { data } = await supabaseClient.storage.from(BUCKET).createSignedUrls(need, 3600);
    (data || []).forEach(d => { if (d.signedUrl && d.path) { urlCache.set(d.path, { url: d.signedUrl, until: now + 3500 * 1000 }); out[d.path] = d.signedUrl; } });
  }
  return out;
}

// ---------- Avisos al instante ----------
type Listener = (m: StoreMessage, kind: 'INSERT' | 'UPDATE' | 'DELETE') => void;
const listeners = new Set<Listener>();
let channelRef: ReturnType<NonNullable<typeof supabaseClient>['channel']> | null = null;
let watchingStore: string | null = null;

export function onMessage(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Se suscribe a los mensajes de la tienda activa (Realtime). Llamar al cambiar de tienda. */
export function watchMessages() {
  const s = sid();
  if (watchingStore === s) return;
  if (channelRef && supabaseClient) { supabaseClient.removeChannel(channelRef); channelRef = null; }
  watchingStore = s;
  if (!supabaseClient || !s) return;
  channelRef = supabaseClient.channel(`msgs-${s}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_messages', filter: `store_id=eq.${s}` }, payload => {
      const kind = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
      const m = (kind === 'DELETE' ? payload.old : payload.new) as StoreMessage;
      listeners.forEach(fn => fn(m, kind));
      if (kind === 'INSERT' && m.sender_uid !== uid()) {
        const viewing = getState().currentView === 'messages' && getState().chatChannel === m.channel && document.visibilityState === 'visible';
        if (!viewing) {
          setState({ unread: { ...getState().unread, [m.channel]: getState().unread[m.channel] + 1 } });
          toast(m.channel === 'pedidos' ? `🛍️ Nuevo pedido de ${m.sender_name || 'un cliente'}` : `💬 ${m.sender_name}: ${m.body ? m.body.slice(0, 60) : m.media?.length ? '📎 archivo' : ''}`, 4000);
          SoundEffects.play('success');
          notifySystem(m);
        }
      }
    })
    .subscribe();
}

function notifySystem(m: StoreMessage) {
  try {
    if (document.visibilityState === 'visible' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(m.channel === 'pedidos' ? 'Nuevo pedido' : `Mensaje de ${m.sender_name}`, { body: m.body.slice(0, 120) || '📎 archivo', icon: '/icon-192.png', tag: 'mn7-msg' });
  } catch { /* sin notificaciones */ }
}

/** Texto del pedido para copiar o mandar por WhatsApp */
export function orderText(m: StoreMessage) {
  const o = m.order_data || {};
  const lines = (o.items || []).map(i => `• ${i.qty} x ${i.name}${i.code ? ` (cód. ${i.code})` : ''}${i.magazine ? ` · ${i.magazine}${i.page ? ' pág. ' + i.page : ''}` : ''}`);
  return [`Pedido de ${m.sender_name}`, ...lines, ...(o.total ? [`Total: ${o.total}`] : []), ...(o.note ? [`Nota: ${o.note}`] : [])].join('\n');
}

