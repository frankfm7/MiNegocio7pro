import type { Catalog, PendingAction, PendingChange, Product, Sale } from '../types';
import { supabaseClient } from './supabase';
import { getState, setState, toast } from '../store';
import { SoundEffects } from './sound';
import { newId } from './format';
import { dataKey, idbGet, idbSet, pendingKey } from './storage';

// ==========================================
// CONJUNTO DE DATOS ACTIVO
// ==========================================
// En modo local los datos viven solo en este dispositivo (IndexedDB).
// En modo tienda se guardan en Supabase con el store_id de la tienda y se
// mantiene una copia local para trabajar sin conexión.

export const datasetId = () => {
  const s = getState();
  return s.mode === 'cloud' && s.activeStore ? s.activeStore.store_id : 'local';
};
const storeId = () => (getState().mode === 'cloud' ? getState().activeStore?.store_id || null : null);
const canUseCloud = () => !!(supabaseClient && storeId() && getState().isOnline && getState().authUser);

interface DataSet { catalogs: Catalog[]; records: Product[]; sales: Sale[] }

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Guarda (con un pequeño retraso para agrupar cambios) el conjunto activo en el dispositivo */
function saveLocal() {
  const id = datasetId();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { catalogs, records, sales } = getState();
    idbSet(dataKey(id), { catalogs, records, sales } satisfies DataSet);
  }, 150);
}

async function savePending(list: PendingChange[]) {
  setState({ pendingChanges: list });
  await idbSet(pendingKey(datasetId()), list);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addToPendingChanges(action: PendingAction, data: any) {
  if (getState().mode !== 'cloud') return;
  const list = [...getState().pendingChanges, { id: newId(), action, data, timestamp: new Date().toISOString() }];
  savePending(list);
}

// ==========================================
// AYUDAS PARA SUPABASE
// ==========================================
const CONTENT_FIELDS = ['content_value', 'content_unit'] as const;
let contentColumnsMissing = false;

/** Deja solo las columnas que existen en la tabla products */
function productRow(p: Partial<Product>, sid: string) {
  const row: Record<string, unknown> = {
    id: p.id, name: p.name, brand: p.brand ?? '', type: p.type ?? '', category: p.category ?? '',
    cost_price: Number(p.cost_price) || 0, sale_price: Number(p.sale_price) || 0, min_price: Number(p.min_price) || 0,
    stock: Number(p.stock) || 0, sold: !!p.sold, catalog_id: p.catalog_id ?? '', image_url: p.image_url ?? '',
    description: p.description ?? '', barcode: p.barcode ?? '', offer_text: p.offer_text ?? '',
    content_value: p.content_value ?? '', content_unit: p.content_unit ?? '', store_id: sid,
  };
  if (contentColumnsMissing) CONTENT_FIELDS.forEach(f => delete row[f]);
  return row;
}

function catalogRow(c: Partial<Catalog>, sid: string) {
  return { id: c.id, name: c.name, label: c.label ?? '', color: c.color ?? '#7c43ba', cover: c.cover ?? '', favorite: !!c.favorite, store_id: sid };
}

function saleRow(s: Sale, sid: string) {
  return {
    id: s.id, date: s.date, product_id: s.product_id, product_name: s.product_name, actual_price: s.actual_price,
    quantity: s.quantity, profit: s.profit, payment_method: s.payment_method, seller_name: s.seller_name, store_id: sid,
  };
}

export async function upsertProducts(rows: Partial<Product>[], sid = storeId()) {
  if (!supabaseClient || !sid) return { error: new Error('Sin tienda') };
  const { error } = await supabaseClient.from('products').upsert(rows.map(r => productRow(r, sid)));
  if (error && !contentColumnsMissing && (error.code === 'PGRST204' || /content_(value|unit)/.test(error.message || ''))) {
    contentColumnsMissing = true;
    console.warn('⚠️ Falta ejecutar supabase/1-migracion-multi-tienda.sql (columnas de contenido)');
    return supabaseClient.from('products').upsert(rows.map(r => productRow(r, sid)));
  }
  return { error };
}

async function registerSaleRemote(sale: Sale, sid: string) {
  return supabaseClient!.rpc('register_sale', { p_sale: saleRow(sale, sid) });
}

/** Ejecuta una operación en la nube; si falla, la deja pendiente para sincronizar luego */
async function remote(action: PendingAction, data: unknown, run: (sid: string) => PromiseLike<{ error: unknown }>) {
  if (getState().mode !== 'cloud') return;
  const sid = storeId();
  if (!sid) return;
  if (!canUseCloud()) { addToPendingChanges(action, data); if (!getState().isOnline) toast('💾 Guardado en el dispositivo (sin conexión)'); return; }
  try {
    const { error } = await run(sid);
    if (error) { console.error('Supabase', action, error); addToPendingChanges(action, data); }
  } catch (e) {
    console.error('Supabase', action, e);
    addToPendingChanges(action, data);
  }
}

async function runPending(change: PendingChange, sid: string) {
  const c = supabaseClient!;
  switch (change.action) {
    case 'createProduct': case 'updateProduct': return upsertProducts([change.data], sid);
    case 'deleteProduct': return c.from('products').delete().eq('id', change.data).eq('store_id', sid);
    case 'createCatalog': case 'updateCatalog': return c.from('catalogs').upsert([catalogRow(change.data, sid)]);
    case 'deleteCatalog': {
      const r = await c.from('products').delete().eq('catalog_id', change.data.id).eq('store_id', sid);
      if (r.error) return r;
      return c.from('catalogs').delete().eq('id', change.data.id).eq('store_id', sid);
    }
    case 'addSale': return registerSaleRemote(change.data, sid);
    case 'createQR': return c.from('qrs').upsert([{ ...change.data, store_id: sid }]);
    case 'updateQR': return c.from('qrs').update(change.data.updates).eq('id', change.data.id);
    case 'deleteQR': return c.from('qrs').delete().eq('id', change.data);
  }
}

export async function syncPendingChanges() {
  const s = getState();
  const sid = storeId();
  if (!sid || !canUseCloud() || s.pendingChanges.length === 0 || s.isSyncing) return;
  setState({ isSyncing: true });
  const snapshot = s.pendingChanges;
  const remaining: PendingChange[] = [];
  let ok = 0;
  for (const change of snapshot) {
    try {
      const res = await runPending(change, sid);
      if (res && res.error) throw res.error;
      ok++;
    } catch (e) {
      console.error('Error sincronizando cambio:', change.action, e);
      remaining.push(change);
    }
  }
  // Conservar cambios agregados mientras se sincronizaba
  const added = getState().pendingChanges.filter(c => !snapshot.some(o => o.id === c.id));
  await savePending([...remaining, ...added]);
  if (ok > 0) toast(`✅ ${ok} cambios sincronizados`);
  if (remaining.length > 0) toast(`⚠️ ${remaining.length} cambios pendientes de sincronizar`);
  setState({ isSyncing: false });
}

async function fetchRemote(sid: string): Promise<DataSet> {
  const c = supabaseClient!;
  const [cats, prods, sales] = await Promise.all([
    c.from('catalogs').select('*').eq('store_id', sid),
    c.from('products').select('*').eq('store_id', sid),
    c.from('sales').select('*').eq('store_id', sid).order('date', { ascending: false }).limit(5000),
  ]);
  const err = cats.error || prods.error || sales.error;
  if (err) throw err;
  return { catalogs: (cats.data || []) as Catalog[], records: (prods.data || []) as Product[], sales: (sales.data || []) as Sale[] };
}

// ==========================================
// API DE DATOS
// ==========================================
export const DB = {
  saveLocal,

  /** Carga el conjunto activo: primero la copia del dispositivo y luego la nube */
  async init() {
    const id = datasetId();
    const cached = await idbGet<DataSet | null>(dataKey(id), null);
    const pending = await idbGet<PendingChange[]>(pendingKey(id), []);
    if (datasetId() !== id) return; // se cambió de tienda mientras cargaba
    setState({
      catalogs: cached?.catalogs || [], records: cached?.records || [], sales: cached?.sales || [],
      pendingChanges: getState().mode === 'cloud' ? pending : [], dataReady: true,
    });
    if (getState().mode === 'cloud') {
      await syncPendingChanges();
      await refreshData(true);
    }
  },

  async loadSampleData() {
    const catalogs: Catalog[] = [
      { id: newId(), name: 'Cosméticos y perfumes', label: 'BELLEZA', color: '#7c43ba', cover: '', favorite: false },
      { id: newId(), name: 'Electrónicos', label: 'TECNOLOGÍA', color: '#3875a5', cover: '', favorite: false },
    ];
    const base = { sold: false, image_url: '', barcode: '', offer_text: '' };
    const records: Product[] = [
      { ...base, id: newId(), name: 'Labial Matte Rojo', brand: "L'BEL", type: 'Maquillaje', category: 'Labios', cost_price: 7, sale_price: 15, min_price: 13, stock: 10, catalog_id: catalogs[0].id, description: 'Labial de larga duración.', content_value: '4', content_unit: 'g' },
      { ...base, id: newId(), name: 'Perfume Floral', brand: 'Ésika', type: 'Perfume', category: 'Fragancias', cost_price: 20, sale_price: 45, min_price: 40, stock: 3, catalog_id: catalogs[0].id, description: 'Aroma floral para el día.', content_value: '100', content_unit: 'ml' },
      { ...base, id: newId(), name: 'Audífonos Bluetooth', brand: 'Sony', type: 'Electrónico', category: 'Audio', cost_price: 22, sale_price: 42, min_price: 35, stock: 5, catalog_id: catalogs[1].id, description: 'Sonido de alta calidad.' },
    ];
    for (const c of catalogs) await this.createCatalog(c);
    for (const r of records) await this.createRecord(r);
    toast('Datos de ejemplo cargados ✓');
  },

  /** Sube muchos registros a la vez (importaciones y respaldos) */
  async bulkUpsert(catalogs: Catalog[], records: Product[]) {
    saveLocal();
    const sid = storeId();
    if (!sid) return;
    const enqueueAll = () => {
      const now = new Date().toISOString();
      const list = [...getState().pendingChanges];
      catalogs.forEach(c => list.push({ id: newId(), action: 'updateCatalog', data: c, timestamp: now }));
      records.forEach(r => list.push({ id: newId(), action: 'updateProduct', data: r, timestamp: now }));
      savePending(list);
    };
    if (!canUseCloud()) { enqueueAll(); return; }
    try {
      if (catalogs.length) {
        const r = await supabaseClient!.from('catalogs').upsert(catalogs.map(c => catalogRow(c, sid)));
        if (r.error) throw r.error;
      }
      for (let i = 0; i < records.length; i += 50) {
        const r = await upsertProducts(records.slice(i, i + 50), sid);
        if (r.error) throw r.error;
      }
    } catch (e) {
      console.error('Error subiendo datos:', e);
      enqueueAll();
    }
  },

  async createRecord(data: Omit<Product, 'id'> & { id?: string }) {
    const record = { ...data, id: data.id || newId(), barcode: data.barcode || '' } as Product;
    setState({ records: [...getState().records, record] });
    saveLocal();
    await remote('createProduct', record, sid => upsertProducts([record], sid));
    return { isOk: true, record };
  },

  async updateRecord(data: Partial<Product> & { id: string }) {
    const records = getState().records;
    const idx = records.findIndex(x => x.id === data.id);
    if (idx === -1) return { isOk: false };
    const updated = { ...records[idx], ...data };
    const next = [...records];
    next[idx] = updated;
    setState({ records: next });
    saveLocal();
    await remote('updateProduct', updated, sid => upsertProducts([updated], sid));
    return { isOk: true };
  },

  async deleteRecord(id: string) {
    setState({ records: getState().records.filter(x => x.id !== id) });
    saveLocal();
    await remote('deleteProduct', id, sid => supabaseClient!.from('products').delete().eq('id', id).eq('store_id', sid));
    return { isOk: true };
  },

  async deleteMultipleRecords(ids: string[]) {
    setState({ records: getState().records.filter(x => !ids.includes(x.id)) });
    saveLocal();
    if (getState().mode === 'cloud') {
      if (canUseCloud()) {
        const { error } = await supabaseClient!.from('products').delete().in('id', ids).eq('store_id', storeId()!);
        if (!error) return { isOk: true };
      }
      ids.forEach(id => addToPendingChanges('deleteProduct', id));
    }
    return { isOk: true };
  },

  async createCatalog(data: Omit<Catalog, 'id' | 'favorite'> & { id?: string; favorite?: boolean }) {
    const cat: Catalog = { ...data, id: data.id || 'cat_' + newId(), favorite: data.favorite ?? false };
    setState({ catalogs: [...getState().catalogs, cat] });
    saveLocal();
    await remote('createCatalog', cat, sid => supabaseClient!.from('catalogs').upsert([catalogRow(cat, sid)]));
    return { isOk: true, catalog: cat };
  },

  async updateCatalog(id: string, data: Partial<Catalog>) {
    const catalogs = getState().catalogs;
    const idx = catalogs.findIndex(x => x.id === id);
    if (idx === -1) return { isOk: false };
    const updated = { ...catalogs[idx], ...data };
    const next = [...catalogs];
    next[idx] = updated;
    setState({ catalogs: next });
    saveLocal();
    await remote('updateCatalog', updated, sid => supabaseClient!.from('catalogs').upsert([catalogRow(updated, sid)]));
    return { isOk: true };
  },

  async deleteCatalog(id: string) {
    const s = getState();
    setState({ catalogs: s.catalogs.filter(x => x.id !== id), records: s.records.filter(x => x.catalog_id !== id) });
    saveLocal();
    await remote('deleteCatalog', { id }, async sid => {
      const r = await supabaseClient!.from('products').delete().eq('catalog_id', id).eq('store_id', sid);
      if (r.error) return r;
      return supabaseClient!.from('catalogs').delete().eq('id', id).eq('store_id', sid);
    });
    return { isOk: true };
  },

  /** Registra la venta y descuenta el stock (en la nube se hace en un solo paso con register_sale) */
  async addSale(data: Omit<Sale, 'id' | 'date'>) {
    const sale: Sale = { ...data, id: 'sale_' + newId(), date: new Date().toISOString() };
    const s = getState();
    const records = s.records.map(r => (r.id === sale.product_id ? { ...r, stock: Number(r.stock) - Number(sale.quantity || 1) } : r));
    setState({ sales: [sale, ...s.sales], records });
    saveLocal();
    await remote('addSale', sale, sid => registerSaleRemote(sale, sid));
    return sale;
  },

  async replaceAll(data: DataSet) {
    setState({ catalogs: data.catalogs, records: data.records, sales: data.sales });
    await this.bulkUpsert(data.catalogs, data.records);
  },
};

export async function refreshData(quiet = false) {
  const sid = storeId();
  if (!sid) { if (!quiet) toast('Estás usando los datos de este dispositivo'); return; }
  if (!getState().isOnline) { if (!quiet) toast('⚠️ Sin conexión. Usando datos guardados.'); return; }
  if (!supabaseClient) return;
  if (!quiet) toast('🔄 Actualizando datos...');
  try {
    const remoteData = await fetchRemote(sid);
    if (storeId() !== sid) return;
    // Mantener las ventas locales que aún no se subieron
    const pendingSales = getState().pendingChanges.filter(p => p.action === 'addSale').map(p => p.data as Sale);
    setState({ ...remoteData, sales: [...pendingSales, ...remoteData.sales] });
    saveLocal();
    if (!quiet) { toast('✅ Datos actualizados desde la nube'); SoundEffects.play('success'); }
  } catch (e) {
    console.error('Error refresh:', e);
    if (!quiet) toast('❌ Error al actualizar. Usando datos guardados.');
  }
}

let syncInterval: ReturnType<typeof setInterval> | null = null;
export function startAutoSync() {
  stopAutoSync();
  syncInterval = setInterval(async () => {
    if (!canUseCloud()) return;
    try {
      if (getState().pendingChanges.length > 0) await syncPendingChanges();
      // No pisar el estado local mientras queden cambios sin subir
      if (getState().pendingChanges.length === 0) await refreshData(true);
    } catch { /* reintenta en el próximo ciclo */ }
  }, 30000);
}
export function stopAutoSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
export function startHeartbeat() {
  stopHeartbeat();
  const beat = () => { const sid = storeId(); if (sid && canUseCloud()) supabaseClient!.rpc('touch_member', { p_store: sid }).then(() => {}, () => {}); };
  beat();
  heartbeatInterval = setInterval(beat, 60000);
}
export function stopHeartbeat() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

/** Sube los datos locales a una tienda nueva (con ids nuevos para no chocar con otras tiendas) */
export async function uploadLocalToStore(sid: string) {
  const local = await idbGet<DataSet | null>(dataKey('local'), null);
  if (!local || (!local.catalogs.length && !local.records.length)) return 0;
  const catMap = new Map<string, string>();
  const catalogs = local.catalogs.map(c => { const id = 'cat_' + newId(); catMap.set(c.id, id); return { ...c, id }; });
  const records = local.records.map(r => ({ ...r, id: newId(), catalog_id: catMap.get(r.catalog_id) || r.catalog_id }));
  if (catalogs.length) {
    const { error } = await supabaseClient!.from('catalogs').upsert(catalogs.map(c => catalogRow(c, sid)));
    if (error) throw error;
  }
  for (let i = 0; i < records.length; i += 50) {
    const { error } = await upsertProducts(records.slice(i, i + 50), sid);
    if (error) throw error;
  }
  return records.length;
}
