import type { Catalog, Customer, CustomerMovement, PendingAction, PendingChange, PriceChange, Product, Sale } from '../types';
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

interface DataSet {
  catalogs: Catalog[]; records: Product[]; sales: Sale[];
  customers?: Customer[]; movements?: CustomerMovement[]; priceHistory?: PriceChange[];
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Guarda (con un pequeño retraso para agrupar cambios) el conjunto activo en el dispositivo */
function saveLocal() {
  const id = datasetId();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { catalogs, records, sales, customers, movements, priceHistory } = getState();
    idbSet(dataKey(id), { catalogs, records, sales, customers, movements, priceHistory } satisfies DataSet);
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
// Columnas que se agregaron con migraciones nuevas. Si la base de datos todavía no las
// tiene, la app sigue funcionando sin ellas (y avisa en la consola).
const OPTIONAL_PRODUCT_FIELDS = ['content_value', 'content_unit', 'min_stock', 'catalog_price', 'sku'] as const;
const missingColumns = new Set<string>();

function productRow(p: Partial<Product>, sid: string) {
  const row: Record<string, unknown> = {
    id: p.id, name: p.name, brand: p.brand ?? '', type: p.type ?? '', category: p.category ?? '',
    cost_price: Number(p.cost_price) || 0, sale_price: Number(p.sale_price) || 0, min_price: Number(p.min_price) || 0,
    stock: Number(p.stock) || 0, sold: !!p.sold, catalog_id: p.catalog_id ?? '', image_url: p.image_url ?? '',
    description: p.description ?? '', barcode: p.barcode ?? '', offer_text: p.offer_text ?? '',
    content_value: p.content_value ?? '', content_unit: p.content_unit ?? '',
    min_stock: p.min_stock === undefined || p.min_stock === null || String(p.min_stock) === '' ? null : Number(p.min_stock),
    catalog_price: p.catalog_price === undefined || p.catalog_price === null || String(p.catalog_price) === '' ? null : Number(p.catalog_price),
    sku: p.sku ?? '',
    store_id: sid,
  };
  missingColumns.forEach(f => delete row[f]);
  return row;
}

function catalogRow(c: Partial<Catalog>, sid: string) {
  return { id: c.id, name: c.name, label: c.label ?? '', color: c.color ?? '#7c43ba', cover: c.cover ?? '', favorite: !!c.favorite, store_id: sid };
}

function saleRow(s: Sale, sid: string) {
  return {
    id: s.id, date: s.date, product_id: s.product_id, product_name: s.product_name, actual_price: s.actual_price,
    quantity: s.quantity, profit: s.profit, payment_method: s.payment_method, seller_name: s.seller_name, store_id: sid,
    customer_id: s.customer_id ?? null, customer_name: s.customer_name ?? null,
  };
}

export async function upsertProducts(rows: Partial<Product>[], sid = storeId()) {
  if (!supabaseClient || !sid) return { error: new Error('Sin tienda') };
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await supabaseClient.from('products').upsert(rows.map(r => productRow(r, sid)));
    if (!error) return { error: null };
    // "Could not find the 'min_stock' column of 'products'": se omite esa columna y se reintenta
    const col = /'(\w+)' column/.exec(error.message || '')?.[1];
    const known = (OPTIONAL_PRODUCT_FIELDS as readonly string[]).includes(col || '');
    if (!(error.code === 'PGRST204' || known) || !col || !known || missingColumns.has(col)) return { error };
    missingColumns.add(col);
    console.warn(`⚠️ Falta la columna products.${col}: ejecuta el SQL de supabase/ (1, 5 y 6)`);
  }
  return { error: new Error('No se pudo guardar el producto') };
}

const customerRow = (c: Customer, sid: string) => ({ id: c.id, name: c.name, phone: c.phone || '', notes: c.notes || '', created_at: c.created_at, store_id: sid });
const movementRow = (m: CustomerMovement, sid: string) => ({
  id: m.id, customer_id: m.customer_id, type: m.type, amount: m.amount, method: m.method || null, note: m.note || null,
  sale_id: m.sale_id || null, seller_name: m.seller_name || null, date: m.date, seller_uid: getState().authUser?.id ?? null, store_id: sid,
});

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
    case 'upsertCustomer': return c.from('customers').upsert([customerRow(change.data, sid)]);
    case 'deleteCustomer': {
      const r = await c.from('customer_movements').delete().eq('customer_id', change.data).eq('store_id', sid);
      if (r.error) return r;
      return c.from('customers').delete().eq('id', change.data).eq('store_id', sid);
    }
    case 'addMovement': return c.from('customer_movements').upsert([movementRow(change.data, sid)]);
    case 'deleteMovement': return c.from('customer_movements').delete().eq('id', change.data).eq('store_id', sid);
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
  let dropped = 0;
  for (const change of snapshot) {
    try {
      const res = await runPending(change, sid);
      if (res && res.error) throw res.error;
      ok++;
    } catch (e) {
      // Tabla que aún no existe (falta ejecutar el SQL 5): no se reintenta eternamente
      const err = e as { code?: string; message?: string };
      if (/customer/.test(change.action.toLowerCase()) || change.action === 'addMovement' || change.action === 'deleteMovement') {
        if (err.code === 'PGRST205' || err.code === '42P01' || /schema cache|does not exist/i.test(err.message || '')) {
          console.warn('Falta ejecutar supabase/5-mejoras.sql (clientes y fiados)');
          dropped++;
          continue;
        }
      }
      console.error('Error sincronizando cambio:', change.action, e);
      remaining.push(change);
    }
  }
  // Conservar cambios agregados mientras se sincronizaba
  const added = getState().pendingChanges.filter(c => !snapshot.some(o => o.id === c.id));
  await savePending([...remaining, ...added]);
  if (ok > 0) toast(`✅ ${ok} cambios sincronizados`);
  if (dropped > 0) toast('⚠️ Clientes y fiados solo se guardaron en este dispositivo: falta ejecutar supabase/5-mejoras.sql', 6000);
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
  // Clientes y fiados: si aún no se ejecutó el SQL 5, la app sigue funcionando sin ellos
  const [custs, movs] = await Promise.all([
    c.from('customers').select('*').eq('store_id', sid),
    c.from('customer_movements').select('*').eq('store_id', sid).order('date', { ascending: false }).limit(10000),
  ]);
  return {
    catalogs: (cats.data || []) as Catalog[], records: (prods.data || []) as Product[], sales: (sales.data || []) as Sale[],
    customers: custs.error ? undefined : (custs.data || []) as Customer[],
    movements: movs.error ? undefined : (movs.data || []) as CustomerMovement[],
  };
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
      customers: cached?.customers || [], movements: cached?.movements || [], priceHistory: cached?.priceHistory || [],
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
    const before = records[idx];
    const updated = { ...before, ...data };
    const next = [...records];
    next[idx] = updated;
    setState({ records: next });
    // En modo local el historial de precios se guarda aquí; en una tienda lo escribe la base de datos
    if (getState().mode !== 'cloud') {
      const changes: PriceChange[] = [];
      (['sale_price', 'min_price', 'cost_price'] as const).forEach(field => {
        if (Number(before[field] || 0) !== Number(updated[field] || 0)) {
          changes.push({ id: newId(), product_id: updated.id, product_name: updated.name, field, old_value: Number(before[field] || 0), new_value: Number(updated[field] || 0), changed_by_name: getState().currentUser.name, changed_at: new Date().toISOString() });
        }
      });
      if (changes.length) setState({ priceHistory: [...changes, ...getState().priceHistory].slice(0, 3000) });
    }
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

  // ---------- Clientes y fiados ----------
  async upsertCustomer(data: Partial<Customer> & { name: string }) {
    const list = getState().customers;
    const prev = data.id ? list.find(c => c.id === data.id) : undefined;
    const customer: Customer = { id: data.id || 'cus_' + newId(), name: data.name.trim(), phone: (data.phone || '').trim(), notes: (data.notes || '').trim(), created_at: prev?.created_at || new Date().toISOString() };
    setState({ customers: prev ? list.map(c => (c.id === customer.id ? customer : c)) : [...list, customer] });
    saveLocal();
    await remote('upsertCustomer', customer, sid => supabaseClient!.from('customers').upsert([customerRow(customer, sid)]));
    return customer;
  },

  async deleteCustomer(id: string) {
    setState({ customers: getState().customers.filter(c => c.id !== id), movements: getState().movements.filter(m => m.customer_id !== id) });
    saveLocal();
    await remote('deleteCustomer', id, async sid => {
      const r = await supabaseClient!.from('customer_movements').delete().eq('customer_id', id).eq('store_id', sid);
      if (r.error) return r;
      return supabaseClient!.from('customers').delete().eq('id', id).eq('store_id', sid);
    });
  },

  async addMovement(data: Omit<CustomerMovement, 'id' | 'date' | 'seller_name'> & { id?: string }) {
    const m: CustomerMovement = { ...data, id: data.id || 'mov_' + newId(), date: new Date().toISOString(), seller_name: getState().currentUser.name };
    setState({ movements: [m, ...getState().movements] });
    saveLocal();
    await remote('addMovement', m, sid => supabaseClient!.from('customer_movements').upsert([movementRow(m, sid)]));
    return m;
  },

  async deleteMovement(id: string) {
    setState({ movements: getState().movements.filter(m => m.id !== id) });
    saveLocal();
    await remote('deleteMovement', id, sid => supabaseClient!.from('customer_movements').delete().eq('id', id).eq('store_id', sid));
  },

  async replaceAll(data: DataSet) {
    setState({ catalogs: data.catalogs, records: data.records, sales: data.sales });
    await this.bulkUpsert(data.catalogs, data.records);
    if (data.customers || data.movements) {
      setState({ customers: data.customers || [], movements: data.movements || [] });
      saveLocal();
      if (getState().mode === 'cloud') {
        (data.customers || []).forEach(c => addToPendingChanges('upsertCustomer', c));
        (data.movements || []).forEach(m => addToPendingChanges('addMovement', m));
        await syncPendingChanges();
      }
    }
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
    const pending = getState().pendingChanges;
    const pendingSales = pending.filter(p => p.action === 'addSale').map(p => p.data as Sale);
    const s0 = getState();
    // Clientes y fiados aún sin subir se conservan; si la nube no tiene esas tablas se deja lo local
    const pendingCustomers = pending.filter(p => p.action === 'upsertCustomer').map(p => p.data as Customer);
    const pendingMovs = pending.filter(p => p.action === 'addMovement').map(p => p.data as CustomerMovement);
    const customers = remoteData.customers
      ? [...remoteData.customers.filter(c => !pendingCustomers.some(p => p.id === c.id)), ...pendingCustomers] : s0.customers;
    const movements = remoteData.movements
      ? [...pendingMovs.filter(m => !remoteData.movements!.some(r => r.id === m.id)), ...remoteData.movements] : s0.movements;
    setState({ catalogs: remoteData.catalogs, records: remoteData.records, sales: [...pendingSales, ...remoteData.sales], customers, movements });
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
