import { useEffect, useState } from 'react';

/** Campo numérico que se puede borrar del todo mientras se escribe (no salta a 0) */
export default function NumField({ value, onValue, className = '', step = '0.01', allowNegative = false, label, suffix }: { value: number | null | undefined; onValue: (n: number | null) => void; className?: string; step?: string; allowNegative?: boolean; label?: string; suffix?: string }) {
  const [text, setText] = useState(value === null || value === undefined || Number.isNaN(value) ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' || text === '-' ? null : Number(text.replace(',', '.'));
    // Vacío mientras se escribe = 0 para el cálculo: no se vuelve a poner "0" en el campo
    if (parsed === null && (value === 0 || value === null || value === undefined)) return;
    if ((value ?? null) !== parsed) setText(value === null || value === undefined || Number.isNaN(value) ? '' : String(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className={`${suffix || /\bw-(20|24|16)\b/.test(className) ? 'inline-flex' : 'flex'} items-center gap-1`}>
      <input type="text" inputMode={allowNegative ? 'text' : 'decimal'} step={step} value={text} aria-label={label}
        onChange={e => {
          const t = e.target.value.replace(',', '.');
          if (!(allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/).test(t)) return;
          setText(t);
          onValue(t.trim() === '' || t === '-' || t === '.' ? null : Number(t));
        }}
        className={className} />
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

