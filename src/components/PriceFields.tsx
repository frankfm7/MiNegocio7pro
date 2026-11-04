import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import NumField from './NumField';
import { formatUSD } from '../lib/format';

// ==========================================
// COSTOS Y PRECIOS DE UN PRODUCTO
// ==========================================
//  - Costo de factura      (cost_price): lo que te venden a ti.
//  - Costo mínimo de venta (min_price):  valor directo o % sobre el costo de factura.
//  - Precio de venta máx.  (sale_price): valor directo o % sobre el costo mínimo o la factura.
//    Es el precio que se muestra en el catálogo.
// Aviso si el precio de venta queda por debajo del costo mínimo.

export interface PriceValues { cost: number | null; min: number | null; sale: number | null }
type Base = 'min' | 'cost';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pctOf = (value: number | null, base: number | null) => (value != null && base ? r2(((value - base) / base) * 100) : null);

export default function PriceFields({ value, onChange, currency, compact = false, idPrefix = 'pf', costReadOnlyNote, saleLocked }: {
  value: PriceValues;
  onChange: (patch: Partial<PriceValues>) => void;
  currency: string;
  compact?: boolean;
  idPrefix?: string;
  costReadOnlyNote?: string;
  /** Texto a mostrar en lugar del campo de precio de venta (ej. producto existente: se mantiene) */
  saleLocked?: string;
}) {
  const [saleBase, setSaleBase] = useState<Base>('min');
  const { cost, min, sale } = value;
  const base = saleBase === 'min' ? (min || cost) : cost;
  const minPct = pctOf(min, cost);
  const salePct = pctOf(sale, base);
  const saleBelowMin = !saleLocked && sale != null && min != null && min > 0 && sale < min;
  const minBelowCost = min != null && cost != null && cost > 0 && min > 0 && min < cost;
  const input = `w-full input-field rounded-lg ${compact ? 'px-2 py-1 text-sm' : 'p-2'} text-[#201728]`;
  const pctInput = `w-16 input-field rounded-lg ${compact ? 'px-1.5 py-1 text-xs' : 'px-2 py-1.5 text-sm'} text-center`;
  const lbl = compact ? 'text-[10px] font-bold text-[#756c7e]' : 'block font-bold text-xs mb-1';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div>
        <label className={lbl} htmlFor={`${idPrefix}-cost`}>Costo de factura ({currency}) <span className="font-normal">· lo que te venden</span></label>
        <NumField value={cost} onValue={n => onChange({ cost: n })} label="Costo de factura" className={input} />
        {costReadOnlyNote && <p className="text-[10px] text-[#756c7e] mt-0.5">{costReadOnlyNote}</p>}
      </div>
      <div>
        <label className={lbl}>Costo mínimo de venta ({currency})</label>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><NumField value={min} onValue={n => onChange({ min: n })} label="Costo mínimo de venta" className={input} /></div>
          <span className="text-[11px] text-[#756c7e]">o</span>
          <NumField value={minPct} allowNegative suffix="%" label="Porcentaje sobre costo de factura"
            onValue={p => { if (p != null && cost) onChange({ min: r2(cost * (1 + p / 100)) }); }} className={pctInput} />
        </div>
        <p className="text-[10px] text-[#756c7e] mt-0.5">% sobre el costo de factura (ej. factura 10 + 5% = 10.50)</p>
      </div>
      {saleLocked ? (
        <div><p className={lbl}>Precio de venta máx.</p><p className="rounded-lg px-2 py-1 text-sm font-bold bg-[#f6f1f8] text-[#201728]">{saleLocked}</p></div>
      ) : <div>
        <label className={lbl}>Precio de venta máx. ({currency}) <span className="font-normal">· se muestra en el catálogo</span></label>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><NumField value={sale} onValue={n => onChange({ sale: n })} label="Precio de venta" className={`${input} font-bold ${saleBelowMin ? '!border-[#a43658] ring-2 ring-[#fecdd3]' : ''}`} /></div>
          <span className="text-[11px] text-[#756c7e]">o</span>
          <NumField value={salePct} allowNegative suffix="%" label="Porcentaje del precio de venta"
            onValue={p => { if (p != null && base) onChange({ sale: r2(base * (1 + p / 100)) }); }} className={pctInput} />
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#756c7e]">
          <span>% sobre el</span>
          <select value={saleBase} onChange={e => setSaleBase(e.target.value as Base)} className="input-field rounded-md px-1 py-0.5 text-[10px]" aria-label="Base del porcentaje">
            <option value="min">costo mínimo</option>
            <option value="cost">costo de factura</option>
          </select>
        </div>
      </div>}
      {saleBelowMin && (
        <p className="price-alert flex items-start gap-1.5 text-[11px] font-bold text-[#a43658] bg-[#fff0f3] rounded-lg p-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> El precio de venta ({formatUSD(sale)}) está por debajo del costo mínimo ({formatUSD(min)}).</p>
      )}
      {minBelowCost && (
        <p className="flex items-start gap-1.5 text-[11px] font-bold text-[#92400e] bg-[#fffbeb] rounded-lg p-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> El costo mínimo es menor que el costo de factura: venderías perdiendo.</p>
      )}
    </div>
  );
}
