import { useEffect, useMemo, useState } from 'react';
import { Copy, ImageDown, MessageCircle } from 'lucide-react';
import { setState, toast, useStore } from '../store';
import { formatUSD } from '../lib/format';
import { buildCashSummary, cashSummaryText, dateKeyOf, todayKey } from '../lib/cashClose';
import { openWhatsApp } from '../lib/whatsapp';
import { closeNumber, generateDailyCloseImage } from '../actions';
import { localDocs } from '../lib/documents';
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
  const dateKey = useStore(s => s.salesDay);
  const setDateKey = (k: string) => setState({ salesDay: k > todayKey() ? todayKey() : k });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sum = useMemo(() => buildCashSummary(dateKey), [dateKey, sales, movements]);
  const [number, setNumber] = useState('');
  useEffect(() => { setNumber(''); localDocs().then(list => setNumber(list.find(d => d.kind === 'cierre' && d.ref === dateKey)?.code || '')); }, [dateKey]);
  /** Numera el cierre del día (si ya tiene número, lo reutiliza) */
  const ensureNumber = async () => { const n = await closeNumber(dateKey); if (n) setNumber(n); return n; };
  const text = (n = number) => cashSummaryText(sum, isAdmin, n);

  const shift = (days: number) => { const d = new Date(dateKey + 'T12:00:00'); d.setDate(d.getDate() + days); setDateKey(dateKeyOf(d)); };
  /** Si el cierre aún no tiene número, primero se asigna y se muestra (se envía al tocar otra vez) */
  const numberFirst = async () => {
    if (number) return number;
    const n = await ensureNumber();
    if (n) toast(`🧾 Cierre N° ${n} asignado. Revísalo y toca otra vez para enviarlo o copiarlo.`, 4500);
    return n ? '' : 'sin-numero';
  };
  const copy = async () => { const n = await numberFirst(); if (!n) return; try { await navigator.clipboard.writeText(text(n === 'sin-numero' ? '' : n)); toast('Resumen copiado ✓'); } catch { toast('No se pudo copiar'); } };
  const sendWhatsApp = async () => { const n = await numberFirst(); if (!n) return; openWhatsApp(whatsapp, text(n === 'sin-numero' ? '' : n)); };

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
        <p className="text-sm text-[#756c7e] mb-3 first-letter:uppercase">{sum.label}</p>
        <div className="mb-4 p-3 rounded-2xl bg-[#f6f1f8] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[.15em] font-bold text-[#756c7e]">N° de cierre</p>
            {number ? <p id="close-number" className="font-mono font-black text-lg text-[#201728]">{number}</p> : <p className="text-sm text-[#756c7e]">Aún sin número</p>}
          </div>
          {!number && <button type="button" onClick={() => void ensureNumber()} className="px-3 py-2 rounded-xl btn-primary text-xs font-bold">Asignar número</button>}
        </div>

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
          <button type="button" onClick={sendWhatsApp} className="py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> Enviar por WhatsApp</button>
          <button type="button" onClick={copy} className="py-3 rounded-xl btn-ghost font-bold text-sm flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Copiar resumen</button>
          <button type="button" onClick={async () => { await generateDailyCloseImage(dateKey); localDocs().then(list => setNumber(list.find(d => d.kind === 'cierre' && d.ref === dateKey)?.code || number)); }} className="py-3 rounded-xl btn-primary font-bold text-sm flex items-center justify-center gap-2"><ImageDown className="w-4 h-4" /> Imagen del cierre</button>
        </div>
        <p className="text-[11px] text-[#756c7e] mt-2">“Enviar por WhatsApp” usa el número de «Datos de la tienda»; si no hay, WhatsApp te deja elegir el contacto.</p>
      </div>
    </section>
  );
}
