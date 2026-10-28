import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Agrega al service worker la lista de archivos generados por Vite (/assets/*)
 * para que la app abra sin internet desde la primera visita, y cambia la
 * versión del caché en cada despliegue para que los celulares se actualicen.
 */
function pwaPrecache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mc7-pwa-precache',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    writeBundle(_opts, bundle) {
      const assets = Object.keys(bundle).filter(f => f.startsWith('assets/') && !f.endsWith('.map')).map(f => '/' + f).sort();
      const file = join(outDir, 'sw.js');
      const source = readFileSync(file, 'utf8');
      const version = createHash('sha1').update(assets.join('|') + source).digest('hex').slice(0, 10);
      const sw = source
        .replace(/const VERSION = '[^']*';/, `const VERSION = 'mc7-${version}';`)
        .replace('/* __ASSETS__ */', assets.map(a => `  '${a}',`).join('\n'));
      writeFileSync(file, sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), pwaPrecache()],
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'zustand'],
          supabase: ['@supabase/supabase-js'],
          scanner: ['html5-qrcode', 'qrcode', 'jsbarcode'],
          chart: ['chart.js'],
        },
      },
    },
  },
});
