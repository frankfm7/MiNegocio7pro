import { useMemo, useState } from 'react';
import { Copy, ImageDown, MessageCircle } from 'lucide-react';
import { toast, useStore } from '../store';
import { formatUSD } from '../lib/format';
import { buildCashSummary, cashSummaryText, dateKeyOf, todayKey } from '../lib/cashClose';
import { openWhatsApp } from '../lib/whatsapp';
import { generateDailyCloseImage } from '../actions';
import { sellerOf } from '../lib/selectors';
import Avatar from '../components/Avatar';
import { TopbarMenuButton } from './CatalogsScreen';

const METHOD_ICON: Record<string, string> = { 'Efec.': '💵', QR: '📱', Fiado: '📒' };

export default function CashCloseScreen() {
  const sales = useStore(s => s.sales);
  const movements = useStore(s => s.movements);
  const team = useStore(s => s.team);
  const isAdmin = useStore(s => s.isAdmin());
  const whatsapp = useStore(s => s.contactInfo?.whatsapp);
  const [dateKey, setDateKey] = useState(todayKey());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sum = useMemo(() => buildCashSummary(dateKey), [dateKey, sales, movements]);
  const text = () => cashSummaryText(sum, isAdmin);

  const shift = (days: number) => { const d = new Date(dateKey + 'T12:00:00'); d.setDate(d.getDate() + days); setDateKey(dateKeyOf(d)); };
  const copy = async () => { try { await navigator.clipboard.writeText(text()); toast('Resumen copiado ✓'); } catch { toast('No se pudo copiar'); } };

  return (
    <section id="cash-close-screen" className="screen active">
      <header className="topbar">
        <div className="page-inner py-4 flex items-center gap-3">
          <TopbarMenuButton />
          <div><p className="uppercase tracking-[.16em] font-bold text-[11px] text-[#23805d]">Caja</p><h1 className="hero-title mt-0.5 text-xl sm:text-2xl">Cierre de caja</h1></div>
        </div>
      </header>
      <div className="page-inner pt-6 sm:pt-8">
        <div className="flex items-center gap-2 mb-5">
          <button type="button" onClick={() => shift(-1)} className="btn-ghost rounded-full w-10 h-10 font-bold" aria-label="Día anterior">‹</button>
          <input type="date" value={dateKey} max={todayKey()} onChange={e => e.target.value && setDateKey(e.target.value)} className="flex-1 input-field rounded-xl p-2.5 text-center font-bold" />
          <button type="button" disabled={dateKey >= todayKey()} onClick={() => shift(1)} className="btn-ghost rounded-full w-10 h-10 font-bold disabled:opacity-40" aria-label="Día siguiente">›</button>
        </div>
        <p className="text-sm text-[#756c7e] mb-4 first-letter:uppercase">{sum.label}</p>

        <section className="grid grid-cols-2 gap-3 mb-5">
          <article className="stat-card rounded-2xl p-4 border-l-4 border-l-[#23805d]"><p className="font-bold text-xl text-[#166534]">{formatUSD(sum.collected)}</p><p className="text-[11px] text-[#756c7e]">Total cobrado</p></article>
          <article className="stat-card rounded-2xl p-4 border-l-4 border-l-[#3875a5]"><p className="font-bold text-xl">{formatUSD(sum.cashExpected)}</p><p className="text-[11px] text-[#756c7e]">Efectivo esperado en caja</p></article>
          <article className="stat-card rounded-2xl p-4"><p className="font-bold text-xl">{formatUSD(sum.total)}</p><p className="text-[11px] text-[#756c7e]">Vendido ({sum.salesCount} ventas)</p></article>
          <article className="stat-card rounded-2xl p-4 sensitive-data"><p className="font-bold text-xl text-[#166534]">{formatUSD(sum.profit)}</p><p className="text-[11px] text-[#756c7e]">Ganancia</p></article>
        </section>

        <h2 className="font-bold text-lg mb-2 hero-title">Por método de pago</h2>
        <div className="space-y-2 mb-5">
          {sum.byMethod.map(m => (
            <div key={m.method} className="rounded-xl p-3 bg-white shadow-sm flex items-center gap-3">
              <span className="text-xl">{METHOD_ICON[m.method] || '•'}</span>
              <div className="flex-1"><p className="font-bold text-sm">{m.method === 'Fiado' ? 'Fiado (por cobrar)' : m.method}</p><p className="text-[11px] text-[#756c7e]">{m.count} {m.count === 1 ? 'venta' : 'ventas'}</p></div>
              <p className={`font-bold ${m.method === 'Fiado' ? 'text-[#a43658]' : 'text-[#7c43ba]'}`}>{formatUSD(m.total)}</p>
            </div>
          ))}
          {sum.abonoCount > 0 && (
            <div className="rounded-xl p-3 bg-[#f0fdf4] shadow-sm flex items-center gap-3">
              <span className="text-xl">💰</span>
              <div className="flex-1"><p className="font-bold text-sm">Abonos de fiados</p><p className="text-[11px] text-[#756c7e]">{sum.abonoCount} · efectivo {formatUSD(sum.abonoCash)} · QR {formatUSD(sum.abonoQr)}</p></div>
              <p className="font-bold text-[#166534]">{formatUSD(sum.abonoCash + sum.abonoQr)}</p>
            </div>
          )}
          {sum.byMethod.length === 0 && sum.abonoCount === 0 && <p className="text-sm text-[#756c7e] text-center py-6">Sin movimientos este día</p>}
        </div>

        {sum.bySeller.length > 0 && (
          <>
            <h2 className="font-bold text-lg mb-2 hero-title">Por vendedor</h2>
            <div className="space-y-2 mb-5">
              {sum.bySeller.map(v => {
                const person = sellerOf(team, { seller_uid: v.uid, seller_name: v.name } as never);
                return (
                  <div key={v.key} className="rounded-xl p-3 bg-white shadow-sm flex items-center gap-3">
                    <Avatar size={40} name={v.name} url={person.avatar} />
                    <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{v.name}</p><p className="text-[11px] text-[#756c7e]">{v.count} ventas · 💵 {formatUSD(v.cash)} · 📱 {formatUSD(v.qr)}{v.fiado ? ` · 📒 ${formatUSD(v.fiado)}` : ''}</p></div>
                    <p className="font-bold text-[#7c43ba]">{formatUSD(v.total)}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button type="button" onClick={() => openWhatsApp(whatsapp, text())} className="py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> Enviar por WhatsApp</button>
          <button type="button" onClick={copy} className="py-3 rounded-xl btn-ghost font-bold text-sm flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Copiar resumen</button>
          <button type="button" onClick={() => generateDailyCloseImage(dateKey)} className="py-3 rounded-xl btn-primary font-bold text-sm flex items-center justify-center gap-2"><ImageDown className="w-4 h-4" /> Imagen del cierre</button>
        </div>
        <p className="text-[11px] text-[#756c7e] mt-2">“Enviar por WhatsApp” usa el número de «Datos del negocio»; si no hay, WhatsApp te deja elegir el contacto.</p>
      </div>
    </section>
  );
}
