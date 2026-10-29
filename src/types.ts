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
  discount?: number;
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
  items: QuickScanItem[];
  subtotal: number;
  discount: number;
  total: number;
}

export type PendingAction =
  | 'createProduct' | 'updateProduct' | 'deleteProduct'
  | 'createCatalog' | 'updateCatalog' | 'deleteCatalog'
  | 'addSale' | 'createQR' | 'updateQR' | 'deleteQR';

export interface PendingChange {
  id: string;
  action: PendingAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  timestamp: string;
}

export type View = 'catalogs' | 'products' | 'daily-sales' | 'out-of-stock' | 'low-stock' | 'reports';

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
}
