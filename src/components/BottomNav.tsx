import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Database, Download, FolderPlus, PackagePlus, QrCode, Share2, ShoppingCart, TrendingUp, Upload } from 'lucide-react';
import { getState, openModal, useStore } from '../store';
import { navigate, openAdminModal, openCatalogForm, openForm, shareCatalogByLink, startQuickScanMode } from '../actions';
import { toast } from '../store';

export default function BottomNav() {
  const currentView = useStore(s => s.currentView);
  const isAdmin = useStore(s => s.isAdmin());
  const [datosOpen, setDatosOpen] = useState(false);

  useEffect(() => {
    if (!datosOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-action="open-datos-menu"]') && !t.closest('#bottom-datos-dropdown')) setDatosOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [datosOpen]);

  const cls = (view?: string) => `nav-action grid place-items-center gap-0.5 text-[10px] ${view && currentView === view ? 'active-nav text-[#7c43ba] font-bold' : ''}`;
  const pick = (fn: () => void) => () => { setDatosOpen(false); fn(); };

  return (
    <>
      <nav className={`bottom-nav fixed bottom-0 inset-x-0 z-30 h-16 grid ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'} items-center text-[#716879] lg:hidden`} aria-label="Navegación">
        <button className={cls()} type="button" onClick={() => openModal('qr-modal')}><QrCode className="w-5 h-5" />QR</button>
        <button className={cls('daily-sales')} type="button" onClick={() => navigate('daily-sales')}><TrendingUp className="w-5 h-5" />Ventas</button>
        <button className={cls('catalogs')} type="button" onClick={() => navigate('catalogs')}><BookOpen className="w-6 h-6" />Catálogo</button>
        <button className={cls()} type="button" onClick={startQuickScanMode}><ShoppingCart className="w-5 h-5" />Vender</button>
        <button className={cls('reports')} type="button" onClick={() => navigate('reports')}><BarChart3 className="w-5 h-5" />Informes</button>
        <button className={`${cls()} admin-only`} data-action="open-datos-menu" type="button" onClick={() => setDatosOpen(o => !o)}><Database className="w-5 h-5" />Datos</button>
      </nav>

      <div id="bottom-datos-dropdown" className={`${datosOpen ? '' : 'hidden'} fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-white rounded-2xl shadow-2xl py-2 w-64 z-50 border border-[#e8dfec]`}>
        <button className="w-full text-left px-4 py-2.5 hover:bg-[#f6f1f8] text-sm flex items-center gap-2 border-b border-[#e8dfec]" onClick={pick(() => openCatalogForm())}>
          <FolderPlus className="w-4 h-4 text-[#7c43ba]" /> Crear catálogo
        </button>
        <button className="w-full text-left px-4 py-2.5 hover:bg-[#f6f1f8] text-sm flex items-center gap-2 border-b border-[#e8dfec]" onClick={pick(() => openForm())}>
          <PackagePlus className="w-4 h-4 text-[#23805d]" /> Añadir producto
        </button>
        <button className="w-full text-left px-4 py-2.5 hover:bg-[#f6f1f8] text-sm flex items-center gap-2 border-b border-[#e8dfec]" onClick={pick(() => openAdminModal('import-export-modal'))}>
          <Upload className="w-4 h-4 text-[#3875a5]" /> Importar archivo
        </button>
        <button className="w-full text-left px-4 py-2.5 hover:bg-[#f6f1f8] text-sm flex items-center gap-2 border-b border-[#e8dfec]" onClick={pick(() => openAdminModal('import-export-modal'))}>
          <Download className="w-4 h-4 text-[#d97706]" /> Exportar datos
        </button>
        <button className="w-full text-left px-4 py-2.5 hover:bg-[#f6f1f8] text-sm flex items-center gap-2" onClick={pick(() => {
          const id = getState().currentCatalogId;
          if (id) shareCatalogByLink(id); else toast('Abre un catálogo para compartirlo');
        })}>
          <Share2 className="w-4 h-4 text-[#25D366]" /> Compartir archivo
        </button>
      </div>
    </>
  );
}
