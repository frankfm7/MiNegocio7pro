import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertCircle, AlertTriangle, BarChart3, BookOpen, Cloud, Download, FileUp, HelpCircle, Key, LogOut, Moon, MoreVertical,
  Package, Phone, QrCode, RefreshCw, Scan, ScanLine, ShieldCheck, ShoppingCart, Smartphone, Store, Sun, TrendingUp, Tv2, User, Users,
  Volume2, VolumeX, X,
} from 'lucide-react';
import { openAccount, openModal, setState, useStore, type ModalId } from '../store';
import { navigate, openAdminModal, openBarcodeScanner, openTeam, showWelcome, toggleDarkMode, toggleSound } from '../actions';
import { roleLabel, signOut } from '../lib/session';
import { refreshData } from '../lib/db';
import { getLowStockProducts, getOutOfStockProducts } from '../lib/selectors';
import { installApp } from './InstallPrompt';
import { APP_VERSION } from '../lib/constants';
import Brand from './Brand';
import Avatar from './Avatar';
import type { View } from '../types';

const icon = 'w-4 h-4';

function Item({ active, onClick, children, className = '' }: { active?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return <button className={`sidebar-item ${active ? 'active' : ''} ${className}`} onClick={onClick}>{children}</button>;
}

function Badge({ count, color }: { count: number; color: string }) {
  if (!count) return null;
  return <span className={`ml-auto ${color} text-white text-[10px] rounded-full px-2 py-0.5 font-bold`}>{count}</span>;
}

export default function Sidebar() {
  const open = useStore(s => s.sidebarOpen);
  const currentView = useStore(s => s.currentView);
  const currentCatalogId = useStore(s => s.currentCatalogId);
  const user = useStore(s => s.currentUser);
  const mode = useStore(s => s.mode);
  const store = useStore(s => s.activeStore);
  const authUser = useStore(s => s.authUser);
  const records = useStore(s => s.records);
  const cartQty = useStore(s => s.cart.reduce((a, x) => a + x.qty, 0));
  const isOnline = useStore(s => s.isOnline);
  const isSyncing = useStore(s => s.isSyncing);
  const pending = useStore(s => s.pendingChanges.length);
  const darkMode = useStore(s => s.darkMode);
  const soundEnabled = useStore(s => s.soundEnabled);
  const canInstall = useStore(s => !s.isStandalone);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('#user-menu-btn') && !t.closest('#user-menu-dropdown')) setMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const close = () => setState({ sidebarOpen: false });
  const go = (view: View) => navigate(view);
  // Primero cierra el sidebar, luego abre el modal con un pequeño retraso
  const later = (fn: () => void) => { close(); setTimeout(() => requestAnimationFrame(fn), 150); };
  const admin = (id: ModalId) => later(() => openAdminModal(id));
  const isActive = (v: View, all = false) => currentView === v && (v !== 'products' || (all ? !currentCatalogId : true));
  const cloud = mode === 'cloud';

  return (
    <>
      <div id="sidebar-overlay" className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={close} />
      <aside id="sidebar" className={`sidebar ${open ? 'open' : ''}`}>
        <div className="p-5 border-b border-[#e8dfec] flex items-center justify-between gap-2">
          {authUser && <button type="button" onClick={() => { close(); setTimeout(() => openModal('user-profile-modal'), 150); }} aria-label="Mi perfil"><Avatar size={48} /></button>}
          <div className="flex-1 min-w-0">
            <h1 className="hero-title font-bold text-xl text-[#201728] truncate">{cloud ? store?.store_name : <Brand />}</h1>
            <p className="text-xs text-[#756c7e] mt-1 truncate flex items-center gap-1.5" id="sidebar-user-info">
              {cloud ? <Cloud className="w-3 h-3 text-[#7c43ba]" /> : <Smartphone className="w-3 h-3 text-[#3875a5]" />}
              <span>{cloud ? `${user.name} (${roleLabel(user.role)})` : 'Datos en este dispositivo'}</span>
            </p>
            {cloud && (
              <div id="connection-status-indicator" className="flex items-center gap-1.5 mt-1">
                {isSyncing ? (
                  <><span className="w-2 h-2 rounded-full bg-blue-500 inline-block animate-pulse" /><span className="text-[10px] text-blue-600 font-semibold">Sincronizando...</span></>
                ) : isOnline ? (
                  <><span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" /><span className="text-[10px] text-green-600 font-semibold">En línea{pending ? ` · ${pending} pendientes` : ''}</span></>
                ) : (
                  <><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /><span className="text-[10px] text-orange-600 font-semibold">Sin conexión{pending ? ` · ${pending} pendientes` : ''}</span></>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {authUser && (
              <button id="user-menu-btn" className="w-9 h-9 rounded-full bg-[#f3eef6] grid place-items-center hover:bg-[#e8dfec]" aria-label="Menú de usuario" onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}>
                <MoreVertical className={icon} />
              </button>
            )}
            <button id="close-sidebar" className="w-9 h-9 rounded-full bg-[#f3eef6] grid place-items-center hover:bg-[#e8dfec]" aria-label="Cerrar menú" onClick={close}>
              <X className={icon} />
            </button>
          </div>
        </div>

        {authUser && menuOpen && (
          <div id="user-menu-dropdown" className="absolute top-20 right-4 bg-white rounded-2xl shadow-xl py-2 w-56 z-50 border border-[#e8dfec]">
            <button className="w-full text-left px-4 py-2 hover:bg-[#f6f1f8] text-sm flex items-center gap-2" onClick={() => { setMenuOpen(false); later(() => openModal('user-profile-modal')); }}>
              <User className={icon} /> Mi perfil
            </button>
            <button className="w-full text-left px-4 py-2 hover:bg-[#f6f1f8] text-sm flex items-center gap-2" onClick={() => { setMenuOpen(false); later(() => openModal('change-password-modal')); }}>
              <Key className={icon} /> Cambiar contraseña
            </button>
            {cloud && (
              <button className="w-full text-left px-4 py-2 hover:bg-[#f6f1f8] text-sm flex items-center gap-2" onClick={() => { setMenuOpen(false); refreshData(); }}>
                <RefreshCw className={icon} /> Actualizar datos
              </button>
            )}
            <div className="my-1 border-t border-[#e8dfec]" />
            <button className="w-full text-left px-4 py-2 hover:bg-[#fff0f3] text-sm text-[#a43658] flex items-center gap-2" onClick={() => { setMenuOpen(false); signOut(); }}>
              <LogOut className={icon} /> Cerrar sesión
            </button>
          </div>
        )}

        <nav className="flex-1 p-3 overflow-y-auto">
          <button type="button" onClick={() => openAccount()} className="w-full mb-3 p-3 rounded-2xl bg-gradient-to-br from-[#f6f1f8] to-[#ede1f8] text-left flex items-center gap-3 hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-white grid place-items-center shadow-sm flex-shrink-0">{cloud ? <Store className="w-5 h-5 text-[#7c43ba]" /> : <Cloud className="w-5 h-5 text-[#7c43ba]" />}</div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-[#201728] truncate">{cloud ? 'Cambiar de tienda' : authUser ? 'Conectar a una tienda' : 'Iniciar sesión'}</p>
              <p className="text-[11px] text-[#756c7e] leading-snug">{cloud ? 'O usar mis datos del dispositivo' : 'Para vendedores con código de invitación o para tener tu tienda en la nube'}</p>
            </div>
          </button>

          <p className="text-[10px] uppercase tracking-[.15em] font-bold text-[#756c7e] px-3 py-2">Principal</p>
          <Item active={isActive('catalogs')} onClick={() => go('catalogs')}><BookOpen className={icon} /> Catálogos</Item>
          <Item active={isActive('products', true)} onClick={() => go('products')}><Package className={icon} /> Todos los productos</Item>
          <Item active={isActive('daily-sales')} onClick={() => go('daily-sales')}><TrendingUp className={icon} /> Ventas del día</Item>
          <Item active={isActive('out-of-stock')} onClick={() => go('out-of-stock')}><AlertTriangle className={icon} /> Agotados <Badge count={getOutOfStockProducts(records).length} color="bg-[#a43658]" /></Item>
          <Item active={isActive('low-stock')} onClick={() => go('low-stock')}><AlertCircle className={icon} /> Stock bajo <Badge count={getLowStockProducts(records).length} color="bg-[#d97706]" /></Item>
          <Item onClick={() => { close(); openModal('cart-modal'); }}><ShoppingCart className={icon} /> Pedido actual <Badge count={cartQty} color="bg-[#c54571]" /></Item>

          <p className="text-[10px] uppercase tracking-[.15em] font-bold text-[#756c7e] px-3 py-2 mt-4">Herramientas</p>
          <Item onClick={() => later(() => openModal('qr-modal'))}><QrCode className={icon} /> QR de cobro</Item>
          <Item onClick={() => later(() => openModal('image-search-modal'))}><Scan className={icon} /> Buscar por imagen</Item>
          <Item onClick={() => later(() => openBarcodeScanner())}><ScanLine className={icon} /> Escanear código / QR</Item>
          <Item className="admin-only" onClick={() => admin('import-export-modal')}><FileUp className={icon} /> Importar / Exportar</Item>
          <Item className="admin-only" onClick={() => admin('backup-modal')}><ShieldCheck className={icon} /> Respaldo de datos</Item>
          <Item className="admin-only" onClick={() => later(openTeam)}><Users className={icon} /> Equipo e invitaciones</Item>
          <Item active={isActive('reports')} onClick={() => go('reports')}><BarChart3 className={icon} /> Informes de venta</Item>

          <p className="text-[10px] uppercase tracking-[.15em] font-bold text-[#756c7e] px-3 py-2 mt-4">Soporte</p>
          {canInstall && <Item onClick={() => later(installApp)}><Download className={icon} /> Instalar la app</Item>}
          <Item onClick={() => later(() => openModal('help-modal'))}><HelpCircle className={icon} /> Cómo usar la app</Item>
          <Item className="admin-only" onClick={() => later(() => openModal('contacts-modal'))}><Phone className={icon} /> Datos del negocio</Item>
          <Item onClick={showWelcome}><Tv2 className={icon} /> Ver bienvenida</Item>

          <p className="text-[10px] uppercase tracking-[.15em] font-bold text-[#756c7e] px-3 py-2 mt-4">Apariencia</p>
          <Item onClick={toggleDarkMode}>{darkMode ? <><Sun className={icon} /> Modo claro</> : <><Moon className={icon} /> Modo oscuro</>}</Item>
          <Item onClick={toggleSound}>{soundEnabled ? <><Volume2 className={icon} /> Sonido activado</> : <><VolumeX className={icon} /> Sonido silenciado</>}</Item>
        </nav>
        <div className="p-3 border-t border-[#e8dfec]">
          <p className="text-[10px] text-[#756c7e] px-3 py-2"><Brand /> · v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
