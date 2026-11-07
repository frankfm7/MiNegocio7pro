import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Copy, Mic, MessageCircle, Paperclip, Phone, Send, Square, Trash2, X } from 'lucide-react';
import { getState, openAccount, setState, toast, useStore } from '../store';
import {
  ORDER_STATUS, deleteMessage, loadMessages, markRead, mediaUrls, messagesAvailable, onMessage, orderText, sendMessage, setOrderStatus,
  type Channel, type StoreMessage,
} from '../lib/messages';
import { captureFromCamera } from '../lib/camera';
import { formatUSD } from '../lib/format';
import { waLink } from '../lib/whatsapp';
import Avatar from '../components/Avatar';
import { TopbarMenuButton } from './CatalogsScreen';

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Fotos, videos y audios de un mensaje (enlaces firmados) */
function Media({ m }: { m: StoreMessage }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!m.media?.length) return;
    let live = true;
    mediaUrls(m.media.map(x => x.path)).then(u => { if (live) setUrls(u); });
    return () => { live = false; };
  }, [m.media]);
  if (!m.media?.length) return null;
  return (
    <div className="msg-media mt-1 space-y-1">
      {m.media.map(x => {
        const u = urls[x.path];
        if (!u) return <div key={x.path} className="w-48 h-24 rounded-xl bg-black/10 animate-pulse" />;
        if (x.type === 'image') return <img key={x.path} src={u} alt="" className="max-w-[240px] max-h-72 rounded-xl object-cover cursor-pointer" onClick={() => setState({ imageLightbox: { src: u, alt: 'Foto' } })} />;
        if (x.type === 'video') return <video key={x.path} src={u} controls playsInline className="max-w-[260px] max-h-80 rounded-xl bg-black" />;
        if (x.type === 'audio') return <audio key={x.path} src={u} controls className="w-60 max-w-full" />;
        return <a key={x.path} href={u} target="_blank" rel="noopener noreferrer" className="underline text-sm">📎 {x.name || 'archivo'}</a>;
      })}
    </div>
  );
}

/** Grabar nota de voz (toca para empezar, toca otra vez para enviar) */
function useRecorder(onDone: (f: File) => void) {
  const rec = useRef<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(-1);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const cancelled = useRef(false);
  const start = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { toast('Este navegador no permite grabar audio'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      cancelled.current = false;
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timer.current); setSecs(-1);
        if (cancelled.current || !chunks.length) return;
        const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
        onDone(new File([blob], `audio.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`, { type: blob.type }));
      };
      r.start();
      rec.current = r;
      setSecs(0);
      timer.current = setInterval(() => setSecs(s => { if (s >= 299) { r.stop(); } return s + 1; }), 1000);
    } catch {
      toast('No se pudo usar el micrófono. Revisa el permiso del micrófono del navegador.', 4000);
    }
  };
  const stop = (cancel = false) => { cancelled.current = cancel; rec.current?.state === 'recording' && rec.current.stop(); };
  return { secs, start, stop, recording: secs >= 0 };
}

function OrderCard({ m, canDelete }: { m: StoreMessage; canDelete: boolean }) {
  const o = m.order_data || {};
  const st = ORDER_STATUS.find(s => s.id === m.status) || ORDER_STATUS[0];
  const phone = o.phone || '';
  const change = async (status: StoreMessage['status']) => { try { await setOrderStatus(m.id, status); } catch (e) { toast((e as Error).message, 4000); } };
  return (
    <article className="order-card rounded-2xl bg-white shadow-sm border-l-4 p-3.5" style={{ borderLeftColor: st.color }}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">{m.sender_name || 'Cliente'} {o.source === 'revista' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f6f1f8] text-[#7c43ba] font-bold align-middle">De revista</span>}</p>
          <p className="text-[11px] text-[#756c7e]">{time(m.created_at)}{phone ? ` · ${phone}` : ''}</p>
        </div>
        <select value={m.status} onChange={e => change(e.target.value as StoreMessage['status'])} className="text-[11px] font-bold rounded-lg border border-[#e8dfec] px-1.5 py-1" style={{ color: st.color }}>
          {ORDER_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      {(o.items || []).length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {o.items!.map((i, k) => (
            <li key={k} className="flex gap-2"><span className="font-bold text-[#7c43ba]">{i.qty}×</span><span className="flex-1 min-w-0">{i.name}{i.code ? <span className="text-[11px] text-[#756c7e]"> · cód. {i.code}</span> : null}{i.magazine ? <span className="text-[11px] text-[#756c7e]"> · {i.magazine}{i.page ? ` pág. ${i.page}` : ''}</span> : null}{i.note ? <span className="block text-[11px] text-[#756c7e]">{i.note}</span> : null}</span>{i.price ? <span className="text-xs font-bold">{formatUSD(i.price * i.qty)}</span> : null}</li>
          ))}
        </ul>
      )}
      {o.total ? <p className="mt-2 text-right font-bold text-[#7c43ba]">Total: {formatUSD(o.total)}</p> : null}
      {(o.note || (!o.items?.length && m.body)) && <p className="mt-2 text-xs p-2 rounded-lg bg-[#f6f1f8] whitespace-pre-wrap">{o.note || m.body}</p>}
      <div className="flex gap-1.5 mt-3 flex-wrap">
        {phone && <a href={waLink(phone, `Hola ${m.sender_name}, recibimos tu pedido 🛍️`)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-[#25D366] text-white text-xs font-bold flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> Responder</a>}
        {phone && <a href={`tel:${phone}`} className="px-3 py-2 rounded-xl btn-ghost text-xs font-bold flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Llamar</a>}
        <button type="button" onClick={() => navigator.clipboard.writeText(orderText(m)).then(() => toast('Pedido copiado ✓')).catch(() => toast('No se pudo copiar'))} className="px-3 py-2 rounded-xl btn-ghost text-xs font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar</button>
        {canDelete && <button type="button" onClick={async () => { if (!confirm('¿Borrar este pedido?')) return; try { await deleteMessage(m); } catch (e) { toast((e as Error).message); } }} className="ml-auto px-3 py-2 rounded-xl text-[#a43658] text-xs font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </article>
  );
}

export default function MessagesScreen() {
  const channel = useStore(s => s.chatChannel);
  const unread = useStore(s => s.unread);
  const team = useStore(s => s.team);
  const me = useStore(s => s.authUser?.id);
  const isAdmin = useStore(s => s.isAdmin());
  const storeId = useStore(s => s.activeStore?.store_id);
  const [list, setList] = useState<StoreMessage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'activos' | 'todos'>('activos');
  const bottom = useRef<HTMLDivElement>(null);
  const available = messagesAvailable();

  const load = useCallback(async (ch: Channel) => {
    if (!messagesAvailable()) return;
    setLoading(true);
    try { setList(await loadMessages(ch)); setError(''); markRead(ch).catch(() => {}); }
    catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);

  useEffect(() => { setList([]); load(channel); }, [channel, load, storeId]);
  // Al instante (Realtime) y, por si acaso, cada 30 segundos
  useEffect(() => {
    const off = onMessage((m, kind) => {
      if (m.channel && m.channel !== getState().chatChannel) return;
      setList(prev => kind === 'DELETE' ? prev.filter(x => x.id !== m.id)
        : prev.some(x => x.id === m.id) ? prev.map(x => (x.id === m.id ? { ...x, ...m } : x)) : [...prev, m]);
      if (kind === 'INSERT') markRead(getState().chatChannel).catch(() => {});
    });
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadMessages(getState().chatChannel).then(setList).catch(() => {}); }, 30000);
    return () => { off(); clearInterval(t); };
  }, []);
  useEffect(() => { if (channel === 'equipo') bottom.current?.scrollIntoView({ block: 'end' }); }, [list.length, channel]);

  const send = async (extra: File[] = []) => {
    const all = [...files, ...extra];
    if (!text.trim() && !all.length) return;
    setSending(true);
    try {
      const m = await sendMessage(channel, text, all);
      if (m) setList(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
      setText(''); setFiles([]);
    } catch (e) { toast((e as Error).message, 4500); }
    setSending(false);
  };
  const recorder = useRecorder(f => void send([f]));
  // Se copian los archivos YA (el input se vacía justo después)
  const addFiles = (fl: FileList | null) => { const picked = fl ? Array.from(fl) : []; if (picked.length) setFiles(prev => [...prev, ...picked].slice(0, 6)); };
  const photo = async () => { const f = await captureFromCamera({ title: 'Foto para el chat', guide: 'none' }); if (f) setFiles(prev => [...prev, f].slice(0, 6)); };

  const tab = (c: Channel, label: string) => (
    <button type="button" onClick={() => setState({ chatChannel: c })} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${channel === c ? 'bg-[#7c43ba] text-white' : 'bg-white text-[#756c7e] border border-[#e8dfec]'}`}>
      {label}{unread[c] > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#be416d] text-white text-[11px] grid place-items-center">{unread[c]}</span>}
    </button>
  );
  const orders = list.slice().reverse().filter(m => filter === 'todos' || !['entregado', 'cancelado'].includes(m.status));

  return (
    <section id="messages-screen" className="screen active">
      <header className="topbar">
        <div className="page-inner py-4 flex items-center gap-3">
          <TopbarMenuButton />
          <div><p className="uppercase tracking-[.16em] font-bold text-[11px] text-[#7c43ba]">Comunicación</p><h1 className="hero-title mt-0.5 text-xl sm:text-2xl">Mensajes</h1></div>
        </div>
      </header>
      <div className="page-inner pt-4 pb-40">
        <div className="flex gap-2 mb-4">{tab('equipo', '💬 Equipo')}{tab('pedidos', '🛍️ Pedidos')}</div>

        {!available && (
          <div className="rounded-2xl bg-white border border-dashed border-[#dacde2] p-6 text-center">
            <p className="text-4xl mb-2">💬</p>
            <p className="font-bold">Los mensajes funcionan con tu tienda en la nube</p>
            <p className="text-sm text-[#756c7e] mt-1">Así el dueño y su equipo se escriben, se mandan fotos, videos y audios, y reciben los pedidos de los clientes.</p>
            <button type="button" onClick={() => openAccount('Para usar los mensajes conéctate a tu tienda')} className="mt-4 px-5 py-2.5 rounded-xl btn-primary font-bold text-sm">Conectar a mi tienda</button>
          </div>
        )}
        {available && error && <p className="p-3 rounded-xl bg-[#fffbeb] border border-[#fde68a] text-sm text-[#92400e] mb-3">{error}</p>}
        {available && loading && !list.length && <p className="text-sm text-[#756c7e] text-center py-6">Cargando...</p>}

        {available && channel === 'equipo' && (
          <div id="chat-list" className="space-y-2.5">
            {!loading && !list.length && !error && <p className="text-sm text-[#756c7e] text-center py-8">Aún no hay mensajes. Escribe el primero 👋</p>}
            {list.map(m => {
              const mine = m.sender_uid === me;
              return (
                <div key={m.id} className={`chat-msg flex gap-2 ${mine ? 'justify-end' : ''}`}>
                  {!mine && <Avatar size={30} name={m.sender_name || '?'} url={m.sender_uid ? team[m.sender_uid]?.avatar : undefined} />}
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'bg-[#7c43ba] text-white rounded-br-md' : 'bg-white text-[#201728] rounded-bl-md'}`}>
                    {!mine && <p className="text-[11px] font-bold text-[#7c43ba]">{m.sender_name}</p>}
                    {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                    <Media m={m} />
                    <p className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/70' : 'text-[#9b90a6]'}`}>{time(m.created_at)}
                      {(mine || isAdmin) && <button type="button" onClick={async () => { if (!confirm('¿Borrar este mensaje?')) return; try { await deleteMessage(m); setList(p => p.filter(x => x.id !== m.id)); } catch (e) { toast((e as Error).message); } }} className="ml-2 underline opacity-70">borrar</button>}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>
        )}

        {available && channel === 'pedidos' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs text-[#756c7e] flex-1">Pedidos que los clientes envían desde tu catálogo público (sin WhatsApp).</p>
              <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="text-xs font-bold rounded-lg border border-[#e8dfec] px-2 py-1.5"><option value="activos">Pendientes</option><option value="todos">Todos</option></select>
            </div>
            <div id="orders-list" className="space-y-3">
              {orders.map(m => <OrderCard key={m.id} m={m} canDelete={isAdmin} />)}
              {!loading && !orders.length && !error && <p className="text-sm text-[#756c7e] text-center py-8">No hay pedidos {filter === 'activos' ? 'pendientes' : ''}. Comparte tu catálogo público para recibirlos aquí.</p>}
            </div>
          </>
        )}
      </div>

      {available && channel === 'equipo' && (
        <div className="chat-composer fixed z-30 left-0 right-0 lg:left-72 px-3">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl border border-[#ede7f0] p-2">
            {files.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {files.map((f, i) => (
                  <div key={i} className="relative flex-shrink-0">
                    {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-[#f6f1f8] grid place-items-center text-xl">{f.type.startsWith('video/') ? '🎬' : f.type.startsWith('audio/') ? '🎵' : '📎'}</div>}
                    <button type="button" onClick={() => setFiles(p => p.filter((_, k) => k !== i))} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#201728] text-white grid place-items-center"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
            {recorder.recording ? (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#dc2626] animate-pulse ml-2" />
                <span className="flex-1 text-sm font-bold">Grabando… {Math.floor(recorder.secs / 60)}:{String(recorder.secs % 60).padStart(2, '0')}</span>
                <button type="button" onClick={() => recorder.stop(true)} className="px-3 py-2 rounded-xl btn-ghost text-xs font-bold">Cancelar</button>
                <button type="button" onClick={() => recorder.stop()} className="px-3 py-2 rounded-xl btn-primary text-xs font-bold flex items-center gap-1"><Square className="w-3.5 h-3.5" /> Enviar audio</button>
              </div>
            ) : (
              <div className="flex items-end gap-1">
                <label className="w-10 h-10 rounded-full grid place-items-center text-[#756c7e] hover:bg-[#f6f1f8] cursor-pointer flex-shrink-0" title="Adjuntar foto, video o audio">
                  <Paperclip className="w-5 h-5" />
                  <input type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                </label>
                <button type="button" onClick={photo} className="w-10 h-10 rounded-full grid place-items-center text-[#756c7e] hover:bg-[#f6f1f8] flex-shrink-0" title="Tomar foto"><Camera className="w-5 h-5" /></button>
                <textarea id="chat-input" value={text} onChange={e => setText(e.target.value)} rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  className="flex-1 min-w-0 resize-none max-h-28 rounded-2xl bg-[#f6f1f8] px-3 py-2.5 text-sm outline-none" placeholder="Escribe un mensaje" />
                {text.trim() || files.length
                  ? <button type="button" id="chat-send" disabled={sending} onClick={() => void send()} className="w-10 h-10 rounded-full btn-primary grid place-items-center flex-shrink-0 disabled:opacity-50" aria-label="Enviar"><Send className="w-4 h-4" /></button>
                  : <button type="button" onClick={recorder.start} className="w-10 h-10 rounded-full btn-primary grid place-items-center flex-shrink-0" aria-label="Grabar audio" title="Nota de voz"><Mic className="w-5 h-5" /></button>}
              </div>
            )}
            {sending && <p className="text-[11px] text-[#756c7e] text-center mt-1">Enviando…</p>}
          </div>
        </div>
      )}
    </section>
  );
}
