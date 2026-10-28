import { toast } from '../store';

export interface CaptureOptions {
  filename?: string;
  title?: string;
  hint?: string;
  /** Marco guía: 'portrait' (3:4, ideal para perfumes y botellas), 'square' o 'none' */
  guide?: 'portrait' | 'square' | 'none';
  /** Recortar la foto al marco guía */
  cropToGuide?: boolean;
  /** Texto del botón principal */
  actionLabel?: string;
}

const ICON_X = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_SWITCH = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-3.5L15 5H9L7.5 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z"/><path d="M9 13a3 3 0 0 1 5.2-2"/><path d="M15 13a3 3 0 0 1-5.2 2"/><path d="m14.5 9 .2 2-2-.2"/><path d="m9.5 17-.2-2 2 .2"/></svg>';
const ICON_TORCH = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v5l-3 4v11H9V11L6 7Z"/><path d="M12 13v3"/></svg>';

/**
 * Cámara a pantalla completa con un marco guía y botones que no se tapan:
 * barra superior (título + cerrar) y barra inferior (Cancelar · Disparador · Girar cámara).
 * Devuelve la foto (recortada al marco si se pide) o null.
 */
export async function captureFromCamera(opts: CaptureOptions | string = {}): Promise<File | null> {
  const o: CaptureOptions = typeof opts === 'string' ? { filename: opts } : opts;
  const guide = o.guide ?? 'portrait';
  const crop = o.cropToGuide ?? guide !== 'none';
  if (!navigator.mediaDevices?.getUserMedia) { toast('Este navegador no permite usar la cámara'); return null; }

  let facing: 'environment' | 'user' = 'environment';
  let stream: MediaStream;
  const open = (mode: typeof facing) => navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
  });
  try {
    stream = await open(facing);
  } catch (err) {
    console.error('Error accediendo a la cámara:', err);
    toast('No se pudo acceder a la cámara. Verifica los permisos.');
    return null;
  }

  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'cam-overlay';
    root.innerHTML = `
      <div class="cam-top">
        <p class="cam-title">${o.title || 'Tomar foto'}</p>
        <button type="button" class="cam-round cam-close" aria-label="Cerrar">${ICON_X}</button>
      </div>
      <div class="cam-stage">
        <video playsinline autoplay muted></video>
        ${guide !== 'none' ? `<div class="cam-guide cam-guide-${guide}"><span></span><span></span><span></span><span></span></div>` : ''}
        <p class="cam-hint">${o.hint || (guide === 'portrait' ? 'Centra el producto en el marco. Para perfumes y botellas acércate hasta que ocupe todo el alto.' : 'Centra el producto en el marco')}</p>
      </div>
      <div class="cam-bottom">
        <button type="button" class="cam-pill cam-cancel">Cancelar</button>
        <button type="button" class="cam-shutter" aria-label="${o.actionLabel || 'Tomar foto'}"><span></span></button>
        <div class="cam-side">
          <button type="button" class="cam-round cam-torch" aria-label="Linterna" hidden>${ICON_TORCH}</button>
          <button type="button" class="cam-round cam-switch" aria-label="Cambiar cámara">${ICON_SWITCH}</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    const video = root.querySelector('video')!;
    const guideEl = root.querySelector<HTMLElement>('.cam-guide');
    const torchBtn = root.querySelector<HTMLButtonElement>('.cam-torch')!;
    let torchOn = false;

    const attach = (s: MediaStream) => {
      stream = s;
      video.srcObject = s;
      video.classList.toggle('mirror', facing === 'user');
      const track = s.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() || {}) as { torch?: boolean };
      torchBtn.hidden = !caps.torch;
    };
    attach(stream);

    const cleanup = (file: File | null) => {
      stream.getTracks().forEach(t => t.stop());
      root.remove();
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      resolve(file);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup(null); };
    window.addEventListener('keydown', onKey);

    root.querySelector<HTMLButtonElement>('.cam-close')!.onclick = () => cleanup(null);
    root.querySelector<HTMLButtonElement>('.cam-cancel')!.onclick = () => cleanup(null);
    root.querySelector<HTMLButtonElement>('.cam-switch')!.onclick = async () => {
      facing = facing === 'environment' ? 'user' : 'environment';
      stream.getTracks().forEach(t => t.stop());
      try { attach(await open(facing)); } catch { toast('No se pudo cambiar de cámara'); }
    };
    torchBtn.onclick = async () => {
      torchOn = !torchOn;
      try {
        await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] });
        torchBtn.classList.toggle('on', torchOn);
      } catch { toast('Linterna no disponible'); }
    };

    root.querySelector<HTMLButtonElement>('.cam-shutter')!.onclick = () => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      // Zona visible del video (object-fit: cover) y del marco guía en coordenadas del video
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (crop && guideEl) {
        const vr = video.getBoundingClientRect();
        const gr = guideEl.getBoundingClientRect();
        const scale = Math.max(vr.width / vw, vr.height / vh);
        const offX = (vw * scale - vr.width) / 2, offY = (vh * scale - vr.height) / 2;
        sx = (gr.left - vr.left + offX) / scale;
        sy = (gr.top - vr.top + offY) / scale;
        sw = gr.width / scale;
        sh = gr.height / scale;
        if (facing === 'user') sx = vw - sx - sw;
        sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw); canvas.height = Math.round(sh);
      const ctx = canvas.getContext('2d')!;
      if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      root.classList.add('flash');
      canvas.toBlob(blob => cleanup(blob ? new File([blob], o.filename || 'foto.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92);
    };
  });
}
