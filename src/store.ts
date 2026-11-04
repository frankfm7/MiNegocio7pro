import { create } from 'zustand';
import type {
  AuthUser, CartLine, Catalog, ContactInfo, Customer, CustomerMovement, DraftProduct, PendingChange, PriceChange, Product,
  QuickScanItem, ReceiptData, Sale, StoreMembership, TeamPerson, User, View, ReceiptSettings } from './types';
import { CONTACT_KEY, WELCOME_KEY } from './lib/constants';
import { readJSON } from './lib/format';

export type ModalId =
  | 'detail-modal' | 'sale-modal' | 'cart-modal' | 'create-catalog-modal' | 'catalog-modal'
  | 'import-export-modal' | 'backup-modal' | 'qr-modal' | 'qr-item-menu-modal' | 'image-search-modal'
  | 'barcode-scanner-modal' | 'barcode-print-modal' | 'share-catalog-modal' | 'team-modal'
  | 'invite-modal' | 'team-user-menu-modal' | 'team-change-role-modal' | 'change-password-modal'
  | 'user-profile-modal' | 'help-modal' | 'contacts-modal' | 'product-qr-modal' | 'quick-scan-modal'
  | 'quick-scan-manual-modal' | 'documents-modal' | 'nota-modal' | 'image-preview-modal' | 'sale-receipt-modal' | 'public-product-modal'
  | 'import-preview-modal' | 'install-help-modal' | 'customer-form-modal' | 'customer-detail-modal' | 'movement-modal'
  | 'price-history-modal' | 'labels-modal' | 'public-shop-modal';

/** Información pública que lleva el QR de un producto */
export interface PublicProductData {
  id?: string;
  n: string; b?: string; t?: string; c?: string; d?: string; o?: string; img?: string; cv?: string; p?: string; s?: string;
}

export type AccountStep = 'auth' | 'stores';

interface State {
  // Datos del conjunto activo (local o tienda)
  records: Product[];
  catalogs: Catalog[];
  sales: Sale[];
  customers: Customer[];
  movements: CustomerMovement[];
  /** Historial de precios guardado en el dispositivo (modo local) */
  priceHistory: PriceChange[];
  /** Equipo de la tienda activa: id de usuario → nombre y foto */
  team: Record<string, TeamPerson>;
  pendingChanges: PendingChange[];
  dataReady: boolean;

  // Modo de trabajo
  mode: 'local' | 'cloud';
  activeStore: StoreMembership | null;
  authUser: AuthUser | null;
  memberships: StoreMembership[];
  /** Usuario efectivo: en modo local es el dueño del dispositivo */
  currentUser: User;

  currentCatalogId: string | null;
  currentView: View;
  query: string;
  globalQuery: string;
  cart: CartLine[];
  clientMode: boolean;
  contactInfo: ContactInfo | null;
  darkMode: boolean;
  soundEnabled: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  selectedPaymentMethod: string;
  /** Cliente elegido cuando el pago es "Fiado" */
  saleCustomerId: string;
  /** Mínimo general de stock para avisar (por dispositivo) */
  lowStockDefault: number;
  /** Productos cuyo aviso de agotado / stock bajo ya se ocultó (vuelve a avisar si se repone y baja otra vez) */
  stockHidden: { out: string[]; low: string[] };

  // UI
  modals: Partial<Record<ModalId, boolean>>;
  sidebarOpen: boolean;
  formOpen: boolean;
  welcomeVisible: boolean;
  accountVisible: boolean;
  accountStep: AccountStep;
  accountReason: string;
  pendingInviteCode: string;
  toastMsg: string;
  toastShow: boolean;
  installPrompt: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null;
  isStandalone: boolean;
  updateReady: boolean;

  // Datos de los modales
  detail: Product | null;
  saleProduct: Product | null;
  editing: Product | null;
  editingCatalogId: string | null;
  imageLightbox: { src: string; alt: string } | null;
  qrLightbox: { src: string; label: string } | null;
  quickScanMode: boolean;
  quickScanItems: QuickScanItem[];
  quickScanDiscount: number;
  receiptData: ReceiptData | null;
  /** Recibo ya cobrado al que se le están agregando más productos ("Agregar más productos") */
  receiptCarry: ReceiptData | null;
  /** Búsqueda inicial en "Recibos y cierres" */
  docsQuery: string;
  /** Productos elegidos (pulsación larga) para la Nota de venta */
  notaSel: string[];
  /** Código y datos de la tienda para los recibos */
  receiptSettings: ReceiptSettings;
  previewImage: { dataUrl: string; filename: string } | null;
  barcodeScanTarget: 'form' | 'quick-scan' | null;
  scannedBarcodeForForm: string | null;
  publicProduct: PublicProductData | null;
  customerId: string | null;
  /** Producto preseleccionado para imprimir su etiqueta */
  labelProductId: string | null;
  movementDraft: { customerId: string; type: 'fiado' | 'abono' } | null;
  priceHistoryProduct: Product | null;
  share: { text: string; catalog: Catalog } | null;
  barcodeProduct: Product | null;
  qrProduct: { product: Product; image: string } | null;
  imageSearch: {
    preview: string | null;
    status: string;
    results: { record: Product; similarity: number; reason: string }[] | null;
  };
  /** Moneda elegida (sirve para volver a dibujar la app al cambiarla) */
  appCurrency: string;
  importPreview: {
    source: string;
    items: DraftProduct[];
    catalogs: Catalog[];
    /** 'auto' = según el archivo, 'new' = catálogo nuevo, o el id de un catálogo existente */
    target: string;
    newCatalogName: string;
    /** Datos de la factura / detalle de pedido leído de una foto */
    invoice?: {
      vendor: string;
      /** Moneda de la factura (USD, Bs...) */
      currency: string;
      /** Tipo de cambio Bs por 1 USD (detectado o el último usado) */
      rate: number;
      /** Convertir los precios a la moneda de la app */
      convert: boolean;
      totals: string[];
    };
  } | null;
}

interface Actions {
  set: (partial: Partial<State>) => void;
  openModal: (id: ModalId) => void;
  closeModal: (id: ModalId) => void;
  closeAllModals: () => void;
  isAdmin: () => boolean;
}

export function localUser(contact: ContactInfo | null): User {
  return { id: 'local', name: contact?.name || 'Yo', username: '', email: contact?.email || '', phone: contact?.whatsapp || '', role: 'admin', status: 'active' };
}

const contactInfo = readJSON<ContactInfo | null>(CONTACT_KEY, null);

export const useStore = create<State & Actions>((set, get) => ({
  records: [],
  catalogs: [],
  sales: [],
  customers: [],
  movements: [],
  priceHistory: [],
  team: {},
  pendingChanges: [],
  dataReady: false,

  mode: 'local',
  activeStore: null,
  authUser: null,
  memberships: [],
  currentUser: localUser(contactInfo),

  currentCatalogId: null,
  currentView: 'catalogs',
  query: '',
  globalQuery: '',
  cart: [],
  clientMode: false,
  contactInfo,
  darkMode: localStorage.getItem('dark_mode') === 'true',
  soundEnabled: localStorage.getItem('sound_enabled') !== 'false',
  isOnline: navigator.onLine,
  isSyncing: false,
  selectedPaymentMethod: 'Efec.',
  saleCustomerId: '',
  lowStockDefault: Math.max(0, parseInt(localStorage.getItem('mc7_low_default') || '3', 10) || 0),
  stockHidden: readJSON<{ out: string[]; low: string[] }>('mn7_stock_hidden', { out: [], low: [] }),

  modals: {},
  sidebarOpen: false,
  formOpen: false,
  welcomeVisible: sessionStorage.getItem(WELCOME_KEY) !== 'true',
  accountVisible: false,
  accountStep: 'auth',
  accountReason: '',
  pendingInviteCode: '',
  toastMsg: '',
  toastShow: false,
  installPrompt: null,
  isStandalone: window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true,
  updateReady: false,

  detail: null,
  saleProduct: null,
  editing: null,
  editingCatalogId: null,
  imageLightbox: null,
  qrLightbox: null,
  quickScanMode: false,
  quickScanItems: [],
  quickScanDiscount: 0,
  receiptData: null,
  receiptCarry: null,
  docsQuery: '',
  notaSel: [],
  receiptSettings: readJSON<ReceiptSettings>('mn7_receipt_cfg_local', { prefix: '' }),
  previewImage: null,
  barcodeScanTarget: null,
  scannedBarcodeForForm: null,
  publicProduct: null,
  customerId: null,
  labelProductId: null,
  movementDraft: null,
  priceHistoryProduct: null,
  share: null,
  barcodeProduct: null,
  qrProduct: null,
  imageSearch: { preview: null, status: '', results: null },
  importPreview: null,
  appCurrency: (() => { try { return localStorage.getItem('mn7_currency') || 'USD'; } catch { return 'USD'; } })(),

  set: partial => set(partial),
  openModal: id => set(s => ({ modals: { ...s.modals, [id]: true } })),
  closeModal: id => set(s => ({ modals: { ...s.modals, [id]: false } })),
  closeAllModals: () => set({ modals: {} }),
  isAdmin: () => {
    const u = get().currentUser;
    return u.role === 'admin' || u.role === 'coadmin';
  },
}));

/** Acceso directo al estado fuera de React */
export const getState = () => useStore.getState();
export const setState = (partial: Partial<State>) => useStore.setState(partial);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, duration = 2600) {
  setState({ toastMsg: msg, toastShow: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toastShow: false }), duration);
}

export function openModal(id: ModalId) { getState().openModal(id); }
export function closeModal(id: ModalId) { getState().closeModal(id); }
export function isModalOpen(id: ModalId) { return !!getState().modals[id]; }

let afterAccount: (() => void) | null = null;

/** Abre la pantalla de cuenta (iniciar sesión / conectar a una tienda). `then` se ejecuta al conectarse. */
export function openAccount(reason = '', then?: () => void) {
  afterAccount = then || null;
  const step: AccountStep = getState().authUser ? 'stores' : 'auth';
  setState({ accountVisible: true, accountStep: step, accountReason: reason, sidebarOpen: false });
}
export function runAfterAccount() {
  const fn = afterAccount;
  afterAccount = null;
  fn?.();
}
