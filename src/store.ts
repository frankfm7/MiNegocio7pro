import { create } from 'zustand';
import type {
  AuthUser, CartLine, Catalog, ContactInfo, DraftProduct, PendingChange, Product, QuickScanItem, ReceiptData, Sale,
  StoreMembership, User, View,
} from './types';
import { CONTACT_KEY, WELCOME_KEY } from './lib/constants';
import { readJSON } from './lib/format';

export type ModalId =
  | 'detail-modal' | 'sale-modal' | 'cart-modal' | 'create-catalog-modal' | 'catalog-modal'
  | 'import-export-modal' | 'backup-modal' | 'qr-modal' | 'qr-item-menu-modal' | 'image-search-modal'
  | 'barcode-scanner-modal' | 'barcode-print-modal' | 'share-catalog-modal' | 'team-modal'
  | 'invite-modal' | 'team-user-menu-modal' | 'team-change-role-modal' | 'change-password-modal'
  | 'user-profile-modal' | 'help-modal' | 'contacts-modal' | 'product-qr-modal' | 'quick-scan-modal'
  | 'quick-scan-manual-modal' | 'image-preview-modal' | 'sale-receipt-modal' | 'public-product-modal'
  | 'import-preview-modal' | 'install-help-modal';

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
  previewImage: { dataUrl: string; filename: string } | null;
  barcodeScanTarget: 'form' | 'quick-scan' | null;
  scannedBarcodeForForm: string | null;
  publicProduct: PublicProductData | null;
  share: { text: string; catalog: Catalog } | null;
  barcodeProduct: Product | null;
  qrProduct: { product: Product; image: string } | null;
  imageSearch: {
    preview: string | null;
    status: string;
    results: { record: Product; similarity: number; reason: string }[] | null;
  };
  importPreview: {
    source: string;
    items: DraftProduct[];
    catalogs: Catalog[];
    /** 'auto' = según el archivo, 'new' = catálogo nuevo, o el id de un catálogo existente */
    target: string;
    newCatalogName: string;
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

  modals: {},
  sidebarOpen: false,
  formOpen: false,
  welcomeVisible: localStorage.getItem(WELCOME_KEY) !== 'true',
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
  previewImage: null,
  barcodeScanTarget: null,
  scannedBarcodeForForm: null,
  publicProduct: null,
  share: null,
  barcodeProduct: null,
  qrProduct: null,
  imageSearch: { preview: null, status: '', results: null },
  importPreview: null,

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
