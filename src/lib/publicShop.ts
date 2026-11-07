import { supabaseClient } from './supabase';
import { getState } from '../store';

export interface PublicShopData {
  store: { name: string; whatsapp: string | null; info?: { address?: string; hours?: string; delivery?: string; eta_days?: number | string | null; about?: string; phone?: string } };
  magazines?: { id: string; brand: string; title: string; pages: string[]; valid_until: string | null; eta_days: number | null }[];
  catalogs: { id: string; name: string; label: string | null; color: string | null }[];
  products: {
    id: string; name: string; brand: string | null; type: string | null; category: string | null; price: number; stock: number;
    catalog_id: string; description: string | null; offer: string | null; cv: string | null; cu: string | null; has_image: boolean;
  }[];
}

const appOrigin = () => ((import.meta.env.VITE_PUBLIC_URL as string | undefined) || location.origin).replace(/\/+$/, '');
export const shopLink = (slug: string) => `${appOrigin()}/?tienda=${encodeURIComponent(slug)}`;

export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Lo que ve cualquier persona con el enlace (sin costos ni precio mínimo) */
export async function fetchPublicShop(slug: string): Promise<PublicShopData | null> {
  if (!supabaseClient) throw new Error('not-configured');
  const { data, error } = await supabaseClient.rpc('get_public_shop', { p_slug: slug });
  if (error) throw error;
  return (data as PublicShopData | null) || null;
}

export async function fetchPublicImages(slug: string, ids: string[]): Promise<Record<string, string>> {
  if (!supabaseClient || !ids.length) return {};
  const { data, error } = await supabaseClient.rpc('get_public_images', { p_slug: slug, p_ids: ids });
  if (error) return {};
  return (data as Record<string, string>) || {};
}

// ---------- Administración (dueño / co-admin) ----------
export interface ShopSettings { enabled: boolean; slug: string; whatsapp: string }

export async function loadShopSettings(): Promise<ShopSettings | 'missing'> {
  const sid = getState().activeStore?.store_id;
  if (!supabaseClient || !sid) return { enabled: false, slug: '', whatsapp: '' };
  const { data, error } = await supabaseClient.from('stores').select('public_enabled, public_slug, public_whatsapp').eq('id', sid).maybeSingle();
  if (error) return 'missing';
  return { enabled: !!data?.public_enabled, slug: data?.public_slug || '', whatsapp: data?.public_whatsapp || '' };
}

export async function saveShopSettings(s: ShopSettings) {
  const sid = getState().activeStore?.store_id;
  if (!supabaseClient || !sid) throw new Error('Conéctate a una tienda en la nube');
  const { error } = await supabaseClient.rpc('set_public_shop', { p_store: sid, p_enabled: s.enabled, p_slug: s.slug, p_whatsapp: s.whatsapp });
  if (error) {
    if (/function .*set_public_shop|Could not find the function/i.test(error.message)) throw new Error('Falta ejecutar supabase/5-mejoras.sql en Supabase');
    throw new Error(error.message);
  }
}

/** Pedido directo a la app de la tienda (llega a Mensajes → Pedidos), sin WhatsApp */
export async function sendOrderToStore(slug: string, name: string, phone: string, body: string, order: unknown) {
  if (!supabaseClient) throw new Error('Tienda no conectada');
  const { error } = await supabaseClient.rpc('send_public_order', { p_slug: slug, p_name: name, p_phone: phone, p_body: body, p_order: order });
  if (error) {
    if (/send_public_order|schema cache|Could not find/i.test(error.message)) throw new Error('La tienda aún no activó los pedidos por la app. Envíalo por WhatsApp.');
    throw new Error(error.message);
  }
}

/** Página de una revista (Storage público "revistas") */
export const magPageUrl = (path: string) => (supabaseClient ? supabaseClient.storage.from('revistas').getPublicUrl(path).data.publicUrl : '');
