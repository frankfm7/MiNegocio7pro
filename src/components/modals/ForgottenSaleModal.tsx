import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, setState, toast, useStore } from '../../store';
import { DB } from '../../lib/db';
import { searchProducts } from '../../lib/search';
import { formatContent, formatUSD } from '../../lib/format';
import { todayKey } from '../../lib/cashClose';
import NumField from '../NumField';
import type { Product } from '../../types';

const REASONS = ['Me olvidé de registrarla', 'No tenía internet / batería', 'La registré en papel', 'Venta por teléfono o WhatsApp'];

/**
 * Venta olvidada: se registra en el día en que realmente se hizo, con una observación
 * para que el vendedor pueda explicar al dueño por qué se agregó después.
 */
export default function ForgottenSaleModal() {
  const open = useStore(s => !!s.modals['forgotten-sale-modal']);
  const day = useStore(s => s.salesDay);
  const records = useStore(s => s.records);
  const user = useStore(s => s.currentUser);
  const [q, setQ] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [date, setDate] = useState(day);
  const [time, setTime] = useState('18:00');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [method, setMethod] = useState('Efec.');
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState('');
  const [stock, setStock] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ(''); setProduct(null); setDate(day); setQty(1); setPrice(0); setMethod('Efec.'); setReason(REASONS[0]); setDetail(''); setStock(true);
    const now = new Date();
    setTime(day === todayKey() ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : '18:00');
  }, [open, day]);

  const hits = useMemo(() => (q.trim() ? searchProducts(records, q).slice(0, 8) : []), [q, records]);
  const pick = (p: Product) => { setProduct(p); setPrice(Number(p.sale_price) || 0); setQ(''); };
  const close = () => closeModal('forgotten-sale-modal');

  const save = async (again: boolean) => {
    if (!product) { toast('Elige el producto que se vendió'); return; }
    if (!(qty > 0) || !(price > 0)) { toast('Revisa la cantidad y el precio'); return; }
    if (date > todayKey()) { toast('La fecha no puede ser futura'); return; }
    if (stock && Number(product.stock) < qty && !confirm(`"${product.name}" tiene ${product.stock} en stock. ¿Registrar igual?`)) return;
    const when = new Date(`${date}T${time || '12:00'}:00`);
    const stamp = new Date().toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const note = `Venta olvidada · registrada el ${stamp} por ${user?.name || 'alguien'} · ${reason}${detail.trim() ? ': ' + detail.trim() : ''}`;
    setBusy(true);
    try {
      await DB.addSale({
        product_id: product.id, product_name: product.name, brand: product.brand || '', catalog_id: product.catalog_id || '',
        cost_price: Number(product.cost_price), actual_price: price * qty, unit_price: price, profit: (price - Number(product.cost_price)) * qty, quantity: qty,
        payment_method: method, seller_id: user?.id || 'unknown', seller_name: user?.name || 'Desconocido',
        customer_id: null, customer_name: null, date: when.toISOString(), note, skip_stock: !stock,
      });
      toast(`✅ Venta olvidada agregada al ${when.toLocaleDateString('es', { day: 'numeric', month: 'long' })}`, 3500);
      setState({ salesDay: date });
      if (again) { setProduct(null); setQty(1); setPrice(0); setDetail(''); } else close();
    } catch (e) { toast('No se pudo registrar: ' + (e as Error).message, 4000); }
    setBusy(false);
  };

  const chip = (on: boolean) => `px-3 py-2 rounded-xl border-2 text-xs font-bold ${on ? 'border-[#7c43ba] bg-[#f6f1f8] text-[#7c43ba]' : 'border-[#e8dfec] text-[#756c7e]'}`;

  return (
    <Modal id="forgotten-sale-modal" className="z-[60] bg-[#1e1427]/60">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-1"><h2 className="font-bold text-xl hero-title">Venta olvidada</h2><CloseButton onClick={close} /></div>
        <p className="text-xs text-[#756c7e] mb-4">Se agrega al día en que realmente se vendió, con una <b>observación</b> para que el dueño sepa que se registró después.</p>

        <label className="block text-xs font-bold mb-1.5">Producto</label>
        {product ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#f6f1f8] mb-3">
            <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{product.name}</p><p className="text-[11px] text-[#756c7e]">{[product.brand, formatContent(product)].filter(Boolean).join(' · ')} · stock {product.stock} · {formatUSD(product.sale_price)}</p></div>
            <button type="button" onClick={() => setProduct(null)} className="text-xs font-bold text-[#7c43ba]">Cambiar</button>
          </div>
        ) : (
          <div className="mb-3">
            <label className="flex items-center gap-2 input-field rounded-xl px-3"><Search className="w-4 h-4 text-[#756c7e]" /><input id="forgotten-search" value={q} onChange={e => setQ(e.target.value)} className="flex-1 py-3 bg-transparent outline-none text-sm" placeholder="Busca por nombre, marca o código" autoComplete="off" /></label>
            {hits.length > 0 && (
              <div className="mt-1 rounded-xl border border-[#ede7f0] divide-y divide-[#f1ecf4] max-h-56 overflow-y-auto">
                {hits.map(p => <button key={p.id} type="button" onClick={() => pick(p)} className="forgotten-hit w-full text-left px-3 py-2 hover:bg-[#f6f1f8]"><p className="text-sm font-bold truncate">{p.name}</p><p className="text-[11px] text-[#756c7e]">{[p.brand, formatContent(p)].filter(Boolean).join(' · ')} · {formatUSD(p.sale_price)}</p></button>)}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div><label className="block text-xs font-bold mb-1.5">Día de la venta</label><input id="forgotten-date" type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value)} className="w-full input-field rounded-xl p-2.5 text-sm" /></div>
          <div><label className="block text-xs font-bold mb-1.5">Hora aprox.</label><input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full input-field rounded-xl p-2.5 text-sm" /></div>
          <div><label className="block text-xs font-bold mb-1.5">Cantidad</label><NumField label="Cantidad" step="1" value={qty} onValue={v => setQty(v ?? 1)} className="w-full input-field rounded-xl p-2.5 text-sm" /></div>
          <div><label className="block text-xs font-bold mb-1.5">Precio c/u</label><NumField label="Precio c/u" value={price} onValue={v => setPrice(v ?? 0)} className="w-full input-field rounded-xl p-2.5 text-sm" /></div>
        </div>
        <label className="block text-xs font-bold mb-1.5">Pago</label>
        <div className="flex gap-2 mb-3">{['Efec.', 'QR'].map(m => <button key={m} type="button" className={chip(method === m)} onClick={() => setMethod(m)}>{m === 'Efec.' ? '💵 Efectivo' : '📱 QR'}</button>)}</div>

        <label className="block text-xs font-bold mb-1.5">¿Por qué se registra después? (observación)</label>
        <select value={reason} onChange={e => setReason(e.target.value)} className="w-full input-field rounded-xl p-2.5 text-sm mb-2">{REASONS.map(r => <option key={r}>{r}</option>)}</select>
        <input id="forgotten-detail" value={detail} onChange={e => setDetail(e.target.value)} maxLength={120} className="w-full input-field rounded-xl p-2.5 text-sm mb-3" placeholder="Detalle opcional (ej. se la vendí a Rosa en la feria)" />

        <label className="flex items-start gap-2 text-sm mb-4"><input type="checkbox" checked={stock} onChange={e => setStock(e.target.checked)} className="accent-[#7c43ba] mt-1" /><span>Descontar del stock <span className="block text-[11px] text-[#756c7e]">Desmárcalo si el stock ya se corrigió a mano.</span></span></label>

        {product && <p className="text-sm font-bold text-center mb-2">Total: <span className="text-[#7c43ba]">{formatUSD(price * qty)}</span></p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => save(true)} className="py-3 rounded-xl btn-ghost font-bold text-sm">Guardar y otra</button>
          <button id="forgotten-save" type="button" disabled={busy} onClick={() => save(false)} className="py-3 rounded-xl btn-primary font-bold text-sm">{busy ? 'Guardando...' : 'Guardar venta'}</button>
        </div>
      </article>
    </Modal>
  );
}
