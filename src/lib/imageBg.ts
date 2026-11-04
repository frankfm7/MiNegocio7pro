import { useEffect, useState } from 'react';

// ==========================================
// COLOR DE FONDO DE UNA FOTO
// ==========================================
// Si las 4 esquinas de la foto tienen el mismo color (ej. fondo blanco o negro
// puesto con el editor), la tarjeta usa ese mismo color alrededor de la foto:
// así la imagen se ve "de borde a borde" y no se mezcla con el morado.

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function detect(src: string): Promise<string | null> {
  if (cache.has(src)) return Promise.resolve(cache.get(src)!);
  if (pending.has(src)) return pending.get(src)!;
  const job = new Promise<string | null>(resolve => {
    // Solo fotos guardadas en la app (las de otras páginas no se pueden leer)
    if (!/^data:image|^blob:/.test(src)) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const S = 24;
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data;
        const pts = [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1], [S >> 1, 0], [0, S >> 1], [S - 1, S >> 1], [S >> 1, S - 1], [1, 1], [S - 2, 1], [1, S - 2], [S - 2, S - 2]]
          .map(([x, y]) => { const i = (y * S + x) * 4; return [d[i], d[i + 1], d[i + 2]]; });
        const avg = [0, 1, 2].map(k => pts.reduce((a, p) => a + p[k], 0) / pts.length);
        const same = pts.every(p => Math.abs(p[0] - avg[0]) + Math.abs(p[1] - avg[1]) + Math.abs(p[2] - avg[2]) < 24);
        resolve(same ? `rgb(${avg.map(Math.round).join(',')})` : null);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  }).then(v => { cache.set(src, v); pending.delete(src); if (cache.size > 600) cache.delete(cache.keys().next().value as string); return v; });
  pending.set(src, job);
  return job;
}

/** Color liso del fondo de la foto, o null si no tiene un fondo parejo */
export function useImageBg(src: string | null | undefined): string | null {
  const [bg, setBg] = useState<string | null>(() => (src && cache.has(src) ? cache.get(src)! : null));
  useEffect(() => {
    if (!src) { setBg(null); return; }
    let live = true;
    detect(src).then(v => { if (live) setBg(v); });
    return () => { live = false; };
  }, [src]);
  return bg;
}
