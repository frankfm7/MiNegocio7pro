import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Ban, Copy, Link2, Loader, MessageCircle, MoreVertical, Pencil, Shield, Ticket, Trash2, UserPlus, Users } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, openModal, toast, useStore } from '../../store';
import { createInvite, inviteLink, inviteMessage, listInvites, listMembers, removeMember, revokeInvite, roleLabel, updateMember } from '../../lib/session';
import type { Role, StoreInvite, StoreMember } from '../../types';

let selectedMember: StoreMember | null = null;
let reloadTeam: () => void = () => {};
let lastInvite: { code: string; role: Role } | null = null;

const ROLE_STYLE: Record<string, [string, string]> = {
  admin: ['👑', '#7c43ba'], coadmin: ['⭐', '#d97706'], supervisor: ['📊', '#3875a5'], vendedor: ['👤', '#23805d'],
};

const ago = (iso: string | null) => {
  if (!iso) return 'Nunca';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'Activo ahora';
  if (m < 60) return `Hace ${m} min`;
  if (m < 1440) return `Hace ${Math.round(m / 60)} h`;
  return new Date(iso).toLocaleDateString('es');
};

export function TeamModal() {
  const open = useStore(s => !!s.modals['team-modal']);
  const isOnline = useStore(s => s.isOnline);
  const me = useStore(s => s.authUser);
  const store = useStore(s => s.activeStore);
  const [filter, setFilter] = useState<'today' | 'all'>('all');
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [invites, setInvites] = useState<StoreInvite[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([listMembers(), listInvites()]);
      setMembers(m); setInvites(i);
    } catch (e) { toast((e as Error).message, 3500); }
    setLoading(false);
  }, []);
  useEffect(() => { reloadTeam = load; }, [load]);
  useEffect(() => {
    if (!open) return;
    if (!isOnline) { toast('⚠️ La gestión de equipo requiere conexión a internet'); closeModal('team-modal'); return; }
    load();
  }, [open, load, isOnline]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const shown = filter === 'today' ? members.filter(m => m.last_seen && new Date(m.last_seen) >= today) : members;
  const activeInvites = invites.filter(i => !i.revoked && i.uses < i.max_uses && (!i.expires_at || new Date(i.expires_at) > new Date()));
  const tab = (f: 'today' | 'all') => `px-4 py-2 rounded-xl text-sm font-bold ${filter === f ? 'bg-[#7c43ba] text-white' : 'bg-[#f1ecf4] text-[#7c43ba]'}`;

  return (
    <Modal id="team-modal">
      <article className="modal-card w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="font-bold text-xl hero-title">Equipo de {store?.store_name}</h2>
            <p className="text-xs text-[#756c7e] mt-1">Invita vendedores con un código. Solo ellos podrán ver los catálogos de esta tienda.</p>
          </div>
          <CloseButton onClick={() => closeModal('team-modal')} />
        </div>
        <button onClick={() => openModal('invite-modal')} className="w-full py-3 rounded-xl bg-[#23805d] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#1a634a] transition mb-5"><UserPlus className="w-4 h-4" /> Invitar a una persona</button>

        {activeInvites.length > 0 && (
          <div className="mb-5">
            <p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e] mb-2">Invitaciones activas</p>
            <div className="space-y-2">
              {activeInvites.map(i => (
                <div key={i.code} className="flex items-center gap-3 p-3 rounded-2xl bg-[#f6f1f8]">
                  <Ticket className="w-5 h-5 text-[#7c43ba] flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-bold text-sm tracking-wider">{i.code}</p>
                    <p className="text-[11px] text-[#756c7e]">{roleLabel(i.role)} · usado {i.uses}/{i.max_uses}{i.expires_at ? ` · vence ${new Date(i.expires_at).toLocaleDateString('es')}` : ''}</p>
                  </div>
                  <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage(i.code, i.role))}`, '_blank')} className="w-9 h-9 rounded-full bg-white grid place-items-center text-[#25D366]" title="Enviar por WhatsApp"><MessageCircle className="w-4 h-4" /></button>
                  <button onClick={async () => { if (!confirm('¿Anular este código?')) return; try { await revokeInvite(i.code); toast('Código anulado'); load(); } catch (e) { toast((e as Error).message); } }} className="w-9 h-9 rounded-full bg-white grid place-items-center text-[#a43658]" title="Anular"><Ban className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e]">Miembros ({members.length})</p>
          <div className="flex gap-2"><button onClick={() => setFilter('all')} className={tab('all')}>Todos</button><button onClick={() => setFilter('today')} className={tab('today')}>Hoy</button></div>
        </div>
        {loading && <p className="text-sm text-[#756c7e] flex items-center gap-2 py-4"><Loader className="w-4 h-4 animate-spin" /> Cargando...</p>}
        <div className="space-y-2">
          {shown.map(m => {
            const isMe = me?.id === m.user_id;
            const blocked = m.status === 'blocked';
            const [icon, color] = ROLE_STYLE[m.role] || ROLE_STYLE.vendedor;
            return (
              <div key={m.user_id} className={`rounded-2xl border-2 ${blocked ? 'border-[#a43658] opacity-60' : 'border-[#ede7f0]'} bg-white`}>
                <div className="flex items-center gap-3 p-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: color + '20' }}>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm truncate">{m.name || m.email}</p>
                      {isMe && <span className="text-[10px] bg-[#7c43ba] text-white px-2 py-0.5 rounded-full font-bold">Tú</span>}
                      {blocked && <span className="text-[10px] bg-[#a43658] text-white px-2 py-0.5 rounded-full font-bold">Bloqueado</span>}
                    </div>
                    <p className="text-[11px] text-[#756c7e] truncate">{m.email} · {roleLabel(m.role)} · {ago(m.last_seen)}</p>
                  </div>
                  {!isMe && <button onClick={() => { selectedMember = m; openModal('team-user-menu-modal'); }} className="w-9 h-9 rounded-full hover:bg-[#f1ecf4] grid place-items-center flex-shrink-0"><MoreVertical className="w-4 h-4" /></button>}
                </div>
              </div>
            );
          })}
        </div>
        {!loading && shown.length === 0 && (
          <div className="text-center py-8"><Users className="w-12 h-12 mx-auto text-[#d4c5e0] mb-3" /><p className="font-bold text-sm">Sin miembros</p><p className="text-xs text-[#756c7e] mt-1">{filter === 'today' ? 'Nadie se conectó hoy' : 'Invita a tu primer vendedor'}</p></div>
        )}
      </article>
    </Modal>
  );
}

export function InviteModal() {
  const open = useStore(s => !!s.modals['invite-modal']);
  const myRole = useStore(s => s.currentUser.role);
  const [role, setRole] = useState<Role>('vendedor');
  const [days, setDays] = useState(7);
  const [uses, setUses] = useState(1);
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setCode(null); setQr(''); setRole('vendedor'); setDays(7); setUses(1); } }, [open]);

  const generate = async () => {
    setBusy(true);
    try {
      const c = await createInvite(role, days, uses);
      lastInvite = { code: c, role };
      setCode(c);
      setQr(await QRCode.toDataURL(inviteLink(c), { width: 220, margin: 1 }));
      reloadTeam();
    } catch (e) { toast((e as Error).message, 3500); }
    setBusy(false);
  };
  const copy = (text: string, msg: string) => navigator.clipboard.writeText(text).then(() => toast(msg)).catch(() => toast('No se pudo copiar'));

  return (
    <Modal id="invite-modal" className="z-[60] bg-[#1e1427]/70" closeOnBackdrop={false}>
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Invitar al equipo</h2><CloseButton onClick={() => closeModal('invite-modal')} /></div>
        {!code ? (
          <div className="space-y-4">
            <div>
              <label className="block font-bold text-sm mb-1.5">Rol</label>
              <select value={role} onChange={e => setRole(e.target.value as Role)} className="w-full input-field rounded-xl p-3">
                <option value="vendedor">👤 Vendedor — vende, no ve costos ni edita</option>
                <option value="supervisor">📊 Supervisor — vende y ve informes</option>
                <option value="coadmin">⭐ Co-Administrador — gestiona productos y equipo</option>
                {myRole === 'admin' && <option value="admin">👑 Administrador</option>}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-bold text-sm mb-1.5">Vence en</label>
                <select value={days} onChange={e => setDays(Number(e.target.value))} className="w-full input-field rounded-xl p-3">
                  <option value={1}>1 día</option><option value={7}>7 días</option><option value={30}>30 días</option><option value={0}>No vence</option>
                </select>
              </div>
              <div><label className="block font-bold text-sm mb-1.5">Personas</label>
                <select value={uses} onChange={e => setUses(Number(e.target.value))} className="w-full input-field rounded-xl p-3">
                  <option value={1}>1 persona</option><option value={5}>Hasta 5</option><option value={20}>Hasta 20</option>
                </select>
              </div>
            </div>
            <button type="button" disabled={busy} onClick={generate} className="w-full py-3 rounded-xl btn-primary font-bold flex items-center justify-center gap-2">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />} Generar código
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xs text-[#756c7e] uppercase tracking-wide">Código de invitación</p>
            <p className="font-mono text-3xl font-bold tracking-widest text-[#7c43ba] my-2 break-all">{code}</p>
            {qr && <img src={qr} alt="QR de invitación" className="mx-auto w-44 h-44 rounded-xl border border-[#ede7f0]" />}
            <p className="text-xs text-[#756c7e] mt-2">La persona abre el enlace (o escanea el QR), crea su cuenta con su correo y queda unida a tu tienda como <b>{roleLabel(lastInvite?.role)}</b>.</p>
            <div className="grid grid-cols-1 gap-2 mt-4">
              <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage(code, role))}`, '_blank')} className="py-3 rounded-xl btn-whatsapp font-bold flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> Enviar por WhatsApp</button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => copy(code, 'Código copiado ✓')} className="py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Copiar código</button>
                <button type="button" onClick={() => copy(inviteLink(code), 'Enlace copiado ✓')} className="py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center justify-center gap-2"><Link2 className="w-4 h-4" /> Copiar enlace</button>
              </div>
            </div>
          </div>
        )}
      </article>
    </Modal>
  );
}

export function TeamUserMenuModal() {
  const open = useStore(s => !!s.modals['team-user-menu-modal']);
  const m = open ? selectedMember : null;
  const done = (msg: string) => { toast(msg); closeModal('team-user-menu-modal'); reloadTeam(); };
  const run = (fn: () => Promise<void>, msg: string) => async () => { try { await fn(); done(msg); } catch (e) { toast((e as Error).message, 3500); } };

  return (
    <Modal id="team-user-menu-modal" className="z-[60] bg-[#1e1427]/70">
      {m && (
        <article className="modal-card w-full max-w-sm bg-white rounded-3xl p-5">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Opciones del miembro</h3><CloseButton onClick={() => closeModal('team-user-menu-modal')} /></div>
          <div className="mb-4 p-3 rounded-xl bg-[#f6f1f8]"><p className="font-bold text-sm">{m.name}</p><p className="text-xs text-[#756c7e]">{m.email}</p><p className="text-xs text-[#756c7e] mt-1">Rol: {roleLabel(m.role)}</p></div>
          <div className="space-y-2">
            <button onClick={run(() => updateMember(m.user_id, { status: m.status === 'blocked' ? 'active' : 'blocked' }), m.status === 'blocked' ? 'Acceso restaurado' : 'Acceso bloqueado')} className="w-full py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center gap-2 justify-center"><Shield className="w-4 h-4" /> {m.status === 'blocked' ? 'Desbloquear acceso' : 'Bloquear acceso'}</button>
            <button onClick={() => { closeModal('team-user-menu-modal'); openModal('team-change-role-modal'); }} className="w-full py-2.5 rounded-xl btn-ghost font-bold text-sm flex items-center gap-2 justify-center"><Pencil className="w-4 h-4" /> Cambiar rol</button>
            <button onClick={async () => { if (!confirm(`¿Quitar a ${m.name} de la tienda?`)) return; await run(() => removeMember(m.user_id), 'Miembro quitado')(); }} className="w-full py-2.5 rounded-xl font-bold text-sm text-[#a43658] hover:bg-[#fff0f3] flex items-center gap-2 justify-center"><Trash2 className="w-4 h-4" /> Quitar de la tienda</button>
          </div>
          <p className="text-[11px] text-[#756c7e] mt-3">Si olvidó su contraseña, puede recuperarla con “¿Olvidaste tu contraseña?” al iniciar sesión.</p>
        </article>
      )}
    </Modal>
  );
}

export function TeamChangeRoleModal() {
  const open = useStore(s => !!s.modals['team-change-role-modal']);
  const myRole = useStore(s => s.currentUser.role);
  const m = open ? selectedMember : null;
  const [role, setRole] = useState<Role>('vendedor');
  useEffect(() => { if (m) setRole(m.role); }, [m]);

  const confirmRole = async () => {
    if (!m) return;
    try { await updateMember(m.user_id, { role }); toast('Rol actualizado'); closeModal('team-change-role-modal'); reloadTeam(); }
    catch (e) { toast((e as Error).message, 3500); }
  };

  return (
    <Modal id="team-change-role-modal" className="z-[70] bg-[#1e1427]/70" closeOnBackdrop={false}>
      {m && (
        <article className="modal-card w-full max-w-sm bg-white rounded-3xl p-5">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Cambiar rol</h3><CloseButton onClick={() => closeModal('team-change-role-modal')} /></div>
          <div className="mb-4 p-3 rounded-xl bg-[#f6f1f8]"><p className="font-bold text-sm">{m.name}</p></div>
          <select value={role} onChange={e => setRole(e.target.value as Role)} className="w-full input-field rounded-xl p-3 mb-4">
            {myRole === 'admin' && <option value="admin">👑 Administrador</option>}
            <option value="coadmin">⭐ Co-Administrador</option><option value="supervisor">📊 Supervisor</option><option value="vendedor">👤 Vendedor</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => closeModal('team-change-role-modal')} className="flex-1 py-2.5 rounded-xl btn-ghost font-bold text-sm">Cancelar</button>
            <button onClick={confirmRole} className="flex-1 py-2.5 rounded-xl btn-primary font-bold text-sm">Confirmar</button>
          </div>
        </article>
      )}
    </Modal>
  );
}
