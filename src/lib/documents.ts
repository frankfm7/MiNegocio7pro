import type { DocRecord, ReceiptData } from '../types';
import { getState, toast } from '../store';
import { supabaseClient } from './supabase';
import { datasetId } from './db';
import { idbGet, idbSet } from './storage';
import { suggestedPrefix } from './receipts';
import { businessName } from './whatsapp';

// ==========================================
// DOCUMENTOS NUMERADOS: CIERRES DE CAJA E INFORMES + HISTORIAL
// ==========================================
// En una tienda el número lo da la base de datos (9-documentos-numerados.sql):
//   cierre  → ANA-C-000001 (un día = siempre el mismo número)
//   informe → ANA-I-000001
// Sin cuenta se numera en este dispositivo. El historial guarda una copia de cada
// recibo, cierre e informe para revisarlo y reenviarlo.

const docsKey = () => `docs:${datasetId()}`;
const MAX_LOCAL = 1500;

export async function localDocs(): Promise<DocRecord[]> {
  return idbGet<DocRecord[]>(docsKey(), []);
}

/** Guarda (o actualiza) un documento en el historial del dispositivo */
export async function rememberDoc(doc: DocRecord) {
  const key = docsKey();
  const list = await idbGet<DocRecord[]>(key, []);
  const i = list.findIndex(d => d.kind === doc.kind && d.code === doc.code);
  if (i >= 0) list[i] = { ...list[i], ...doc }; else list.unshift(doc);
  await idbSet(key, list.slice(0, MAX_LOCAL));
}

const storeId = () => (getState().mode === 'cloud' ? getState().activeStore?.store_id || null : null);
const online = () => !!(supabaseClient && storeId() && getState().isOnline && getState().authUser);
const letter = (kind: 'cierre' | 'informe') => (kind === 'cierre' ? 'C' : 'I');

/**
 * Número de un cierre (ref = día) o informe. Un cierre del mismo día reutiliza su número.
 * Devuelve '' si no se pudo numerar (sin conexión en una tienda).
 */
export async function issueDocument(kind: 'cierre' | 'informe', ref: string | null, data: unknown, total: number): Promise<string> {
  const s = getState();
  const by = s.currentUser?.name || '';
  if (s.mode !== 'cloud') {
    const list = await localDocs();
    const existing = ref ? list.find(d => d.kind === kind && d.ref === ref) : null;
    if (existing) { await rememberDoc({ ...existing, data, total, date: existing.date }); return existing.code; }
    const k = `mn7_doc_seq_${kind}`;
    const seq = (Number(localStorage.getItem(k)) || 0) + 1;
    localStorage.setItem(k, String(seq));
    const prefix = s.receiptSettings.prefix || suggestedPrefix(businessName());
    const code = `${prefix}-${letter(kind)}-${String(seq).padStart(6, '0')}`;
    await rememberDoc({ kind, code, ref, data, total, by, date: new Date().toISOString() });
    return code;
  }
  if (!online()) { toast('Sin conexión: el documento sale sin número. Vuelve a generarlo con internet para numerarlo.', 4500); return ''; }
  const { data: res, error } = await supabaseClient!.rpc('issue_document', { p_store: storeId(), p_kind: kind, p_ref: ref, p_data: data, p_total: total, p_name: by });
  if (error || !res) {
    console.error('issue_document', error);
    toast(/issue_document|schema cache|does not exist/i.test(error?.message || '') ? '⚠️ Para numerar cierres e informes ejecuta supabase/9-documentos-numerados.sql' : 'No se pudo numerar el documento', 6000);
    return '';
  }
  const code = (res as { code: string }).code;
  await rememberDoc({ kind, code, ref, data, total, by, date: new Date().toISOString() });
  return code;
}

/** Copia del recibo (sin datos pesados) para el historial */
export function receiptSnapshot(r: ReceiptData) {
  return {
    ...r,
    items: r.items.map(i => ({
      quantity: i.quantity, price: i.price,
      product: { id: i.product.id, name: i.product.name, brand: i.product.brand || '', content_value: i.product.content_value || '', content_unit: i.product.content_unit || '' },
    })),
  };
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Guarda la copia del recibo (en el dispositivo y, en una tienda, en la nube) */
export function saveReceiptCopy(r: ReceiptData | null) {
  if (!r?.number || r.reprint && !r.extra) return;
  const code = r.number;
  const snap = receiptSnapshot(r);
  clearTimeout(saveTimers.get(code));
  saveTimers.set(code, setTimeout(async () => {
    saveTimers.delete(code);
    await rememberDoc({ kind: 'recibo', code, total: r.total, by: r.seller, data: snap, date: new Date().toISOString() });
    if (getState().mode === 'cloud' && online() && !r.provisional) {
      const { error } = await supabaseClient!.rpc('save_receipt_data', { p_store: storeId(), p_code: code, p_data: snap });
      if (error) console.warn('save_receipt_data', error.message);
    }
  }, 600));
}

/** Historial: en una tienda se lee de la nube (lo de todo el equipo) y se completa con lo del dispositivo */
export async function loadDocuments(): Promise<DocRecord[]> {
  const local = await localDocs();
  if (getState().mode !== 'cloud' || !online()) return local;
  const sid = storeId()!;
  const out: DocRecord[] = [];
  const rec = await supabaseClient!.from('store_receipts').select('code, total, issued_by_name, issued_at, data').eq('store_id', sid).order('seq', { ascending: false }).limit(500);
  if (!rec.error) (rec.data || []).forEach((r: { code: string; total: number; issued_by_name: string; issued_at: string; data?: unknown }) => out.push({ kind: 'recibo', code: r.code, total: r.total, by: r.issued_by_name, date: r.issued_at, data: r.data ?? undefined }));
  else if (/column .*data/i.test(rec.error.message)) {
    const r2 = await supabaseClient!.from('store_receipts').select('code, total, issued_by_name, issued_at').eq('store_id', sid).order('seq', { ascending: false }).limit(500);
    (r2.data || []).forEach((r: { code: string; total: number; issued_by_name: string; issued_at: string }) => out.push({ kind: 'recibo', code: r.code, total: r.total, by: r.issued_by_name, date: r.issued_at }));
  }
  const docs = await supabaseClient!.from('store_documents').select('kind, code, ref, total, data, issued_by_name, issued_at').eq('store_id', sid).order('issued_at', { ascending: false }).limit(500);
  if (!docs.error) (docs.data || []).forEach((d: { kind: 'cierre' | 'informe'; code: string; ref: string | null; total: number; data: unknown; issued_by_name: string; issued_at: string }) => out.push({ kind: d.kind, code: d.code, ref: d.ref, total: d.total, by: d.issued_by_name, date: d.issued_at, data: d.data }));
  // Completar con copias locales (ej. datos de factura escritos en este celular)
  for (const l of local) {
    const i = out.findIndex(d => d.kind === l.kind && d.code === l.code);
    if (i < 0) out.push(l); else if (!out[i].data && l.data) out[i] = { ...out[i], data: l.data };
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
