import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { setState, toast, useStore } from '../store';
import { DB } from '../lib/db';
import { customerBalance } from '../lib/selectors';
import { formatUSD } from '../lib/format';

export const PAY_METHODS = ['Efec.', 'QR', 'Fiado'];

/** Método de pago. Con "Fiado" pide el cliente al que se le anota la deuda */
export default function PaymentPicker() {
  const method = useStore(s => s.selectedPaymentMethod);
  const customers = useStore(s => s.customers);
  const movements = useStore(s => s.movements);
  const customerId = useStore(s => s.saleCustomerId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const btn = (m: string) => m === method
    ? 'pay-method-btn py-2 rounded-xl border-2 border-[#7c43ba] bg-[#f6f1f8] font-bold text-sm'
    : 'pay-method-btn py-2 rounded-xl border-2 border-[#e8dfec] text-[#756c7e] font-bold text-sm';

  const create = async () => {
    if (!name.trim()) { toast('Escribe el nombre del cliente'); return; }
    const c = await DB.upsertCustomer({ name, phone });
    setState({ saleCustomerId: c.id });
    setCreating(false); setName(''); setPhone('');
    toast(`Cliente "${c.name}" creado`);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {PAY_METHODS.map(m => <button key={m} type="button" className={btn(m)} onClick={() => setState({ selectedPaymentMethod: m })}>{m}</button>)}
      </div>
      {method === 'Fiado' && (
        <div className="mt-3 p-3 rounded-xl bg-[#fff7ed] border border-[#fed7aa]">
          <p className="text-xs font-bold text-[#9a3412] mb-2">¿A quién se le fía?</p>
          {!creating ? (
            <div className="flex gap-2">
              <select value={customerId} onChange={e => setState({ saleCustomerId: e.target.value })} className="flex-1 min-w-0 input-field rounded-lg p-2 text-sm">
                <option value="">Selecciona un cliente</option>
                {customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => {
                  const bal = customerBalance(movements, c.id);
                  return <option key={c.id} value={c.id}>{c.name}{bal > 0 ? ` · debe ${formatUSD(bal)}` : ''}</option>;
                })}
              </select>
              <button type="button" onClick={() => setCreating(true)} className="btn-ghost rounded-lg px-3 text-xs font-bold flex items-center gap-1 flex-shrink-0"><UserPlus className="w-4 h-4" /> Nuevo</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)} className="w-full input-field rounded-lg p-2 text-sm" placeholder="Nombre del cliente" />
              <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" className="w-full input-field rounded-lg p-2 text-sm" placeholder="WhatsApp (opcional)" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreating(false)} className="flex-1 btn-ghost rounded-lg py-2 text-xs font-bold">Cancelar</button>
                <button type="button" onClick={create} className="flex-1 btn-primary rounded-lg py-2 text-xs font-bold">Guardar cliente</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
