// ==========================================
// REVISTAS DE LA EMPRESA (Ésika, L'Bel, Cyzone, Yanbal...)
// ==========================================
// El dueño sube la revista (PDF o fotos de las páginas). Cada página se guarda como
// imagen en el Storage público "revistas" (<tienda>/<revista>/<n>.jpg). Los clientes la
// hojean desde el catálogo público y piden por código; el pedido llega a Mensajes → Pedidos
// o por WhatsApp, con el tiempo estimado de llegada.

import { getState } from '../store';
import { supabaseClient } from './supabase';
import { compressImage } from './image';
import { loadPdfJs } from './io';

export const MAG_BRANDS = ['Ésika', "L'Bel", 'Cyzone', 'Yanbal', 'Natura', 'Avon', 'Unique', 'Otra'];
export interface Magazine { id: string; store_id?: string; brand: string; title: string; pages: string[]; valid_until: string | null; eta_days: number | null; active?: boolean; created_at?: string }
export interface ShopInfo { address?: string; hours?: string; delivery?: string; eta_days?: number | null; about?: string; phone?: string }

const BUCKET = 'revistas';
const sid = () => getState().activeStore?.store_id || '';

function friendly(e: unknown) {
  const m = (e as { message?: string })?.message || String(e);
  if (/store_magazines|set_public_info|schema cache|does not exist|Bucket not found|bucket/i.test(m)) return new Error('Para usar las revistas ejecuta supabase/10-mensajes-revistas-roles.sql en Supabase');
  return new Error(m);
}

export const pageUrl = (path: string) => (supabaseClient ? supabaseClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : '');

export async function listMagazines(): Promise<Magazine[]> {
  if (!supabaseClient || !sid()) return [];
  const { data, error } = await supabaseClient.from('store_magazines').select('*').eq('store_id', sid()).order('created_at', { ascending: false });
  if (error) throw friendly(error);
  return (data || []) as Magazine[];
}

/** Páginas de un PDF como imágenes JPG (ancho ~1200 px, se leen bien en el celular) */
export async function pdfPages(file: File, onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: Blob[] = [];
  const total = Math.min(pdf.numPages, 120);
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.5, 1200 / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.8)));
    onProgress?.(i, total);
  }
  return out;
}

/** Fotos de las páginas (comprimidas) */
export async function photoPages(files: File[], onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let i = 0; i < files.length; i++) {
    const b64 = await compressImage(files[i], 1400, 0.82);
    out.push(await (await fetch(b64)).blob());
    onProgress?.(i + 1, files.length);
  }
  return out;
}

export async function createMagazine(meta: Pick<Magazine, 'brand' | 'title' | 'valid_until' | 'eta_days'>, pages: Blob[], onProgress?: (done: number, total: number) => void) {
  if (!supabaseClient || !sid()) throw new Error('Conéctate a tu tienda en la nube');
  const id = crypto.randomUUID();
  const paths: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const path = `${sid()}/${id}/${String(i + 1).padStart(3, '0')}.jpg`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, pages[i], { contentType: 'image/jpeg', upsert: true });
    if (error) throw friendly(error);
    paths.push(path);
    onProgress?.(i + 1, pages.length);
  }
  const { error } = await supabaseClient.from('store_magazines').insert({ id, store_id: sid(), ...meta, pages: paths });
  if (error) { await supabaseClient.storage.from(BUCKET).remove(paths).catch(() => {}); throw friendly(error); }
}

export async function updateMagazine(id: string, patch: Partial<Pick<Magazine, 'active' | 'title' | 'valid_until' | 'eta_days' | 'brand'>>) {
  const { error } = await supabaseClient!.from('store_magazines').update(patch).eq('id', id);
  if (error) throw friendly(error);
}

export async function deleteMagazine(m: Magazine) {
  const { error } = await supabaseClient!.from('store_magazines').delete().eq('id', m.id);
  if (error) throw friendly(error);
  if (m.pages?.length) await supabaseClient!.storage.from(BUCKET).remove(m.pages).catch(() => {});
}

export async function loadShopInfo(): Promise<ShopInfo> {
  if (!supabaseClient || !sid()) return {};
  const { data, error } = await supabaseClient.from('stores').select('public_info').eq('id', sid()).maybeSingle();
  if (error) throw friendly(error);
  return (data?.public_info as ShopInfo) || {};
}

export async function saveShopInfo(info: ShopInfo) {
  const { error } = await supabaseClient!.rpc('set_public_info', { p_store: sid(), p_info: info });
  if (error) throw friendly(error);
}
