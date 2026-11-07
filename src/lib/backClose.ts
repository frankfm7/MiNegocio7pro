// ==========================================
// BOTÓN ATRÁS DEL CELULAR = CERRAR LA VENTANA DE ENCIMA
// ==========================================
// Cada ventana, panel o visor que se abre se anota aquí (en el orden en que se abrió).
// Al tocar "atrás" se cierra SOLO la última abierta; lo de atrás no se mueve.
// Si no hay nada abierto, la app navega como siempre (volver a Catálogos, etc.).

import { useEffect, useRef } from 'react';

/** close devuelve false si no se cerró (por ejemplo, la persona canceló "¿Salir sin guardar?") */
interface Entry { id: string; close: () => boolean | void }
const stack: Entry[] = [];

export function registerBack(id: string, close: Entry['close']) {
  unregisterBack(id);
  stack.push({ id, close });
  return () => unregisterBack(id);
}
export function unregisterBack(id: string) {
  const i = stack.findIndex(e => e.id === id);
  if (i >= 0) stack.splice(i, 1);
}
export const hasOpenOverlay = () => stack.length > 0;

/** Cierra la ventana de encima. Devuelve true si había alguna abierta */
export function closeTopOverlay(): boolean {
  const e = stack[stack.length - 1];
  if (!e) return false;
  stack.pop();
  if (e.close() === false) stack.push(e); // no se cerró: sigue en la lista
  return true;
}

/** Mientras `open` sea verdadero, el botón atrás cierra esta ventana con `close` */
export function useBackClose(id: string, open: boolean, close: Entry['close']) {
  const fn = useRef(close);
  fn.current = close;
  useEffect(() => {
    if (!open) return;
    return registerBack(id, () => fn.current());
  }, [id, open]);
}

/** Para páginas sin el resto de la app (catálogo público): engancha el botón atrás */
export function installBackHandler(onNothingOpen?: (e: PopStateEvent) => void) {
  history.pushState({ mn7: 'back' }, '');
  const onPop = (e: PopStateEvent) => {
    if (closeTopOverlay()) { history.pushState({ mn7: 'back' }, ''); return; }
    onNothingOpen?.(e);
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}
