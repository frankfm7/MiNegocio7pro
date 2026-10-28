import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setState } from './store';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service Worker: hace la app instalable (PWA) y permite usarla sin internet
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('SW registrado:', reg.scope);
        // Buscar versiones nuevas cada hora
        setInterval(() => reg.update().catch(() => {}), 3600000);
      })
      .catch(err => console.log('SW error:', err));
    // Cuando se instala una versión nueva, ofrecer recargar
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) setState({ updateReady: true }); });
  });
}
