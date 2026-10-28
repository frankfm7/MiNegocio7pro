import { fallback } from './constants';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Reduce la foto (lado mayor = maxSide) y la guarda como JPEG */
export async function compressImage(file: Blob, maxSide = 1200, quality = 0.82): Promise<string> {
  try {
    const img = await loadImage(await readFileAsBase64(file));
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return fallback;
  }
}

/**
 * Encuadre automático: si la foto tiene un fondo liso (pared, mesa, papel),
 * recorta los bordes vacíos y centra el producto en un lienzo 3:4.
 * Así un perfume alto y delgado ocupa todo el alto de la tarjeta.
 * Si el fondo no es liso, devuelve la imagen sin cambios.
 */
export async function autoFrameProduct(dataUrl: string, maxSide = 1200): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const W = 160, H = Math.max(1, Math.round((img.height / img.width) * 160));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const px = (x: number, y: number) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    // Color de fondo = promedio del borde
    const border: number[][] = [];
    for (let x = 0; x < W; x += 2) { border.push(px(x, 0), px(x, H - 1)); }
    for (let y = 0; y < H; y += 2) { border.push(px(0, y), px(W - 1, y)); }
    const bg = [0, 1, 2].map(k => border.reduce((a, p) => a + p[k], 0) / border.length);
    const dist = (p: number[]) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]);
    const noisyBorder = border.filter(p => dist(p) > 60).length / border.length;
    if (noisyBorder > 0.18) return dataUrl; // fondo con objetos: no tocar

    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (dist(px(x, y)) > 70) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX < 0) return dataUrl;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw * bh > W * H * 0.8 || bw < W * 0.05 || bh < H * 0.05) return dataUrl; // ya está encuadrado o no hay producto claro

    const k = img.width / W;
    const pad = 0.08;
    let cw = bw * k * (1 + pad * 2), ch = bh * k * (1 + pad * 2);
    // Lienzo 3:4 (vertical) o 4:3 si el producto es ancho
    const ratio = cw / ch < 1 ? 3 / 4 : 4 / 3;
    if (cw / ch < ratio) cw = ch * ratio; else ch = cw / ratio;
    const cx = (minX + bw / 2) * k, cy = (minY + bh / 2) * k;
    const scale = Math.min(1, maxSide / Math.max(cw, ch));
    const out = document.createElement('canvas');
    out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
    const o = out.getContext('2d')!;
    o.fillStyle = `rgb(${bg.map(Math.round).join(',')})`;
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(img, cx - cw / 2, cy - ch / 2, cw, ch, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.85);
  } catch {
    return dataUrl;
  }
}

export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    return true;
  } catch (e) {
    console.error('Error al descargar:', e);
    return false;
  }
}
