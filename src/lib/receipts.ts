import type { ReceiptSettings } from '../types';
import { getState, setState, toast } from '../store';
import { supabaseClient } from './supabase';

// ==========================================
// CONFIGURACIÓN DEL RECIBO DE VENTA
// ==========================================
// Sin cuenta: se guarda en este dispositivo.
// En una tienda: se guarda en la nube (tabla stores) y la ve todo el equipo;
// solo los administradores la cambian.

const LOCAL_KEY = 'mn7_receipt_cfg_local';
const cacheKey = (sid: string) => `mn7_receipt_cfg_${sid}`;

function readCache(key: string): ReceiptSettings | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}

/** Código sugerido: iniciales del negocio (máx. 3) */
export function suggestedPrefix(name: string): string {
  const ini = name.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (ini || 'R').slice(0, 3);
}

/** Carga la configuración de la tienda activa (o la local) */
export async function loadReceiptSettings() {
  const s = getState();
  if (s.mode !== 'cloud' || !s.activeStore) {
    setState({ receiptSettings: { ...(readCache(LOCAL_KEY) || { prefix: '' }), next: (Number(localStorage.getItem('mn7_receipt_seq_local')) || 0) + 1 } });
    return;
  }
  const sid = s.activeStore.store_id;
  const cached = readCache(cacheKey(sid));
  if (cached) setState({ receiptSettings: cached });
  if (!supabaseClient || !s.isOnline) return;
  const { data, error } = await supabaseClient.from('stores').select('receipt_prefix, receipt_seq, receipt_info').eq('id', sid).maybeSingle();
  if (error || !data || getState().activeStore?.store_id !== sid) return; // SQL 8 aún sin ejecutar
  const d = data as { receipt_prefix: string | null; receipt_seq: number; receipt_info: Partial<ReceiptSettings> | null };
  const cfg: ReceiptSettings = { ...(d.receipt_info || {}), prefix: d.receipt_prefix || '', next: Number(d.receipt_seq || 0) + 1 };
  try { localStorage.setItem(cacheKey(sid), JSON.stringify(cfg)); } catch { /* sin espacio */ }
  setState({ receiptSettings: cfg });
}

/** Guarda la configuración. startAt: número desde el que seguir (solo puede adelantarse) */
export async function saveReceiptSettings(cfg: ReceiptSettings, startAt?: number): Promise<boolean> {
  const s = getState();
  const prefix = cfg.prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const { next: _n, ...info } = cfg; void _n;
  if (s.mode !== 'cloud' || !s.activeStore) {
    const clean = { ...info, prefix };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(clean));
    if (startAt && startAt > 0) {
      const cur = Number(localStorage.getItem('mn7_receipt_seq_local')) || 0;
      if (startAt - 1 > cur) localStorage.setItem('mn7_receipt_seq_local', String(startAt - 1));
    }
    setState({ receiptSettings: { ...clean, next: (Number(localStorage.getItem('mn7_receipt_seq_local')) || 0) + 1 } });
    return true;
  }
  if (!s.isAdmin()) { toast('Solo los administradores pueden cambiar los datos del recibo'); return false; }
  if (!supabaseClient || !s.isOnline) { toast('Necesitas conexión para guardar los datos del recibo de la tienda'); return false; }
  const { prefix: _p, ...rest } = info; void _p;
  const { data, error } = await supabaseClient.rpc('set_receipt_settings', { p_store: s.activeStore.store_id, p_prefix: prefix || null, p_start_at: startAt || null, p_info: rest });
  if (error) {
    toast(/set_receipt_settings|schema cache|does not exist/i.test(error.message) ? '⚠️ Falta ejecutar supabase/8-recibos-numerados.sql' : 'No se pudo guardar: ' + error.message, 6000);
    return false;
  }
  const r = data as { next: number; prefix: string };
  const saved: ReceiptSettings = { ...rest, prefix: r.prefix, next: r.next };
  try { localStorage.setItem(cacheKey(s.activeStore.store_id), JSON.stringify(saved)); } catch { /* sin espacio */ }
  setState({ receiptSettings: saved });
  return true;
}
