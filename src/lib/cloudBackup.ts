import { supabaseClient } from './supabase';
import { getState } from '../store';
import { refreshData } from './db';
import type { CloudBackup } from '../types';

const sid = () => getState().activeStore?.store_id || null;
const isManager = () => getState().isAdmin() && getState().mode === 'cloud';
const autoKey = () => `mc7_autobackup_${sid()}`;

export const isAutoBackupOn = () => localStorage.getItem(autoKey()) !== 'false';
export const setAutoBackup = (on: boolean) => localStorage.setItem(autoKey(), String(on));

export async function listCloudBackups(): Promise<CloudBackup[]> {
  const id = sid();
  if (!supabaseClient || !id) return [];
  const { data, error } = await supabaseClient.from('store_backups').select('id, created_at, kind, size_bytes, counts').eq('store_id', id).order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(/store_backups|schema cache|does not exist/i.test(error.message) ? 'Falta ejecutar supabase/5-mejoras-v4.sql en Supabase' : error.message);
  return (data || []) as CloudBackup[];
}

export async function backupNow(kind: 'manual' | 'auto' = 'manual') {
  const id = sid();
  if (!supabaseClient || !id) throw new Error('Conéctate a una tienda en la nube');
  const { error } = await supabaseClient.rpc('backup_store', { p_store: id, p_kind: kind });
  if (error) throw new Error(/backup_store|Could not find the function/i.test(error.message) ? 'Falta ejecutar supabase/5-mejoras-v4.sql en Supabase' : error.message);
}

export async function restoreCloudBackup(backupId: string) {
  if (!supabaseClient) throw new Error('Sin conexión a la nube');
  const { error } = await supabaseClient.rpc('restore_store_backup', { p_backup: backupId });
  if (error) throw new Error(error.message);
  await refreshData(true);
}

// ---------- Respaldo automático ----------
// Al abrir la app y cada 3 horas se pide un respaldo; el servidor crea uno nuevo
// solo si el último tiene más de 20 horas (así hay ~1 por día, se guardan los 20 últimos).
let timer: ReturnType<typeof setInterval> | null = null;
export function stopAutoBackup() { if (timer) { clearInterval(timer); timer = null; } }
export function startAutoBackup() {
  stopAutoBackup();
  const run = () => { if (isManager() && isAutoBackupOn() && getState().isOnline) backupNow('auto').catch(() => {}); };
  setTimeout(run, 8000);
  timer = setInterval(run, 3 * 60 * 60 * 1000);
}
