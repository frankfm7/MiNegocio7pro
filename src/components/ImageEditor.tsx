import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackClose } from '../lib/backClose';
import { create } from 'zustand';
import { Brush, Crop, Eraser, FlipHorizontal, Hand, Loader, RotateCcw, RotateCw, Sparkles, Sun, Undo2, Wand2, X } from 'lucide-react';
import {
  ASPECTS, DEFAULT_EDIT, adjust, autoMask, averageBorder, compose, cutout, feather, levelsOf, loadImage, makeBase, maskBox, placement,
  type Aspect, type EditState,
} from '../lib/imageEdit';
import { toast } from '../store';

// ==========================================
// EDITOR DE FOTOS DE PRODUCTO
// ==========================================
// Uso: const nueva = await editProductImage(foto)  → dataURL JPEG, o null si se cancela.

interface EditorStore { src: string | null; initial: Partial<EditState> | null; resolve: ((v: string | null) => void) | null }
const useEditor = create<EditorStore>(() => ({ src: null, initial: null, resolve: null }));

// Los ajustes NO se recuerdan: cada foto empieza normal (cada imagen es distinta).
try { localStorage.removeItem('mn7_img_prefs'); } catch { /* sin acceso */ }

/** Abre el editor con una foto (dataURL o URL). Devuelve la foto final o null. */
export function editProductImage(src: string, initial: Partial<EditState> = {}): Promise<string | null> {
  return new Promise(resolve => {
    const prev = useEditor.getState().resolve;
    if (prev) prev(null);
    useEditor.setState({ src, initial, resolve });
  });
}

type Tab = 'frame' | 'bg' | 'light';
type Tool = 'move' | 'erase' | 'restore';
const OUT_LONG = 1200;

export default function ImageEditor() {
  const src = useEditor(s => s.src);
  if (!src) return null;
  return <EditorInner key={src} src={src} />;
}

function EditorInner({ src }: { src: string }) {
  // Botón atrás del celular = Cancelar el editor
  useBackClose('image-editor', true, () => close(null));
  const initial = useEditor(s => s.initial);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [st, setSt] = useState<EditState>(() => ({ ...DEFAULT_EDIT, ...initial }));
  const [tab, setTab] = useState<Tab>('frame');
  const [tool, setTool] = useState<Tool>('move');
  const [brush, setBrush] = useState(28);
  const [busy, setBusy] = useState(false);
  const [maskVer, setMaskVer] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const brushLayer = useRef<Uint8Array | null>(null); // 0 = sin tocar, 1 = producto, 2 = fondo
  const history = useRef<Uint8Array[]>([]);
  const framedOnce = useRef(false);

  useEffect(() => { loadImage(src).then(setImg).catch(() => setFailed(true)); }, [src]);
  useEffect(() => { if (failed) { toast('No se pudo abrir la imagen para editarla'); close(null); } }, [failed]);

  // 1) Imagen de trabajo girada
  const base = useMemo(() => (img ? makeBase(img, st.rotate, st.flipX) : null), [img, st.rotate, st.flipX]);
  const baseData = useMemo(() => (base ? base.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, base.width, base.height) : null), [base]);
  useEffect(() => { brushLayer.current = baseData ? new Uint8Array(baseData.width * baseData.height) : null; history.current = []; setMaskVer(v => v + 1); }, [baseData]);
  const levels = useMemo(() => (baseData ? levelsOf(baseData) : [0, 255] as [number, number]), [baseData]);
  const originalBg = useMemo(() => (baseData ? averageBorder(baseData) : '#ffffff'), [baseData]);
  // 2) Luz y color
  const adjusted = useMemo(() => (baseData ? adjust(baseData, st, levels) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseData, levels, st.auto, st.brightness, st.contrast, st.saturation, st.sharpen]);
  // 3) Máscara automática del fondo
  //    a) con IA: el modelo reconoce el producto (se calcula una vez por foto)
  const [aiAlpha, setAiAlpha] = useState<Uint8Array | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [aiCutFn, setAiCutFn] = useState<((p: Uint8Array, c: number) => Uint8Array) | null>(null);
  useEffect(() => { setAiAlpha(null); setAiStatus('idle'); }, [baseData]);
  useEffect(() => {
    if (!baseData || !st.removeBg || st.bgMethod !== 'ai' || aiAlpha || aiStatus !== 'idle') return;
    let live = true;
    setAiStatus('loading');
    import('../lib/aiBackground').then(async m => { const a = await m.aiMask(baseData); if (live) { setAiCutFn(() => m.applyCut); setAiAlpha(a); setAiStatus('idle'); } })
      .catch(e => { console.error('IA fondo', e); if (live) { setAiStatus('error'); toast('No se pudo usar la IA en este equipo; se usa el modo por color'); setSt(prev => ({ ...prev, bgMethod: 'color' })); } });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseData, st.removeBg, st.bgMethod, aiAlpha]);
  //    b) por color: se "inunda" el fondo desde los bordes
  const auto = useMemo(() => (baseData && st.removeBg && st.bgMethod === 'color' ? autoMask(baseData, st.tolerance) : null), [baseData, st.removeBg, st.bgMethod, st.tolerance]);
  // 4) Máscara final (automática + pincel) con borde suave
  const alpha = useMemo(() => {
    if (!baseData || !st.removeBg) return null;
    const src = st.bgMethod === 'ai' ? (aiAlpha && aiCutFn ? aiCutFn(aiAlpha, st.aiCut) : null) : auto;
    if (!src) return null;
    const layer = brushLayer.current;
    const m = new Uint8Array(src);
    if (layer) for (let p = 0; p < m.length; p++) if (layer[p]) m[p] = layer[p] === 1 ? 255 : 0;
    // La IA ya entrega bordes suaves; el modo por color se suaviza aquí
    return st.bgMethod === 'ai' ? m : feather(m, baseData.width, baseData.height);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseData, auto, aiAlpha, aiCutFn, st.aiCut, st.removeBg, st.bgMethod, maskVer]);
  const cut = useMemo(() => (adjusted ? cutout(adjusted, alpha) : null), [adjusted, alpha]);

  // Encuadre automático la primera vez (si el fondo es liso)
  useEffect(() => {
    if (framedOnce.current || !baseData) return;
    framedOnce.current = true;
    if (initial?.zoom !== undefined) return;
    centerProduct(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseData]);

  // Dibujo en pantalla
  const frame = useFrameSize(boxRef, st.aspect);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !cut || !frame.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(frame.w * dpr); c.height = Math.round(frame.h * dpr);
    const ctx = c.getContext('2d')!;
    compose(ctx, c.width, c.height, cut, st, originalBg);
  }, [cut, st, frame.w, frame.h, originalBg]);

  const set = (patch: Partial<EditState>) => setSt(prev => ({ ...prev, ...patch }));

  function centerProduct(silent = false) {
    if (!baseData) return;
    const W = baseData.width, H = baseData.height;
    const m = alpha || autoMask(baseData, st.tolerance);
    // Fondo cargado (la máscara casi no encontró fondo): no se puede encuadrar solo
    let bgCount = 0;
    for (let p = 0; p < m.length; p += 7) if (m[p] < 128) bgCount++;
    const box = bgCount / (m.length / 7) < 0.25 ? null : maskBox(m, W, H);
    if (!box) { if (!silent) toast('No se distingue el producto del fondo: ajústalo con el dedo'); return; }
    const FW = 300, FH = 300 / ASPECTS[st.aspect];
    const fit = Math.min((FW * 0.92) / W, (FH * 0.92) / H);
    const want = Math.min((FW * 0.86) / box.w, (FH * 0.86) / box.h);
    const zoom = Math.max(0.3, Math.min(6, want / fit));
    const s = fit * zoom;
    const bx = (box.x + box.w / 2 - W / 2) * s, by = (box.y + box.h / 2 - H / 2) * s;
    set({ zoom, offX: -bx / FW, offY: -by / FH });
  }

  // ---------- Gestos: mover, pellizcar para zoom, pincel ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ st: EditState; dist: number; mid: { x: number; y: number } } | null>(null);
  const painting = useRef(false);

  const toImage = (px: number, py: number) => {
    if (!cut || !frame.w) return null;
    const { s, cx, cy } = placement(cut.width, cut.height, frame.w, frame.h, st);
    return { x: (px - cx) / s + cut.width / 2, y: (py - cy) / s + cut.height / 2, r: brush / 2 / s };
  };
  const paintAt = (px: number, py: number) => {
    const layer = brushLayer.current;
    const p = toImage(px, py);
    if (!layer || !p || !baseData) return;
    const W = baseData.width, H = baseData.height;
    const v = tool === 'erase' ? 2 : 1;
    const r2 = p.r * p.r;
    for (let y = Math.max(0, Math.floor(p.y - p.r)); y <= Math.min(H - 1, Math.ceil(p.y + p.r)); y++) {
      for (let x = Math.max(0, Math.floor(p.x - p.r)); x <= Math.min(W - 1, Math.ceil(p.x + p.r)); x++) {
        if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r2) layer[y * W + x] = v;
      }
    }
    requestRedraw();
  };
  const raf = useRef(0);
  const requestRedraw = () => { if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setMaskVer(v => v + 1); }); };

  const local = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    if (tool !== 'move' && pts.length === 1 && st.removeBg) {
      if (brushLayer.current) { history.current.push(new Uint8Array(brushLayer.current)); if (history.current.length > 20) history.current.shift(); }
      painting.current = true; paintAt(pts[0].x, pts[0].y); return;
    }
    painting.current = false;
    start.current = { st, dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, mid: mid(pts) };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    if (painting.current && pts.length === 1) { paintAt(pts[0].x, pts[0].y); return; }
    const s0 = start.current;
    if (!s0 || !frame.w) return;
    const m = mid(pts);
    const patch: Partial<EditState> = { offX: s0.st.offX + (m.x - s0.mid.x) / frame.w, offY: s0.st.offY + (m.y - s0.mid.y) / frame.h };
    if (pts.length > 1 && s0.dist > 0) patch.zoom = clampZoom(s0.st.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / s0.dist);
    set(patch);
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    painting.current = false;
    const pts = [...pointers.current.values()];
    start.current = pts.length ? { st, dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, mid: mid(pts) } : null;
  };
  const onWheel = (e: React.WheelEvent) => set({ zoom: clampZoom(st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)) });

  const undoBrush = () => {
    const prev = history.current.pop();
    if (prev && brushLayer.current) { brushLayer.current.set(prev); setMaskVer(v => v + 1); }
  };

  function close(result: string | null) {
    const r = useEditor.getState().resolve;
    useEditor.setState({ src: null, initial: null, resolve: null });
    r?.(result);
  }

  const done = async () => {
    if (!cut) return;
    setBusy(true);
    try {
      const ratio = ASPECTS[st.aspect];
      const out = document.createElement('canvas');
      out.width = ratio <= 1 ? Math.round(OUT_LONG * ratio) : OUT_LONG;
      out.height = ratio <= 1 ? OUT_LONG : Math.round(OUT_LONG / ratio);
      compose(out.getContext('2d')!, out.width, out.height, cut, st, originalBg);
      close(out.toDataURL('image/jpeg', 0.88));
    } finally { setBusy(false); }
  };

  const reset = () => { setSt({ ...DEFAULT_EDIT }); if (brushLayer.current) brushLayer.current.fill(0); history.current = []; setMaskVer(v => v + 1); framedOnce.current = false; setTimeout(() => centerProduct(true), 0); };

  const swatches = ['#ffffff', '#000000', '#f3f4f6', '#fdf2f8', '#f5ede4', '#e0f2fe'];
  const BgBtn = ({ value, label }: { value: string; label?: string }) => (
    <button type="button" onClick={() => set({ bg: value })} title={label || value} aria-label={label || value}
      className={`w-10 h-10 rounded-full border-2 flex-shrink-0 grid place-items-center text-[9px] font-bold ${st.bg === value ? 'border-[#7c43ba] ring-2 ring-[#7c43ba]/30' : 'border-[#ddd3e4]'}`}
      style={{ background: value === 'original' ? `linear-gradient(135deg, ${originalBg} 50%, #fff 50%)` : value }}>
      {value === 'original' && <span className="bg-white/90 rounded px-0.5 text-[#201728]">Orig.</span>}
    </button>
  );

  return (
    <div id="image-editor" className="fixed inset-0 z-[90] bg-[#140d1a] text-white flex flex-col select-none" role="dialog" aria-label="Ajustar foto">
      <div className="flex items-center gap-2 px-3 py-2.5 safe-top">
        <button type="button" onClick={() => close(null)} className="h-10 px-3 rounded-xl bg-white/10 font-bold text-sm flex items-center gap-1"><X className="w-4 h-4" /> Cancelar</button>
        <p className="flex-1 text-center font-bold text-sm">Ajustar foto</p>
        <button type="button" onClick={done} disabled={busy || !cut} className="h-10 px-4 rounded-xl bg-[#7c43ba] font-bold text-sm flex items-center gap-1 disabled:opacity-50">{busy ? <Loader className="w-4 h-4 animate-spin" /> : null} Listo</button>
      </div>

      <div ref={boxRef} className="flex-1 min-h-0 flex items-center justify-center px-4 py-2">
        {!cut ? <Loader className="w-8 h-8 animate-spin opacity-70" /> : (
          <canvas ref={canvasRef} style={{ width: frame.w, height: frame.h, touchAction: 'none', cursor: tool === 'move' ? 'grab' : 'crosshair' }}
            className="rounded-xl shadow-2xl ring-1 ring-white/15"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} />
        )}
      </div>
      <p className="text-center text-[11px] text-white/60 px-4 pb-1">
        {tool === 'move' || !st.removeBg ? 'Arrastra para mover · pellizca o usa el zoom para acercar' : tool === 'erase' ? 'Pasa el dedo por lo que quieras BORRAR (se vuelve fondo)' : 'Pasa el dedo por lo que quieras RECUPERAR del producto'}
      </p>

      <div className="bg-white text-[#201728] rounded-t-3xl px-4 pt-3 pb-4 safe-bottom max-h-[46vh] overflow-y-auto">
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {([['frame', 'Encuadre', Crop], ['bg', 'Fondo', Wand2], ['light', 'Luz y color', Sun]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => { setTab(k); if (k !== 'bg') setTool('move'); }} className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${tab === k ? 'bg-[#7c43ba] text-white' : 'bg-[#f3eef6] text-[#5f3291]'}`}><Icon className="w-4 h-4" /> {label}</button>
          ))}
        </div>

        {tab === 'frame' && (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {(['3:4', '1:1', '4:3'] as Aspect[]).map(a => (
                <button key={a} type="button" onClick={() => set({ aspect: a })} className={`flex-1 py-2 rounded-xl text-xs font-bold border ${st.aspect === a ? 'border-[#7c43ba] bg-[#f6f1f8] text-[#7c43ba]' : 'border-[#e8dfec]'}`}>{a === '3:4' ? 'Vertical' : a === '1:1' ? 'Cuadrada' : 'Horizontal'}</button>
              ))}
            </div>
            <Slider label="Zoom" min={0.3} max={6} step={0.01} value={st.zoom} onChange={v => set({ zoom: v })} fmt={v => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-4 gap-1.5">
              <ToolBtn onClick={() => set({ rotate: ((st.rotate + 270) % 360) as EditState['rotate'] })} icon={<RotateCcw className="w-4 h-4" />} label="Girar" />
              <ToolBtn onClick={() => set({ rotate: ((st.rotate + 90) % 360) as EditState['rotate'] })} icon={<RotateCw className="w-4 h-4" />} label="Girar" />
              <ToolBtn onClick={() => set({ flipX: !st.flipX })} icon={<FlipHorizontal className="w-4 h-4" />} label="Espejo" active={st.flipX} />
              <ToolBtn onClick={() => centerProduct()} icon={<Crop className="w-4 h-4" />} label="Centrar" />
            </div>
          </div>
        )}

        {tab === 'bg' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold mb-1.5">Color de fondo</p>
              <div className="flex gap-2 items-center overflow-x-auto pb-1">
                <BgBtn value="original" label="Fondo original" />
                <BgBtn value="#ffffff" label="Blanco" />
                <BgBtn value="#000000" label="Negro" />
                {swatches.slice(2).map(c => <BgBtn key={c} value={c} />)}
                <label className="w-10 h-10 rounded-full border-2 border-dashed border-[#ddd3e4] flex-shrink-0 grid place-items-center text-[10px] font-bold text-[#7c43ba] cursor-pointer relative overflow-hidden" title="Otro color">
                  +<input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={/^#/.test(st.bg) ? st.bg : '#ffffff'} onChange={e => set({ bg: e.target.value })} />
                </label>
              </div>
            </div>
            <label className="flex items-start gap-2 p-2.5 rounded-xl bg-[#f6f1f8] cursor-pointer">
              <input type="checkbox" checked={st.removeBg} onChange={e => { set({ removeBg: e.target.checked, ...(e.target.checked && st.bg === 'original' ? { bg: '#ffffff' } : {}) }); if (!e.target.checked) setTool('move'); }} className="mt-0.5 accent-[#7c43ba]" />
              <span className="text-xs"><b>Quitar el fondo de la foto</b><br /><span className="text-[#756c7e]">Con IA reconoce el producto; "por color" funciona con fondos de un solo color.</span></span>
            </label>
            {st.removeBg && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => set({ bgMethod: 'ai' })} className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${st.bgMethod === 'ai' ? 'bg-[#7c43ba] text-white' : 'bg-[#f3eef6] text-[#5f3291]'}`}><Sparkles className="w-4 h-4" /> Inteligente (IA)</button>
                  <button type="button" onClick={() => set({ bgMethod: 'color' })} className={`py-2 rounded-xl text-xs font-bold ${st.bgMethod === 'color' ? 'bg-[#7c43ba] text-white' : 'bg-[#f3eef6] text-[#5f3291]'}`}>Por color del fondo</button>
                </div>
                {st.bgMethod === 'ai' && (
                  <p id="ai-status" className="text-[11px] text-[#756c7e]">
                    {aiStatus === 'loading' ? <span className="inline-flex items-center gap-1.5 font-bold text-[#7c43ba]"><Loader className="w-3.5 h-3.5 animate-spin" /> Reconociendo el producto con IA… (la 1ª vez descarga ~15 MB)</span>
                      : aiAlpha ? '✨ Fondo quitado con IA. Si quedó algo, corrígelo con el pincel Borrar / Recuperar.' : 'La IA reconoce el producto aunque el fondo tenga colores o sombras.'}
                  </p>
                )}
                {st.bgMethod === 'ai' && aiAlpha && <Slider label="Recorte" min={0} max={100} step={1} value={st.aiCut} onChange={v => set({ aiCut: v })} fmt={v => (v < 25 ? 'Conserva más' : v < 60 ? 'Normal' : 'Recorta más')} />}
                {st.bgMethod === 'color' && <Slider label="Sensibilidad" min={6} max={90} step={1} value={st.tolerance} onChange={v => set({ tolerance: v })} fmt={v => (v < 25 ? 'Poca' : v < 55 ? 'Media' : 'Mucha')} />}
                <div className="grid grid-cols-4 gap-1.5">
                  <ToolBtn onClick={() => setTool('move')} icon={<Hand className="w-4 h-4" />} label="Mover" active={tool === 'move'} />
                  <ToolBtn onClick={() => setTool('erase')} icon={<Eraser className="w-4 h-4" />} label="Borrar" active={tool === 'erase'} />
                  <ToolBtn onClick={() => setTool('restore')} icon={<Brush className="w-4 h-4" />} label="Recuperar" active={tool === 'restore'} />
                  <ToolBtn onClick={undoBrush} icon={<Undo2 className="w-4 h-4" />} label="Deshacer" />
                </div>
                {tool !== 'move' && <Slider label="Tamaño del pincel" min={8} max={90} step={1} value={brush} onChange={setBrush} fmt={v => `${v}px`} />}
                <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={st.shadow} onChange={e => set({ shadow: e.target.checked })} className="accent-[#7c43ba]" /> Sombra suave debajo del producto</label>
              </>
            )}
          </div>
        )}

        {tab === 'light' && (
          <div className="space-y-3">
            <button type="button" onClick={() => set({ auto: !st.auto })} className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${st.auto ? 'bg-[#7c43ba] text-white' : 'bg-[#f3eef6] text-[#5f3291]'}`}><Sparkles className="w-4 h-4" /> {st.auto ? 'Auto-mejora activada' : 'Auto-mejorar'}</button>
            <Slider label="Brillo" min={-60} max={60} step={1} value={st.brightness} onChange={v => set({ brightness: v })} />
            <Slider label="Contraste" min={-60} max={60} step={1} value={st.contrast} onChange={v => set({ contrast: v })} />
            <Slider label="Color" min={-100} max={80} step={1} value={st.saturation} onChange={v => set({ saturation: v })} />
            <Slider label="Nitidez" min={0} max={100} step={1} value={st.sharpen} onChange={v => set({ sharpen: v })} />
          </div>
        )}

        <button type="button" onClick={reset} className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-[#756c7e] hover:bg-[#f6f1f8]">Volver a la foto original</button>
      </div>
    </div>
  );
}

// ---------- piezas pequeñas ----------
function Slider({ label, min, max, step, value, onChange, fmt }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs font-bold mb-1"><span>{label}</span><span className="text-[#7c43ba]">{fmt ? fmt(value) : value > 0 ? `+${value}` : value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-[#7c43ba]" />
    </label>
  );
}

function ToolBtn({ onClick, icon, label, active }: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`py-2 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 ${active ? 'bg-[#7c43ba] text-white' : 'bg-[#f3eef6] text-[#5f3291]'}`}>{icon}{label}</button>
  );
}

const mid = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });
const clampZoom = (z: number) => Math.max(0.3, Math.min(6, z));

/** Tamaño del marco en pantalla según el espacio disponible y la proporción */
function useFrameSize(ref: React.RefObject<HTMLDivElement>, aspect: Aspect) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const r = el.getBoundingClientRect();
      const availW = Math.max(100, r.width - 32), availH = Math.max(100, r.height - 16);
      const ratio = ASPECTS[aspect];
      let w = availW, h = w / ratio;
      if (h > availH) { h = availH; w = h * ratio; }
      setSize({ w: Math.round(w), h: Math.round(h) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, aspect]);
  return size;
}
