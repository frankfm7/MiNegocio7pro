// ==========================================
// QUITAR FONDO CON IA (en el celular, sin internet una vez descargado)
// ==========================================
// Modelo U²-Net-p (4.5 MB, licencia Apache 2.0): detecta el objeto principal de la
// foto (el producto) aunque el fondo tenga colores o sombras. Corre con onnxruntime-web
// (WebAssembly). Los archivos están en /public/ai y se guardan en el celular la primera vez.

import type { InferenceSession } from 'onnxruntime-web';

const SIZE = 320;
let session: Promise<InferenceSession> | null = null;

async function getSession(): Promise<InferenceSession> {
  if (!session) {
    session = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = '/ai/';
      ort.env.wasm.numThreads = 1;      // sin hilos: funciona en cualquier celular
      ort.env.wasm.proxy = false;
      return ort.InferenceSession.create('/ai/u2netp.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })();
    session.catch(() => { session = null; });
  }
  return session;
}

/** Descarga y prepara el modelo (para avisar al usuario mientras tanto) */
export function preloadAI() { return getSession(); }

/**
 * Máscara del producto (0 = fondo, 255 = producto) del mismo tamaño que la imagen.
 * Bordes suaves: se mantienen los valores intermedios del modelo.
 */
/** Convierte la probabilidad en transparencia. cut 0-100: más alto = recorte más estricto */
export function applyCut(prob: Uint8Array, cut: number): Uint8Array {
  const lo = 0.02 + (cut / 100) * 0.5, hi = lo + 0.3;
  const out = new Uint8Array(prob.length);
  for (let p = 0; p < prob.length; p++) {
    const t = Math.min(1, Math.max(0, (prob[p] / 255 - lo) / (hi - lo)));
    out[p] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return out;
}

export async function aiMask(data: ImageData): Promise<Uint8Array> {
  const ort = await import('onnxruntime-web/wasm');
  const s = await getSession();
  const { width: W, height: H } = data;
  // 1) Imagen 320×320 normalizada (como al entrenar el modelo)
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  src.getContext('2d')!.putImageData(data, 0, 0);
  const small = document.createElement('canvas'); small.width = SIZE; small.height = SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;
  let max = 1;
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const input = new Float32Array(3 * SIZE * SIZE);
  for (let p = 0, i = 0; p < SIZE * SIZE; p++, i += 4) {
    for (let ch = 0; ch < 3; ch++) input[ch * SIZE * SIZE + p] = (px[i + ch] / max - mean[ch]) / std[ch];
  }
  // 2) Modelo
  const feeds: Record<string, InstanceType<typeof ort.Tensor>> = { [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) };
  const out = await s.run(feeds);
  const pred = out[s.outputNames[0]].data as Float32Array;
  let lo = Infinity, hi = -Infinity;
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = hi - lo || 1;
  // 3) Máscara chica → tamaño de la foto (suavizado)
  const m = document.createElement('canvas'); m.width = SIZE; m.height = SIZE;
  const mctx = m.getContext('2d')!;
  const mi = mctx.createImageData(SIZE, SIZE);
  for (let p = 0; p < SIZE * SIZE; p++) { const v = Math.round(((pred[p] - lo) / range) * 255); mi.data[p * 4] = mi.data[p * 4 + 1] = mi.data[p * 4 + 2] = v; mi.data[p * 4 + 3] = 255; }
  mctx.putImageData(mi, 0, 0);
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  const bctx = big.getContext('2d', { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(m, 0, 0, W, H);
  const bd = bctx.getImageData(0, 0, W, H).data;
  // 4) Se devuelve la probabilidad (0-255); el editor decide dónde cortar (control "Recorte")
  const alpha = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = bd[p * 4];
  return alpha;
}
