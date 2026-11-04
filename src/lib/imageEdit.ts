// ==========================================
// EDITOR DE FOTOS DE PRODUCTO (procesamiento)
// ==========================================
// Todo se hace en el dispositivo, sin internet:
//  - girar / espejo
//  - luz y color (niveles automáticos, brillo, contraste, saturación, nitidez)
//  - quitar el fondo (relleno desde los bordes por color) + pincel para corregir
//  - poner fondo blanco, negro o de color, con sombra suave opcional
//  - encuadre: proporción, zoom y posición

export type Aspect = '3:4' | '1:1' | '4:3';
export interface EditState {
  rotate: 0 | 90 | 180 | 270;
  flipX: boolean;
  auto: boolean;
  brightness: number;   // -100..100
  contrast: number;     // -100..100
  saturation: number;   // -100..100
  sharpen: number;      // 0..100
  removeBg: boolean;
  tolerance: number;    // 5..90
  bg: string;           // 'original' o color '#rrggbb'
  shadow: boolean;
  aspect: Aspect;
  zoom: number;         // 1 = el producto entra completo
  offX: number;         // desplazamiento, en fracción del ancho del marco
  offY: number;
}

export const DEFAULT_EDIT: EditState = {
  rotate: 0, flipX: false, auto: false, brightness: 0, contrast: 0, saturation: 0, sharpen: 0,
  removeBg: false, tolerance: 32, bg: 'original', shadow: false, aspect: '3:4', zoom: 1, offX: 0, offY: 0,
};

export const ASPECTS: Record<Aspect, number> = { '3:4': 3 / 4, '1:1': 1, '4:3': 4 / 3 };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Imagen de trabajo (lado mayor ≤ max) ya girada y en espejo */
export function makeBase(img: HTMLImageElement, rotate: number, flipX: boolean, max = 1000): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const swap = rotate === 90 || rotate === 270;
  const c = document.createElement('canvas');
  c.width = swap ? h : w; c.height = swap ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

/** Percentiles 1% y 99% del brillo (para "auto-mejorar") */
export function levelsOf(data: ImageData): [number, number] {
  const hist = new Uint32Array(256);
  const d = data.data;
  for (let i = 0; i < d.length; i += 16) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
  const total = hist.reduce((a, b) => a + b, 0);
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  if (hi - lo < 40) return [0, 255];
  return [lo, hi];
}

/** Aplica luz y color a una copia de los píxeles */
export function adjust(src: ImageData, st: EditState, levels: [number, number]): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const [lo, hi] = st.auto ? levels : [0, 255];
  const lv = 255 / Math.max(1, hi - lo);
  const b = st.brightness * 1.2 + (st.auto ? 4 : 0);
  const c = st.contrast >= 0 ? 1 + st.contrast / 60 : 1 + st.contrast / 120;
  const sat = 1 + (st.saturation + (st.auto ? 6 : 0)) / 100;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = ((v - lo) * lv - 128) * c + 128 + b;
  const plain = !st.auto && st.brightness === 0 && st.contrast === 0 && sat === 1;
  if (!plain) {
    for (let i = 0; i < d.length; i += 4) {
      let r = lut[d[i]], g = lut[d[i + 1]], bl = lut[d[i + 2]];
      if (sat !== 1) {
        const l = 0.299 * r + 0.587 * g + 0.114 * bl;
        r = l + (r - l) * sat; g = l + (g - l) * sat; bl = l + (bl - l) * sat;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = bl;
    }
  }
  if (st.sharpen > 0) sharpenInPlace(out, st.sharpen / 100);
  return out;
}

function sharpenInPlace(img: ImageData, amount: number) {
  const { width: W, height: H, data: d } = img;
  const src = new Uint8ClampedArray(d);
  const k = amount * 1.2;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = src[i + ch];
        const blur = (src[i + ch - 4] + src[i + ch + 4] + src[i + ch - W * 4] + src[i + ch + W * 4]) / 4;
        d[i + ch] = v + (v - blur) * k;
      }
    }
  }
}

/** Colores representativos del borde (el fondo), agrupados en hasta 4 tonos */
function borderColors(data: ImageData): number[][] {
  const { width: W, height: H, data: d } = data;
  const samples: number[][] = [];
  const step = Math.max(1, Math.round((W + H) / 300));
  const add = (x: number, y: number) => { const i = (y * W + x) * 4; samples.push([d[i], d[i + 1], d[i + 2]]); };
  for (let x = 0; x < W; x += step) { add(x, 0); add(x, 1); add(x, H - 1); add(x, H - 2); }
  for (let y = 0; y < H; y += step) { add(0, y); add(1, y); add(W - 1, y); add(W - 2, y); }
  // k-means simple con 4 centros
  let centers = [0, 0.25, 0.5, 0.75].map(f => samples[Math.floor(f * samples.length)].slice());
  for (let it = 0; it < 6; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of samples) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, k) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = k; } });
      sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; sum[bi][3]++;
    }
    centers = sum.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[k]));
  }
  return centers;
}

/** Color promedio del borde (para rellenar con el fondo "original") */
export function averageBorder(data: ImageData): string {
  const { width: W, height: H, data: d } = data;
  let r = 0, g = 0, b = 0, n = 0;
  const add = (x: number, y: number) => { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; };
  for (let x = 0; x < W; x += 3) { add(x, 0); add(x, H - 1); }
  for (let y = 0; y < H; y += 3) { add(0, y); add(W - 1, y); }
  const h = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Máscara automática del producto: 255 = producto, 0 = fondo.
 * Se "inunda" desde los bordes todo lo que se parece a los colores del fondo
 * y no cruza un borde marcado (cambio brusco de color).
 */
export function autoMask(data: ImageData, tolerance: number): Uint8Array {
  const { width: W, height: H, data: d } = data;
  const N = W * H;
  const centers = borderColors(data);
  const t2 = (tolerance * 2.2) ** 2;
  const edge2 = (tolerance * 1.1) ** 2;
  const isBgColor = (p: number) => {
    const i = p * 4;
    for (const c of centers) if ((d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2 < t2) return true;
    return false;
  };
  const near = (a: number, b: number) => {
    const i = a * 4, j = b * 4;
    return (d[i] - d[j]) ** 2 + (d[i + 1] - d[j + 1]) ** 2 + (d[i + 2] - d[j + 2]) ** 2 < edge2;
  };
  const bg = new Uint8Array(N);
  const stack = new Int32Array(N);
  let top = 0;
  const seed = (p: number) => { if (!bg[p] && isBgColor(p)) { bg[p] = 1; stack[top++] = p; } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (top > 0) {
    const p = stack[--top];
    const x = p % W, y = (p - x) / W;
    const tryP = (q: number) => { if (!bg[q] && near(p, q) && isBgColor(q)) { bg[q] = 1; stack[top++] = q; } };
    if (x > 0) tryP(p - 1);
    if (x < W - 1) tryP(p + 1);
    if (y > 0) tryP(p - W);
    if (y < H - 1) tryP(p + W);
  }
  const mask = new Uint8Array(N);
  for (let p = 0; p < N; p++) mask[p] = bg[p] ? 0 : 255;
  removeSpecks(mask, W, H);
  return mask;
}

/** Quita puntitos sueltos (ruido) que no son parte del producto */
function removeSpecks(mask: Uint8Array, W: number, H: number) {
  const N = W * H;
  const label = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = sizes.length;
    let top = 0, count = 0;
    stack[top++] = s; label[s] = id;
    while (top) {
      const p = stack[--top]; count++;
      const x = p % W;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
      for (const q of nb) if (q >= 0 && q < N && mask[q] && label[q] < 0) { label[q] = id; stack[top++] = q; }
    }
    sizes.push(count);
  }
  if (!sizes.length) return;
  const biggest = Math.max(...sizes);
  const min = Math.max(30, biggest * 0.02);
  for (let p = 0; p < N; p++) if (mask[p] && sizes[label[p]] < min) mask[p] = 0;
}

/** Adelgaza 1 px el producto: quita el "halo" de color del fondo viejo en el borde */
function erode(mask: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (mask[p] && (!mask[p - 1] || !mask[p + 1] || !mask[p - W] || !mask[p + W])) out[p] = 0;
    }
  }
  return out;
}

/** Borde suave (1-2 px) para que el recorte no se vea dentado */
export function feather(input: Uint8Array, W: number, H: number): Uint8Array {
  const mask = erode(input, W, H);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; s += mask[yy * W + xx]; n++; }
      }
      out[y * W + x] = s / n;
    }
  }
  return out;
}

/** Caja que ocupa el producto dentro de la máscara */
export function maskBox(mask: Uint8Array, W: number, H: number): { x: number; y: number; w: number; h: number } | null {
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask[y * W + x] > 127) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  if (w * h > W * H * 0.97 || w < W * 0.04 || h < H * 0.04) return null;
  return { x: minX, y: minY, w, h };
}

/** Lienzo con la foto ajustada y (si se pidió) el fondo transparente */
export function cutout(adjusted: ImageData, alpha: Uint8Array | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = adjusted.width; c.height = adjusted.height;
  const img = alpha ? new ImageData(new Uint8ClampedArray(adjusted.data), adjusted.width, adjusted.height) : adjusted;
  if (alpha) for (let p = 0, i = 3; p < alpha.length; p++, i += 4) img.data[i] = alpha[p];
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

/** Medidas del producto dentro del marco: centro y escala */
export function placement(iw: number, ih: number, FW: number, FH: number, st: EditState) {
  const fit = Math.min((FW * 0.92) / iw, (FH * 0.92) / ih);
  const s = fit * st.zoom;
  return { s, cx: FW / 2 + st.offX * FW, cy: FH / 2 + st.offY * FH };
}

/** Dibuja la composición final en un lienzo del tamaño del marco */
export function compose(ctx: CanvasRenderingContext2D, FW: number, FH: number, cut: HTMLCanvasElement, st: EditState, originalBg: string) {
  const fill = st.bg === 'original' ? originalBg : st.bg;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, FW, FH);
  const { s, cx, cy } = placement(cut.width, cut.height, FW, FH, st);
  const w = cut.width * s, h = cut.height * s;
  if (st.shadow && st.removeBg) {
    // sombra suave bajo el producto
    ctx.save();
    const dark = isDark(fill);
    ctx.shadowColor = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = Math.max(8, Math.min(FW, FH) * 0.035);
    ctx.shadowOffsetY = Math.min(FW, FH) * 0.015;
    ctx.drawImage(cut, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cut, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

export function isDark(hex: string): boolean {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}
