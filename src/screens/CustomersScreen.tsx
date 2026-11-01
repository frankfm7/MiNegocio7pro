import { useMemo, useState } from 'react';
import { Search, UserPlus, Users } from 'lucide-react';
import { useStore } from '../store';
import { customerBalance } from '../lib/selectors';
import { formatUSD } from '../lib/format';
import { TopbarMenuButton } from './CatalogsScreen';
import { openCustomer, openCustomerForm } from '../components/modals/CustomerModals';

export default function CustomersScreen() {
  const customers = useStore(s => s.customers);
  const movements = useStore(s => s.movements);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers
      .map(c => ({ c, balance: customerBalance(movements, c.id) }))
      .filter(r => !term || r.c.name.toLowerCase().includes(term) || r.c.phone.includes(term))
      .sort((a, b) => b.balance - a.balance || a.c.name.localeCompare(b.c.name));
  }, [customers, movements, q]);
  const owed = customers.reduce((a, c) => a + Math.max(0, customerBalance(movements, c.id)), 0);
  const debtors = customers.filter(c => customerBalance(movements, c.id) > 0).length;

  return (
    <section id="customers-screen" className="screen active">
      <header className="topbar">
        <div className="page-inner py-4 flex items-center gap-3">
          <TopbarMenuButton />
          <div className="flex-1 min-w-0"><p className="uppercase tracking-[.16em] font-bold text-[11px] text-[#a43658]">Libreta</p><h1 className="hero-title mt-0.5 text-xl sm:text-2xl">Clientes y fiados</h1></div>
          <button type="button" onClick={() => openCustomerForm()} className="login-pill"><UserPlus className="w-4 h-4" /> Nuevo</button>
        </div>
      </header>
      <div className="page-inner pt-6 sm:pt-8">
        <section className="grid grid-cols-2 gap-3 mb-5">
          <article className="stat-card rounded-2xl p-4 border-l-4 border-l-[#a43658]"><p className="font-bold text-xl text-[#a43658]">{formatUSD(owed)}</p><p className="text-[11px] text-[#756c7e]">Por cobrar</p></article>
          <article className="stat-card rounded-2xl p-4"><p className="font-bold text-xl">{debtors}</p><p className="text-[11px] text-[#756c7e]">Clientes con deuda</p></article>
        </section>
        <label className="search rounded-full h-11 flex items-center gap-2 px-4 mb-4">
          <Search className="w-4 h-4 text-[#7c7384]" />
          <input value={q} onChange={e => setQ(e.target.value)} className="bg-transparent outline-none min-w-0 flex-1 text-sm" placeholder="Buscar cliente..." />
        </label>
        <div className="space-y-2">
          {rows.map(({ c, balance }) => (
            <button key={c.id} type="button" onClick={() => openCustomer(c.id)} className="w-full text-left sale-row rounded-xl p-3 flex items-center gap-3 shadow-sm bg-white">
              <span className="avatar" style={{ width: 40, height: 40, fontSize: 16 }}>{c.name.charAt(0).toUpperCase()}</span>
              <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{c.name}</p><p className="text-xs text-[#756c7e] truncate">{c.phone || 'Sin teléfono'}</p></div>
              <p className={`font-bold text-sm flex-shrink-0 ${balance > 0 ? 'text-[#a43658]' : 'text-[#166534]'}`}>{balance > 0 ? formatUSD(balance) : 'Al día'}</p>
            </button>
          ))}
        </div>
        {customers.length === 0 && (
          <div className="text-center rounded-3xl bg-white border border-dashed border-[#dacde2] px-6 py-12">
            <Users className="w-8 h-8 mx-auto text-[#7c43ba] mb-3" /><h3 className="font-bold">Sin clientes aún</h3>
            <p className="mt-2 text-sm text-[#756c7e]">Agrega a tus clientes para anotar sus fiados y abonos. También puedes crearlos al vender con pago “Fiado”.</p>
          </div>
        )}
      </div>
    </section>
  );
}
