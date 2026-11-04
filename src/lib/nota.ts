// ==========================================
// NOTA DE VENTA: cálculo de descuentos
// ==========================================
// REGLA DE ORO: ningún descuento (por producto o global) puede dejar el precio final
// de un producto por debajo de su "costo mínimo de venta". Si se pide más, se aplica
// solo hasta el mínimo y se avisa.

export type DiscType = 'amount' | 'percent';

export interface NotaLine {
  id: string;          // id del producto
  name: string;
  qty: number;
  price: number;       // precio de venta (catálogo) por unidad
  floor: number;       // costo mínimo de venta por unidad (piso)
  stock: number;
  discType: DiscType;  // descuento de esta línea
  discValue: number;   // monto (sobre el total de la línea) o %
}

export interface NotaGlobal { type: DiscType; value: number }

export interface NotaRow extends NotaLine {
  subtotal: number;      // precio × cantidad
  itemDisc: number;      // descuento propio aplicado
  globalDisc: number;    // parte del descuento global aplicada
  total: number;         // total final de la línea
  unit: number;          // precio final por unidad
  floorTotal: number;    // mínimo permitido para la línea
  itemBlocked: boolean;  // el descuento propio pedido superaba el mínimo
  atFloor: boolean;      // quedó justo en el mínimo
}

export interface NotaResult {
  rows: NotaRow[];
  subtotal: number;
  discount: number;
  total: number;
  /** El descuento global pedido no entraba completo (se aplicó hasta el mínimo) */
  globalBlocked: boolean;
  /** Descuento global que realmente se pudo aplicar */
  globalApplied: number;
  /** Máximo descuento global posible (en dinero) */
  globalMax: number;
  warnings: string[];
}

const c = (n: number) => Math.round(n * 100) / 100;
/** Piso por unidad: el costo mínimo; si no tiene, el costo de factura; si tampoco, 0 */
export const floorOf = (p: { min_price?: number | null; cost_price?: number | null }) =>
  Number(p.min_price) > 0 ? Number(p.min_price) : Math.max(0, Number(p.cost_price) || 0);

export function computeNota(lines: NotaLine[], global: NotaGlobal): NotaResult {
  const warnings: string[] = [];
  // 1) Descuento de cada producto, limitado al mínimo
  const rows: NotaRow[] = lines.map(l => {
    const qty = Math.max(0, Math.floor(l.qty || 0));
    const subtotal = c(l.price * qty);
    // Si el precio de venta ya es menor que el mínimo, no se permite ningún descuento
    const floorTotal = c(Math.min(l.floor, l.price) * qty);
    const room = Math.max(0, c(subtotal - floorTotal));
    const v = Math.max(0, Number(l.discValue) || 0);
    const wanted = l.discType === 'percent' ? c(subtotal * Math.min(v, 100) / 100) : c(v);
    const itemDisc = Math.min(wanted, room);
    const itemBlocked = wanted > room + 0.004;
    if (itemBlocked) warnings.push(`${l.name}: el descuento se limitó para no bajar del costo mínimo (${l.floor.toFixed(2)} c/u).`);
    return { ...l, qty, subtotal, itemDisc, globalDisc: 0, total: c(subtotal - itemDisc), unit: 0, floorTotal, itemBlocked, atFloor: false };
  });

  // 2) Descuento global, repartido sin bajar del mínimo de ninguna línea
  const roomOf = (r: NotaRow) => Math.max(0, c(r.total - r.floorTotal));
  const globalMax = c(rows.reduce((a, r) => a + roomOf(r), 0));
  const afterItems = rows.reduce((a, r) => a + r.total, 0);
  const gv = Math.max(0, Number(global.value) || 0);
  let wantedGlobal = global.type === 'percent' ? c(afterItems * Math.min(gv, 100) / 100) : c(gv);
  const globalBlocked = wantedGlobal > globalMax + 0.004;
  if (globalBlocked) warnings.push(`El descuento global se limitó a ${globalMax.toFixed(2)} para no bajar del costo mínimo de ningún producto.`);
  wantedGlobal = Math.min(wantedGlobal, globalMax);
  let left = wantedGlobal;
  // Reparto proporcional al total de cada línea; lo que no entra se pasa a las que tienen margen
  for (let pass = 0; pass < 6 && left > 0.004; pass++) {
    const open = rows.filter(r => roomOf(r) > 0.004);
    const base = open.reduce((a, r) => a + r.total, 0);
    if (!open.length || base <= 0) break;
    let used = 0;
    for (const r of open) {
      const share = c(left * (r.total / base));
      const take = Math.min(share, roomOf(r));
      r.globalDisc = c(r.globalDisc + take);
      r.total = c(r.total - take);
      used = c(used + take);
    }
    left = c(left - used);
    if (used <= 0.004) break;
  }
  // Ajuste de centavos que quedaron por redondeo
  if (left > 0.004) for (const r of rows) { const t = Math.min(left, roomOf(r)); if (t > 0) { r.globalDisc = c(r.globalDisc + t); r.total = c(r.total - t); left = c(left - t); } }

  // 3) Precio final por unidad (nunca menor que el mínimo)
  for (const r of rows) {
    r.unit = r.qty ? c(r.total / r.qty) : 0;
    const minUnit = Math.min(r.floor, r.price);
    if (r.qty && r.unit < minUnit) r.unit = c(minUnit);
    r.total = c(r.unit * r.qty);   // la venta se registra con el precio por unidad
    r.atFloor = r.qty > 0 && r.unit <= c(minUnit) + 0.004 && (r.itemDisc + r.globalDisc) > 0;
  }
  const subtotal = c(rows.reduce((a, r) => a + r.subtotal, 0));
  const total = c(rows.reduce((a, r) => a + r.total, 0));
  return { rows, subtotal, discount: c(subtotal - total), total, globalBlocked, globalApplied: c(wantedGlobal - left), globalMax, warnings };
}

/** Comprobación final antes de vender: ninguna línea por debajo del mínimo */
export function violatesFloor(res: NotaResult): NotaRow | null {
  return res.rows.find(r => r.qty > 0 && r.unit + 0.004 < Math.min(r.floor, r.price)) || null;
}
