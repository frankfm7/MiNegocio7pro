import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { getState, openModal, setState, toast, useStore } from './store';
import { closeForm, navigate, openBarcodeScanner, startQuickScanMode } from './actions';
import { DB, refreshData, syncPendingChanges } from './lib/db';
import { initSession } from './lib/session';

import WelcomeScreen from './components/WelcomeScreen';
import AccountScreen from './components/AccountScreen';
import { InstallHelpModal, useInstallEvents } from './components/InstallPrompt';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import ProductFormDrawer from './components/ProductFormDrawer';
import { ProductImageLightbox, QrLightbox } from './components/ImageLightboxes';
import CatalogsScreen from './screens/CatalogsScreen';
import ProductsScreen from './screens/ProductsScreen';
import { DailySalesScreen, LowStockScreen, OutOfStockScreen, ReportsScreen } from './screens/SalesScreens';
import { BarcodePrintModal, DetailModal, ProductQrModal, PublicProductModal, SaleModal } from './components/modals/ProductModals';
import CartModal from './components/modals/CartModal';
import { CatalogFormModal, CreateCatalogModal, ShareCatalogModal } from './components/modals/CatalogModals';
import { BackupModal, ImportExportModal, ImportPreviewModal } from './components/modals/DataModals';
import { QrItemMenuModal, QrModal } from './components/modals/QrModals';
import { BarcodeScannerModal, ImagePreviewModal, ImageSearchModal, QuickScanManualModal, QuickScanModal, SaleReceiptModal } from './components/modals/ScanModals';
import { InviteModal, TeamChangeRoleModal, TeamModal, TeamUserMenuModal } from './components/modals/TeamModals';
import { ChangePasswordModal, ContactsModal, HelpModal, UserProfileModal } from './components/modals/UserModals';

function useBodyClasses() {
  const darkMode = useStore(s => s.darkMode);
  const clientMode = useStore(s => s.clientMode);
  const role = useStore(s => s.currentUser.role);
  useEffect(() => {
    const b = document.body.classList;
    b.toggle('dark-mode', darkMode);
    b.toggle('client-mode', clientMode);
    b.toggle('not-admin', role !== 'admin' && role !== 'coadmin');
    b.toggle('modo-vendedor', role === 'vendedor');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#1a1420' : '#7c43ba');
  }, [darkMode, clientMode, role]);
}

function useConnection() {
  useEffect(() => {
    const goOnline = () => {
      setState({ isOnline: true });
      toast('✅ Conexión restaurada');
      syncPendingChanges();
      setTimeout(() => { if (getState().mode === 'cloud') refreshData(true); }, 2000);
    };
    const goOffline = () => {
      setState({ isOnline: false });
      toast('⚠️ Sin conexión. Modo offline activado.');
      DB.saveLocal();
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);
}

function useEscapeKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = getState();
      if (s.imageLightbox) { setState({ imageLightbox: null }); return; }
      s.closeAllModals();
      closeForm();
      setState({ sidebarOpen: false, qrLightbox: null });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** Botón atrás del celular: cierra visor/modales o vuelve a Catálogos */
function useBackButton() {
  const view = useStore(s => s.currentView);
  const catalogId = useStore(s => s.currentCatalogId);
  useEffect(() => {
    history.pushState({ view, catalogId }, '');
  }, [view, catalogId]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = getState();
      if (s.imageLightbox) { setState({ imageLightbox: null }); history.pushState(e.state, ''); return; }
      const st = e.state as { view?: string; catalogId?: string | null } | null;
      if (st?.view) setState({ currentView: st.view as typeof s.currentView, currentCatalogId: st.catalogId ?? null });
      else setState({ currentView: 'catalogs', currentCatalogId: null });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

function CurrentScreen() {
  const view = useStore(s => s.currentView);
  const welcome = useStore(s => s.welcomeVisible);
  if (welcome) return null;
  switch (view) {
    case 'products': return <ProductsScreen />;
    case 'daily-sales': return <DailySalesScreen />;
    case 'low-stock': return <LowStockScreen />;
    case 'out-of-stock': return <OutOfStockScreen />;
    case 'reports': return <ReportsScreen />;
    default: return <CatalogsScreen />;
  }
}

export default function App() {
  const isOnline = useStore(s => s.isOnline);
  const mode = useStore(s => s.mode);
  const updateReady = useStore(s => s.updateReady);
  useInstallEvents();
  useBodyClasses();
  useConnection();
  useEscapeKey();
  useBackButton();

  useEffect(() => {
    initSession().then(() => {
      // Accesos directos del ícono de la app (manifest "shortcuts")
      const action = new URLSearchParams(location.search).get('action');
      if (action) {
        setState({ welcomeVisible: false });
        if (action === 'vender') startQuickScanMode();
        else if (action === 'escanear') openBarcodeScanner();
        else if (action === 'buscar') openModal('image-search-modal');
        else if (action === 'ventas') navigate('daily-sales');
        history.replaceState(null, '', location.pathname);
      }
    });
  }, []);

  return (
    <>
      <div className="app-shell">
        {!isOnline && mode === 'cloud' && (
          <div id="offline-banner" className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-orange-500 to-orange-600 text-white text-center py-2 px-4 text-sm font-semibold shadow-lg">
            <WifiOff className="w-4 h-4 inline mr-2" />
            <span>Sin conexión — los cambios se guardan en el dispositivo y se sincronizan al volver internet</span>
          </div>
        )}
        {updateReady && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10002] bg-[#201728] text-white text-sm rounded-full shadow-xl pl-4 pr-1.5 py-1.5 flex items-center gap-3">
            <span>Hay una versión nueva</span>
            <button className="px-3 py-1.5 rounded-full bg-white text-[#7c43ba] font-bold" onClick={() => location.reload()}>Actualizar</button>
          </div>
        )}
        <AccountScreen />
        <WelcomeScreen />
        <Sidebar />
        <main className="main-content">
          <CurrentScreen />
        </main>
      </div>

      <BottomNav />
      <ProductFormDrawer />

      <DetailModal />
      <SaleModal />
      <CartModal />
      <CreateCatalogModal />
      <CatalogFormModal />
      <ImportExportModal />
      <BackupModal />
      <QrModal />
      <QrItemMenuModal />
      <ImageSearchModal />
      <BarcodeScannerModal />
      <BarcodePrintModal />
      <ShareCatalogModal />
      <TeamModal />
      <InviteModal />
      <TeamUserMenuModal />
      <TeamChangeRoleModal />
      <ChangePasswordModal />
      <UserProfileModal />
      <HelpModal />
      <ContactsModal />
      <ProductQrModal />
      <QuickScanModal />
      <QuickScanManualModal />
      <ImagePreviewModal />
      <SaleReceiptModal />
      <PublicProductModal />
      <ImportPreviewModal />
      <InstallHelpModal />

      <QrLightbox />
      <ProductImageLightbox />
      <Toast />
    </>
  );
}
