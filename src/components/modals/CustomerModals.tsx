import { useEffect, useState } from 'react';
import { MessageCircle, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, getState, openModal, setState, toast, useStore } from '../../store';
import { DB } from '../../lib/db';
import { customerBalance } from '../../lib/selectors';
import { currency, formatUSD } from '../../lib/format';
import { businessName, openWhatsApp } from '../../lib/whatsapp';
import { SoundEffects } from '../../lib/sound';

export function openCustomer(id: string) { setState({ customerId: id }); openModal('customer-detail-modal'); }

export function openCustomerForm(id: string | null = null) { setState({ customerId: id }); openModal('customer-form-modal'); }

// ==========================================
// NUEVO / EDITAR CLIENTE
// ==========================================
export function CustomerFormModal() {
  const open = useStore(s => !!s.modals['customer-form-modal']);
  const id = useStore(s => s.customerId);
  const customers = useStore(s => s.customers);
  const [f, setF] = useState({ name: '', phone: '', notes: '' });
  const editing = id ? customers.find(c => c.id === id) : undefined;

  useEffect(() => { if (open) setF({ name: editing?.name || '', phone: editing?.phone || '', notes: editing?.notes || '' }); }, [open, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { toast('El nombre es obligatorio'); return; }
    const c = await DB.upsertCustomer({ id: editing?.id, ...f });
    closeModal('customer-form-modal');
    toast(editing ? 'Cliente actualizado ✓' : `Cliente "${c.name}" guardado ✓`);
    SoundEffects.play('success');
  };

  return (
    <Modal id="customer-form-modal" className="z-[60] bg-[#1e1427]/60">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2><CloseButton onClick={() => closeModal('customer-form-modal')} /></div>
        <form className="space-y-4" onSubmit={submit}>
          <div><label className="block font-bold text-sm mb-1.5">Nombre *</label><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required maxLength={80} className="w-full input-field rounded-xl p-3" placeholder="Ej: Juan Pérez" /></div>
          <div><label className="block font-bold text-sm mb-1.5">WhatsApp</label><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} type="tel" className="w-full input-field rounded-xl p-3" placeholder="Ej: 70000000" /></div>
          <div><label className="block font-bold text-sm mb-1.5">Notas</label><textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={2} maxLength={200} className="w-full input-field rounded-xl p-3" placeholder="Ej: paga los viernes" /></div>
          <button type="submit" className="w-full py-3 rounded-xl btn-primary font-bold">Guardar</button>
        </form>
      </article>
    </Modal>
  );
}

// ==========================================
// DETALLE DEL CLIENTE: saldo, movimientos, abonos
// ==========================================
export function CustomerDetailModal() {
  const id = useStore(s => s.customerId);
  const customers = useStore(s => s.customers);
  const movements = useStore(s => s.movements);
  const isAdmin = useStore(s => s.isAdmin());
  const c = customers.find(x => x.id === id);
  if (!c) return <Modal id="customer-detail-modal" className="z-[55] bg-[#1e1427]/60">{null}</Modal>;

  const list = movements.filter(m => m.customer_id === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const balance = customerBalance(movements, c.id);
  const move = (type: 'fiado' | 'abono') => { setState({ movementDraft: { customerId: c.id, type } }); openModal('movement-modal'); };

  const remind = () => {
    const text = `Hola ${c.name} 👋\nTe recordamos que tienes un saldo pendiente de *${formatUSD(balance)}* en ${businessName()}.\n¿Cuándo podrías pasar a cancelarlo? ¡Gracias!`;
    openWhatsApp(c.phone, text);
  };
  const remove = async () => {
    if (!confirm(`¿Eliminar a ${c.name} y todo su historial de fiados?${balance > 0 ? `\n\nOJO: aún debe ${formatUSD(balance)}.` : ''}`)) return;
    await DB.deleteCustomer(c.id);
    closeModal('customer-detail-modal');
    toast('Cliente eliminado');
  };

  return (
    <Modal id="customer-detail-modal" className="z-[55] bg-[#1e1427]/60">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="min-w-0"><h2 className="font-bold text-xl hero-title truncate">{c.name}</h2>{c.phone && <p className="text-sm text-[#756c7e]">{c.phone}</p>}{c.notes && <p className="text-xs text-[#756c7e] mt-1">{c.notes}</p>}</div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={() => openCustomerForm(c.id)} className="w-9 h-9 rounded-full bg-[#f1ecf4] grid place-items-center" aria-label="Editar"><Pencil className="w-4 h-4" /></button>
            <CloseButton onClick={() => closeModal('customer-detail-modal')} />
          </div>
        </div>
        <div className={`rounded-2xl p-4 text-center mb-4 ${balance > 0 ? 'bg-[#fff0f3] border border-[#f5d5dc]' : 'bg-[#f0fdf4] border border-[#bbf7d0]'}`}>
          <p className="text-xs uppercase tracking-wide font-bold text-[#756c7e]">{balance > 0 ? 'Debe' : balance < 0 ? 'Saldo a favor' : 'Sin deuda'}</p>
          <p className={`text-3xl font-bold mt-1 ${balance > 0 ? 'text-[#a43658]' : 'text-[#166534]'}`}>{formatUSD(Math.abs(balance))}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button type="button" onClick={() => move('abono')} className="py-3 rounded-xl btn-success font-bold text-sm flex items-center justify-center gap-1.5"><Wallet className="w-4 h-4" /> Registrar abono</button>
          <button type="button" onClick={() => move('fiado')} className="py-3 rounded-xl btn-ghost font-bold text-sm flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" /> Agregar deuda</button>
        </div>
        {balance > 0 && <button type="button" onClick={remind} className="w-full py-2.5 rounded-xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2 mb-2"><MessageCircle className="w-4 h-4" /> Recordar por WhatsApp</button>}
        <p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e] mt-4 mb-2">Movimientos</p>
        <div className="space-y-2">
          {list.length === 0 && <p className="text-sm text-[#756c7e] text-center py-4">Aún no hay movimientos</p>}
          {list.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#faf7fc]">
              <span className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold flex-shrink-0 ${m.type === 'fiado' ? 'bg-[#fff0f3] text-[#a43658]' : 'bg-[#dcfce7] text-[#166534]'}`}>{m.type === 'fiado' ? '+' : '−'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{m.type === 'fiado' ? 'Fiado' : `Abono${m.method ? ` (${m.method})` : ''}`}{m.note ? <span className="font-normal text-[#756c7e]"> · {m.note}</span> : null}</p>
                <p className="text-[11px] text-[#756c7e]">{new Date(m.date).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{m.seller_name ? ` · ${m.seller_name}` : ''}</p>
              </div>
              <p className={`font-bold text-sm ${m.type === 'fiado' ? 'text-[#a43658]' : 'text-[#166534]'}`}>{m.type === 'fiado' ? '+' : '−'}{formatUSD(m.amount)}</p>
              {isAdmin && <button type="button" aria-label="Borrar movimiento" onClick={() => { if (confirm('¿Borrar este movimiento?')) DB.deleteMovement(m.id); }} className="text-[#b8a8c8] hover:text-[#a43658]"><Trash2 className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
        {isAdmin && <button type="button" onClick={remove} className="w-full mt-4 py-2 rounded-xl text-xs font-bold text-[#a43658] hover:bg-[#fff0f3]">Eliminar cliente</button>}
      </article>
    </Modal>
  );
}

// ==========================================
// ABONO / DEUDA MANUAL
// ==========================================
export function MovementModal() {
  const open = useStore(s => !!s.modals['movement-modal']);
  const draft = useStore(s => s.movementDraft);
  const movements = useStore(s => s.movements);
  const customers = useStore(s => s.customers);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Efec.');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const c = draft ? customers.find(x => x.id === draft.customerId) : undefined;
  const balance = c ? customerBalance(movements, c.id) : 0;

  useEffect(() => {
    if (open && draft) { setAmount(draft.type === 'abono' && balance > 0 ? String(balance) : ''); setNote(''); setMethod('Efec.'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  if (!draft || !c) return <Modal id="movement-modal" className="z-[65] bg-[#1e1427]/70">{null}</Modal>;
  const abono = draft.type === 'abono';

  const save = async () => {
    const v = Number(amount);
    if (!(v > 0)) { toast('Ingresa un monto válido'); return; }
    if (busy) return;
    setBusy(true);
    await DB.addMovement({ customer_id: c.id, type: draft.type, amount: v, method: abono ? method : 'Fiado', note: note.trim() });
    setBusy(false);
    closeModal('movement-modal');
    toast(abono ? `Abono de ${formatUSD(v)} registrado ✓` : `Deuda de ${formatUSD(v)} agregada`);
    SoundEffects.play('success');
    if (abono && getState().isOnline) {
      const left = balance - v;
      if (c.phone && confirm(`¿Enviar comprobante por WhatsApp a ${c.name}?`)) {
        openWhatsApp(c.phone, `Hola ${c.name} 👋\nRecibimos tu abono de *${formatUSD(v)}* en ${businessName()}. ¡Gracias!\n${left > 0 ? `Saldo pendiente: *${formatUSD(left)}*` : '✅ Tu cuenta quedó al día.'}`);
      }
    }
  };

  return (
    <Modal id="movement-modal" className="z-[65] bg-[#1e1427]/70">
      <article className="modal-card w-full max-w-sm bg-white rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">{abono ? 'Registrar abono' : 'Agregar deuda'}</h2><CloseButton onClick={() => closeModal('movement-modal')} /></div>
        <p className="text-sm text-[#756c7e] mb-3">{c.name} · {balance > 0 ? `debe ${formatUSD(balance)}` : 'sin deuda'}</p>
        <label className="block text-xs font-bold mb-1">Monto ({currency()})</label>
        <input autoFocus type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full input-field rounded-xl p-3 text-lg font-bold mb-3" />
        {abono && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {['Efec.', 'QR'].map(m => <button key={m} type="button" onClick={() => setMethod(m)} className={`py-2 rounded-xl border-2 font-bold text-sm ${method === m ? 'border-[#7c43ba] bg-[#f6f1f8]' : 'border-[#e8dfec] text-[#756c7e]'}`}>{m}</button>)}
          </div>
        )}
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={80} className="w-full input-field rounded-xl p-3 text-sm mb-4" placeholder="Nota (opcional)" />
        <div className="flex gap-2">
          <button type="button" onClick={() => closeModal('movement-modal')} className="flex-1 py-3 rounded-xl btn-ghost font-bold">Cancelar</button>
          <button type="button" disabled={busy} onClick={save} className="flex-1 py-3 rounded-xl btn-success font-bold">Guardar</button>
        </div>
      </article>
    </Modal>
  );
}
