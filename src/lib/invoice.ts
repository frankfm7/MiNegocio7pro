// ==========================================
// IMPORTAR DESDE FOTO DE FACTURA / RECIBO / DETALLE DE PEDIDO
// ==========================================
// 1. Se limpia la foto (sombras, líneas de la tabla) para leerla mejor.
// 2. Se lee el texto con OCR (funciona sin internet).
// 3. Se reconoce el formato:
//    - Belcorp (Ésika, L'Bel, Cyzone): "Detalle de pedido" en $ con total en Bs.
//    - Yanbal: factura en Bs con código, cantidad, precio unitario, descuento y subtotal.
//    - Cualquier otro: líneas con nombre y precio.
// 4. De cada producto se obtiene: código, nombre, marca, contenido, cantidad,
//    precio de catálogo y costo (lo que pagaste por unidad).

export interface InvoiceItem {
  code: string;
  name: string;
  brand: string;
  qty: number;
  /** Precio de catálogo por unidad */
  catalogUnit: number;
  /** Lo que se pagó por unidad (costo) */
  costUnit: number;
  /** Material de apoyo, flete, catálogos... (se desmarca por defecto) */
  isMaterial: boolean;
  /** Obsequio / premio (costo 0) */
  isGift: boolean;
  /** Los números no cuadran: conviene revisar */
  check: boolean;
}

export interface InvoiceResult {
  vendor: 'Belcorp' | 'Yanbal' | 'Factura';
  currency: string | null;
  /** Bs por 1 USD, si la factura trae ambos totales */
  rate: number | null;
  items: InvoiceItem[];
  totals: string[];
}

// ---------- utilidades de texto ----------
const MATERIAL_RE = /\b(CATALOGO|CATÁLOGO|REVISTA|FLYER|BOLETIN|BOLETÍN|CARTILLA|FLETE|ENVIO|ENVÍO|KIT INICIO|BOLSA|FOLLETO|MUESTRARIO)\b/i;
const GIFT_RE = /\b(DEMO|DEMOSTRADOR|PROB|PROBADOR|MUESTRA|TESTER|INICIO GANADOR)\b/i;

/** Arregla errores típicos del OCR en montos: "93 00" → "93.00", "25 00%" → quitado */
function cleanLine(line: string) {
  return line
    .replace(/[|\[\]{}“”"'`´~_*©®°»«¡!]/g, ' ')
    .replace(/\b\d{1,3}(?:[ .,]\d{1,2})?\s?%/g, ' ')        // porcentajes de descuento
    .replace(/\b(\d{2,4}) (\d{2})\b(?!\s*%)/g, '$1.$2')    // "93 00" → "93.00"
    .replace(/(\d),(\d{2})\b(?![\d,])/g, '$1.$2')          // "35,00" → "35.00"
    .replace(/(\d),(\d{3})/g, '$1$2')                      // "1,390.06" → "1390.06"
    .replace(/\s+/g, ' ')
    .trim();
}

const isNumTok = (t: string) => /^\d[\d.]*[):;,.]*$/.test(t);
/** Monto válido: entero o con 1-2 decimales (descarta basura como "106.2001") */
const isMoneyTok = (t: string) => isNumTok(t) && /^\d+(\.\d{1,3})?$/.test(t.replace(/[):;,]+$/, '').replace(/\.$/, ''));
const UNIT_WORD = /^(ML|G|GR|GRS|KG|L|LT|MG|OZ|CM|MM|M|U|UND|ML\.)$/i;

/** Monto con 2 decimales aunque el OCR se haya comido el punto: "1799" → 17.99 */
function money(t: string): number {
  const s = t.replace(/[^\d.]/g, '').replace(/^\.+|\.+$/g, '');
  if (!s) return NaN;
  if (s.includes('.')) {
    const parts = s.split('.');
    // "15.001" = "15.00|" (la raya de la tabla leída como 1) → 2 decimales
    const dec = parts.pop()!.slice(0, 2);
    return parseFloat(parts.join('') + '.' + dec);
  }
  return s.length >= 3 ? parseInt(s, 10) / 100 : parseInt(s, 10);
}

/** Cantidad: "1", "2", "1.00", "100" (=1.00), "400" (=4.00) */
function quantity(t: string): number {
  const s = t.replace(/[^\d.]/g, '');
  if (!s) return NaN;
  if (s.includes('.')) return Math.round(parseFloat(s));
  const n = parseInt(s, 10);
  if (s.length >= 3 && s.endsWith('00')) return Math.round(n / 100);
  return n;
}

const NAME_WORD = /^[A-ZÁÉÍÓÚÑÜ0-9][A-ZÁÉÍÓÚÑÜ0-9./&+-]*$/;
/** Deja solo palabras en MAYÚSCULAS (los nombres de las facturas vienen así; la basura del OCR suele ser minúscula) */
function upperWords(text: string): string[] {
  return text.split(/\s+/).map(w => w.replace(/^[^A-ZÁÉÍÓÚÑÜ0-9]+|[^A-ZÁÉÍÓÚÑÜ0-9.%]+$/g, ''))
    .filter(w => w.length >= 2 || /^[\dGLM]$/.test(w))
    .filter(w => NAME_WORD.test(w) && !/^\d{5,}$/.test(w));
}

/** "ES VANILLA SCENT EDP UPG 50 ML" → "Vanilla Scent EDP UPG 50 ml" */
export function prettyName(raw: string): string {
  const KEEP = new Set(['EDP', 'EDT', 'EDC', 'SPF', 'UPG', 'CC', 'BB', 'FPS', 'UV', 'DS', 'AH', 'BIF', 'II', 'III', 'XL', 'XXL', 'N2', '3N', 'LB', 'CY', 'ES', 'CZ']);
  return raw.split(/\s+/).filter(Boolean).map(w => {
    const u = w.toUpperCase();
    if (/^(ML|G|GR|KG|L|LT|MG|OZ|CM|MM)$/.test(u)) return u === 'L' || u === 'LT' ? 'L' : u.toLowerCase();
    if (KEEP.has(u) || /\d/.test(u)) return u;
    return u.charAt(0) + u.slice(1).toLowerCase();
  }).join(' ').replace(/\s+/g, ' ').trim();
}

/** Marca según el prefijo de Belcorp: ES = Ésika, LB = L'Bel, CZ/CY = Cyzone */
function belcorpBrand(words: string[]): { brand: string; rest: string[] } {
  const p = (words[0] || '').toUpperCase();
  if (/^(ES|E5|FS|E8)$/.test(p)) return { brand: 'Ésika', rest: words.slice(1) };
  if (/^(LB|LE|L8|LBEL)$/.test(p)) return { brand: "L'Bel", rest: words.slice(1) };
  if (/^(CZ|C2|CY|CZY)$/.test(p)) return { brand: 'Cyzone', rest: words.slice(1) };
  return { brand: '', rest: words };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Belcorp: "DETALLE DE PEDIDO" ----------
function parseBelcorp(lines: string[]): InvoiceItem[] {
  const out: InvoiceItem[] = [];
  let pendingName: { code: string; words: string[] } | null = null;
  // Las columnas cambian: "Catálogos" usa precio unitario de catálogo; desde "Revista y Ofertas"
  // aparece la columna "Valorizado precio catálogo"
  let mode: 'catalog' | 'revista' = 'catalog';
  for (const raw of lines) {
    if (/VALORIZADO|REVISTA Y OFERTAS|PARA TI|PROGRAMA DE NUEVAS|INCENTIVOS|MATERIAL DE APOYO/i.test(raw)) mode = 'revista';
    if (/SUB\s*-?\s*TOTAL|TOTAL GENERAL|C[OÓ]DIGO|PRODUCTO\s+CANTIDAD|OBSERVACIONES|CANTIDAD\s+PRECIO/i.test(raw)) { pendingName = null; continue; }
    const line = cleanLine(raw);
    const toks = line.split(' ');
    // Código al inicio (4 a 6 dígitos)
    let code = '';
    let i = 0;
    while (i < toks.length && !/[A-Za-zÁÉÍÓÚÑ]/.test(toks[i]) && !(/^\d{4,6}$/.test(toks[i]))) i++;
    if (/^\d{4,6}$/.test(toks[i] || '')) { code = toks[i]; i++; }
    // Nombre hasta la cantidad: primer número que tiene al menos 3 números después
    const rest = toks.slice(i);
    let q = -1;
    for (let k = 0; k < rest.length; k++) {
      if (isNumTok(rest[k]) && /^\d{1,2}$/.test(rest[k].replace(/\D/g, '')) && isNumTok(rest[k + 1] || '') && !UNIT_WORD.test(rest[k + 1] || '')
        && rest.slice(k + 1).filter(isMoneyTok).length >= 3) { q = k; break; }
    }
    if (q < 0) {
      // Línea solo con código y nombre (en "Revista y ofertas" los números van en la línea siguiente)
      // quitar solo los números del final (ahorro), no el "50" de "50 ML"
      const r2 = [...rest];
      while (r2.length && isNumTok(r2[r2.length - 1])) r2.pop();
      const words = upperWords(r2.join(' '));
      pendingName = code && words.length >= 2 ? { code, words } : null;
      continue;
    }
    const nameWords = upperWords(rest.slice(0, q).join(' '));
    const nums = rest.slice(q + 1).filter(isMoneyTok).map(money).filter(n => !isNaN(n));
    const qty = quantity(rest[q]) || 1;
    // Si la línea anterior tenía el nombre limpio (negrita), usamos ese
    const useWords = pendingName && (nameWords.length < 2 || pendingName.words.length >= nameWords.length - 1) ? pendingName.words : nameWords;
    const useCode = pendingName?.code || code;
    pendingName = null;
    if (useWords.length === 0) continue;

    let catalogTotal: number, paid: number;
    if (mode === 'revista') {
      // Precio para ti, compra total, valorizado (precio de catálogo), monto a pagar, ahorro
      catalogTotal = nums[2] > 0 ? nums[2] : nums[1];
      paid = nums.length >= 4 ? nums[3] : nums[nums.length - 1];
    } else {
      // Precio unitario catálogo, compra total, monto a pagar, ahorro
      catalogTotal = nums[1] || nums[0] * qty;
      paid = nums.length >= 3 ? nums[2] : nums[nums.length - 1];
    }
    if (paid > catalogTotal && nums.length >= 3) paid = Math.min(...nums.slice(1).filter(n => n > 0));
    const { brand, rest: nameRest } = belcorpBrand(useWords);
    const name = nameRest.join(' ');
    const catalogUnit = round2(catalogTotal / qty);
    const costUnit = round2(paid / qty);
    out.push({
      code: useCode, name: prettyName(name), brand, qty,
      catalogUnit, costUnit,
      isMaterial: MATERIAL_RE.test(name), isGift: (costUnit === 0 || GIFT_RE.test(name)) && !MATERIAL_RE.test(name),
      check: costUnit > catalogUnit * 1.05 || catalogUnit === 0 || (costUnit > 0 && costUnit < catalogUnit * 0.2),
    });
  }
  return out;
}

/**
 * Asigna precio unitario, descuento y subtotal usando la cuenta de la factura:
 * precio × cantidad − descuento = subtotal. Sirve aunque el OCR desordene los números
 * o la cantidad esté mal leída.
 */
function solveRow(nums: number[], qtyGuess: number): { unit: number; disc: number; subtotal: number; qty: number; ok: boolean } {
  const vals = [...new Set(nums.slice(-6))];
  let best: { unit: number; disc: number; subtotal: number; qty: number; err: number } | null = null;
  for (const u of vals) {
    if (u <= 0) continue;
    for (const d of [0, ...vals]) {
      for (const st of vals) {
        // "precio = subtotal sin descuento" solo vale si no hay otros números
        if (st === u && (d !== 0 || vals.length > 1)) continue;
        const qRaw = (st + d) / u;
        const q = Math.round(qRaw);
        if (q < 1 || q > 99) continue;
        const err = Math.abs(u * q - d - st);
        if (err > Math.max(0.06, st * 0.01)) continue;
        // Preferir la cantidad leída, el precio más alto y usar los 3 números
        const score = err + (q === qtyGuess ? 0 : 0.5) + (d === 0 && vals.length >= 3 ? 0.3 : 0) - u * 1e-6;
        if (!best || score < best.err) best = { unit: u, disc: d, subtotal: st, qty: q, err: score };
      }
    }
  }
  if (best) return { unit: best.unit, disc: best.disc, subtotal: best.subtotal, qty: best.qty, ok: true };
  // Falta un número: precio = el mayor, descuento = el siguiente (se marca para revisar)
  if (vals.length === 2) {
    const [a, b] = [Math.max(...vals), Math.min(...vals)];
    return { unit: a, disc: b, subtotal: round2(a * qtyGuess - b), qty: qtyGuess, ok: false };
  }
  const [unit, disc, subtotal] = nums.length >= 3 ? nums.slice(-3) : nums.length === 2 ? [nums[0], 0, nums[1]] : [nums[0] ?? 0, 0, nums[0] ?? 0];
  return { unit, disc, subtotal, qty: qtyGuess, ok: false };
}

// ---------- Yanbal: factura con código "5109-20014207" ----------
const YANBAL_CODE = /(?:^|\s)\D{0,2}?(\d{2,6})(?:(?:-{1,2}|[.\s])?(\d{8})\b|-(\d{4,7})\b)/;
function parseYanbal(lines: string[]): InvoiceItem[] {
  const blocks: { code: string; text: string[] }[] = [];
  for (const raw of lines) {
    if (/SUBTOTAL\s*Bs|^\s*TOTAL\s*Bs|MONTO A PAGAR|IMPORTE BASE|DESCUENTO\s*Bs|^Son:/i.test(raw)) { blocks.push({ code: '', text: [] }); continue; }
    const m = YANBAL_CODE.exec(raw.replace(/^[^\d]{0,3}/, ' '));
    const compactDigits = /^\W*(\d{10,14})\b/.exec(raw);
    if (m && m.index < 6) {
      blocks.push({ code: `${m[1]}-${m[2] || m[3]}`, text: [raw.slice(m.index + m[0].length)] });
    } else if (compactDigits) {
      const d = compactDigits[1];
      blocks.push({ code: `${d.slice(0, d.length - 8)}-${d.slice(-8)}`, text: [raw.slice(compactDigits[0].length)] });
    } else if (blocks.length && blocks[blocks.length - 1].code) {
      blocks[blocks.length - 1].text.push(raw);
    }
  }
  const out: InvoiceItem[] = [];
  for (const b of blocks) {
    if (!b.code) continue;
    const joined = cleanLine(b.text.join(' '));
    const toks = joined.split(' ');
    // Cantidad: primer número antes de "UNIDAD" (o el primero de la fila)
    const unitIdx = toks.findIndex(t => /UNIDAD|BIENES|SERVICIOS/i.test(t));
    // "1.00", "4.00", "100" (= 1.00) o "2"; no "273" (resto de un código mal leído)
    const qtyTok = toks.slice(0, unitIdx > 0 ? unitIdx : 3).find(t => isNumTok(t) && /^(\d{1,2}|\d[.]\d{2}|\d{1,2}00)$/.test(t.replace(/[^\d.]/g, '')));
    const qtyRead = (qtyTok && quantity(qtyTok)) || 1;
    const nums = toks.filter((t, idx) => isMoneyTok(t) && t !== qtyTok && !(idx < 2 && /^\d{1,2}$/.test(t)) && /[.]|\d{3,}/.test(t)
      && !/^20[1-4]\d$/.test(t.replace(/\D/g, '')))    // años del nombre ("C12 2026")
      .map(money).filter(n => !isNaN(n));
    const { unit, disc, subtotal, qty, ok } = solveRow(nums, qtyRead);
    const words = upperWords(toks.filter(t => !isNumTok(t)).join(' '))
      .filter(w => !/^(UNIDAD|UNIDA|NDAD|SERVICIOS|BENS|BENTOS|INAS)$/i.test(w) && !/IENES\)?$/i.test(w));
    // Basura corta del OCR al inicio del nombre (ej. "DS CT")
    while (words.length > 1 && words[0].length <= 2 && !/\d/.test(words[0])) words.shift();
    // Quitar repeticiones (el OCR a veces lee dos veces el nombre)
    const dedup: string[] = [];
    for (const w of words) if (!dedup.includes(w) || /^\d+$/.test(w)) dedup.push(w);
    const name = dedup.join(' ');
    if (!name) continue;
    const costUnit = round2((ok ? subtotal : unit * qty - disc) / qty);
    out.push({
      code: b.code, name: prettyName(name), brand: 'Yanbal', qty,
      catalogUnit: round2(unit), costUnit: costUnit < 0 ? 0 : costUnit,
      isMaterial: MATERIAL_RE.test(name), isGift: (unit <= 0.01 || GIFT_RE.test(name)) && !MATERIAL_RE.test(name),
      check: !ok,
    });
  }
  return out;
}

/** Tipo de cambio a partir de "TOTAL GENERAL ($)" y "TOTAL GENERAL (Bs)" */
function detectRate(lines: string[]): number | null {
  const usd = lines.find(l => /TOTAL\s+GENERAL\s*\(\s*\$/i.test(l));
  const bs = lines.find(l => /TOTAL\s+GENERAL\s*\(\s*Bs/i.test(l));
  if (!usd || !bs) return null;
  const nums = (l: string) => cleanLine(l.replace(/^.*?\)\s*:?/, '')).split(' ').filter(isNumTok).map(money).filter(n => n > 0);
  const a = nums(usd), b = nums(bs);
  const ratios: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const r = b[b.length - 1 - i] / a[a.length - 1 - i];
    if (r > 3 && r < 20) ratios.push(r);
  }
  if (!ratios.length) return null;
  ratios.sort((x, y) => x - y);
  return round2(ratios[Math.floor(ratios.length / 2)]);
}

export function parseInvoiceText(text: string): InvoiceResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const all = lines.join('\n');
  const totals = lines.filter(l => /TOTAL|MONTO A PAGAR/i.test(l)).map(l => l.replace(/\s{2,}/g, ' '));
  const belcorp = /DETALLE DE PEDIDO|TOTAL GENERAL|PRECIO UNITARIO\s*CAT|REVISTA Y OFERTAS|BELCORP|PROGRAMA DE NUEVAS/i.test(all)
    || lines.filter(l => /^\W*\d{4,6}\s+(ES|LB|CZ|CY|C2)\s/i.test(l)).length >= 2;
  const yanbal = !belcorp && (/UNIDAD\s*\(?\s*BIENES|YANBAL|CR[EÉ]DITO FISCAL/i.test(all) || lines.filter(l => YANBAL_CODE.test(l)).length >= 2);
  if (belcorp) {
    return { vendor: 'Belcorp', currency: /\(\s*\$\s*\)|US\$|D[OÓ]LAR/i.test(all) ? 'USD' : (/Bs/i.test(all) ? 'Bs' : null), rate: detectRate(lines), items: parseBelcorp(lines), totals };
  }
  if (yanbal) {
    return { vendor: 'Yanbal', currency: /\bBs\b|Bolivianos/i.test(all) ? 'Bs' : null, rate: null, items: parseYanbal(lines), totals };
  }
  return { vendor: 'Factura', currency: /\bBs\b|Bolivianos/i.test(all) ? 'Bs' : /\$|USD/i.test(all) ? 'USD' : null, rate: null, items: [], totals };
}

// ---------- Limpieza de la foto antes del OCR ----------
/**
 * Escala de grises, umbral adaptativo (quita sombras de la foto) y borrado de
 * las líneas largas de la tabla, que confunden al lector.
 */
export async function prepareInvoiceImage(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url; });
    const scale = Math.min(3, Math.max(1, 2400 / img.width));
    const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H);
    const d = px.data;
    const gray = new Float32Array(W * H);
    for (let i = 0, p = 0; p < W * H; p++, i += 4) gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Imagen integral para la media local
    const ii = new Float64Array((W + 1) * (H + 1));
    for (let y = 1; y <= H; y++) {
      let row = 0;
      for (let x = 1; x <= W; x++) { row += gray[(y - 1) * W + (x - 1)]; ii[y * (W + 1) + x] = ii[(y - 1) * (W + 1) + x] + row; }
    }
    const R = 25;
    const dark = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
        const sum = ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0];
        const mean = sum / ((y1 - y0) * (x1 - x0));
        dark[y * W + x] = gray[y * W + x] < mean * 0.85 ? 1 : 0;
      }
    }
    // Líneas largas horizontales (≥12% del ancho) y verticales (≥6% del alto)
    const line = new Uint8Array(W * H);
    const minH = Math.round(W * 0.12), minV = Math.round(H * 0.06);
    for (let y = 0; y < H; y++) {
      let start = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && dark[y * W + x];
        if (on && start < 0) start = x;
        if (!on && start >= 0) { if (x - start >= minH) for (let k = start; k < x; k++) line[y * W + k] = 1; start = -1; }
      }
    }
    for (let x = 0; x < W; x++) {
      let start = -1;
      for (let y = 0; y <= H; y++) {
        const on = y < H && dark[y * W + x];
        if (on && start < 0) start = y;
        if (!on && start >= 0) { if (y - start >= minV) for (let k = start; k < y; k++) line[k * W + x] = 1; start = -1; }
      }
    }
    for (let y = 0, p = 0; y < H; y++) {
      for (let x = 0; x < W; x++, p++) {
        let isLine = false;
        for (let dy = -1; dy <= 1 && !isLine; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W && line[yy * W + xx]) { isLine = true; break; }
        }
        const v = dark[p] && !isLine ? 0 : 255;
        d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v; d[p * 4 + 3] = 255;
      }
    }
    ctx.putImageData(px, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}
