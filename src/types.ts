export type Role = 'admin' | 'coadmin' | 'supervisor' | 'vendedor';

export interface Product {
  id: string;
  name: string;
  brand: string;
  type: string;
  category: string;
  cost_price: number;
  sale_price: number;
  min_price: number;
  stock: number;
  sold: boolean;
  catalog_id: string;
  image_url: string;
  description: string;
  barcode: string;
  offer_text: string;
  /** Contenido / presentación: cantidad (ej. "500", "20x30") */
  content_value?: string | null;
  /** Unidad del contenido: ml, L, g, kg, cm, ... */
  content_unit?: string | null;
  /** Stock mínimo para avisar (vacío = mínimo general) */
  min_stock?: number | null;
  /** Precio que figura en el catálogo de la marca (se muestra tachado junto a tu precio) */
  catalog_price?: number | null;
  /** Código del producto en la empresa/proveedor (ej. 13014 de Ésika, 5109-20014207 de Yanbal) */
  sku?: string | null;
  /** Nombre común (ej. "Protector solar" para "Total Block"): se ve bajo el nombre y ayuda a buscar */
  common_name?: string | null;
}

export interface Catalog {
  id: string;
  name: string;
  label: string;
  color: string;
  cover: string;
  favorite: boolean;
}

export interface Sale {
  id: string;
  date: string;
  product_id: string;
  product_name: string;
  brand?: string;
  catalog_id?: string;
  cost_price?: number;
  actual_price: number;
  unit_price?: number;
  profit: number;
  quantity: number;
  payment_method: string;
  seller_id?: string;
  seller_name: string;
  seller_uid?: string;
  discount?: number;
  customer_id?: string | null;
  customer_name?: string | null;
  /** Número del recibo en el que salió esta venta */
  receipt_no?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  created_at: string;
}

/** Deuda (fiado) o pago (abono) de un cliente */
export interface CustomerMovement {
  id: string;
  customer_id: string;
  type: 'fiado' | 'abono';
  amount: number;
  method?: string;
  note?: string;
  sale_id?: string | null;
  seller_name?: string;
  date: string;
}

/** Cambio de precio de un producto */
export interface PriceChange {
  id: string | number;
  product_id: string;
  product_name: string;
  field: 'sale_price' | 'min_price' | 'cost_price';
  old_value: number | null;
  new_value: number | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface TeamPerson { name: string; avatar?: string }

export interface CloudBackup {
  id: string;
  created_at: string;
  kind: string;
  size_bytes: number | null;
  counts: { catalogs?: number; products?: number; customers?: number; sales?: number } | null;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  status: string;
}

export interface DbUser extends User {
  password: string;
  login_attempts?: number;
  blocked_until?: string | null;
  last_login?: string | null;
  last_activity?: string | null;
}

export interface QrCodeItem {
  id: string;
  user_id: string;
  image: string;
  label: string;
  is_primary: boolean;
  role_owner: boolean;
  _isOwnerQR?: boolean;
}

export interface ContactInfo {
  name: string;
  whatsapp: string;
  email: string;
  business: string;
  /** Código de país para WhatsApp (ej. 591) */
  countryCode?: string;
}

export interface CartLine {
  id: string;
  qty: number;
}

export interface QuickScanItem {
  product: Product;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  date: string;
  seller: string;
  payment: string;
  customer?: { name: string; phone: string } | null;
  items: QuickScanItem[];
  subtotal: number;
  discount: number;
  total: number;
  /** true cuando el recibo se genera después, desde el historial de ventas */
  reprint?: boolean;
  /** Número correlativo del recibo (ej. "PA7F3-000123") */
  number?: string;
  /** El número es provisional (sin conexión): se asigna el definitivo al sincronizar */
  provisional?: boolean;
  /** Datos opcionales que pide el cliente */
  extra?: ReceiptExtra;
}

export interface ReceiptExtra {
  invoice?: string;     // N° de factura
  auth?: string;        // Código de autorización
  order?: string;       // N° de pedido
  customerNit?: string; // NIT / CI del cliente
}

/** Documento emitido (recibo, cierre de caja o informe) para revisar y reenviar */
export interface DocRecord {
  kind: 'recibo' | 'cierre' | 'informe';
  code: string;
  /** Fecha de emisión (ISO) */
  date: string;
  /** Cierre: día (2026-11-04) */
  ref?: string | null;
  total?: number | null;
  by?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

/** Datos de la tienda que salen en el recibo */
export interface ReceiptSettings {
  prefix: string;
  /** Próximo número (solo informativo) */
  next?: number;
  name?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  nit?: string;
  showPhone?: boolean;
  showMobile?: boolean;
  showAddress?: boolean;
  showNit?: boolean;
}

export type PendingAction =
  | 'createProduct' | 'updateProduct' | 'deleteProduct'
  | 'createCatalog' | 'updateCatalog' | 'deleteCatalog'
  | 'addSale' | 'deleteSales' | 'issueReceipt' | 'attachReceipt' | 'createQR' | 'updateQR' | 'deleteQR'
  | 'upsertCustomer' | 'deleteCustomer' | 'addMovement' | 'deleteMovement';

export interface PendingChange {
  id: string;
  action: PendingAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  timestamp: string;
}

export type View = 'catalogs' | 'products' | 'daily-sales' | 'out-of-stock' | 'low-stock' | 'reports' | 'cash-close' | 'customers';

/** Tienda en la nube a la que pertenece el usuario */
export interface StoreMembership {
  store_id: string;
  store_name: string;
  role: Role;
  status: string;
  name: string;
  is_owner: boolean;
}

export interface StoreMember {
  store_id: string;
  user_id: string;
  role: Role;
  name: string | null;
  email: string | null;
  status: string;
  joined_at: string;
  last_seen: string | null;
  avatar_url?: string | null;
}

export interface StoreInvite {
  code: string;
  store_id: string;
  role: Role;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** URL pública de la foto de perfil (bucket "avatars" de Supabase) */
  avatar?: string;
}

/** Producto en revisión antes de importarlo */
export interface DraftProduct extends Partial<Product> {
  _key: string;
  _catalogName?: string;
  _include: boolean;
  /** Producto ya existente al que se le sumará el stock (importar factura) */
  _matchId?: string | null;
  /** Nombre tal como se leyó en la factura (cuando coincide con un producto existente) */
  _readName?: string;
  /** Valores originales de la factura (para aplicar porcentajes sin acumular) */
  _baseCost?: number;
  _baseCatalog?: number;
  /** Aviso para revisar (ej. precios que no cuadran en la factura) */
  _note?: string;
}
