import { createStore, del, get, set } from 'idb-keyval';

// IndexedDB: guarda catálogos con fotos sin el límite de 5 MB de localStorage
const store = createStore('minegocio7pro', 'datos');

export async function idbGet<T>(key: string, def: T): Promise<T> {
  try {
    const v = await get<T>(key, store);
    return v === undefined ? def : v;
  } catch (e) {
    console.error('IndexedDB get', key, e);
    return def;
  }
}

export async function idbSet(key: string, value: unknown) {
  try { await set(key, value, store); } catch (e) { console.error('IndexedDB set', key, e); }
}

export async function idbDel(key: string) {
  try { await del(key, store); } catch { /* sin datos */ }
}

/** Identificador del conjunto de datos activo: 'local' o el id de la tienda */
export const dataKey = (datasetId: string) => `data:${datasetId}`;
export const pendingKey = (datasetId: string) => `pending:${datasetId}`;
export const qrsKey = (datasetId: string) => `qrs:${datasetId}`;
export const embeddingsKey = 'visual-embeddings';
