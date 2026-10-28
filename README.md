# Mi Catálogo 7pro · v3.0

App de catálogos, stock y ventas en **React + TypeScript + Tailwind CSS + Vite**.
Se instala como app (PWA) en Android, iPhone y computadora, y funciona sin internet.

---

## 1. Pasos en Supabase (una sola vez)

1. **SQL Editor → New query**: pega y ejecuta `supabase/1-migracion-multi-tienda.sql`.
   - Crea tiendas, miembros e invitaciones, y separa los datos de cada tienda.
   - Activa la seguridad (RLS): quien descargue la app **sin cuenta no ve ningún dato tuyo**.
   - Bloquea la tabla antigua `users` (guardaba contraseñas sin cifrar).
2. **Authentication → Providers → Email**: déjalo activado.
   (Opcional: desactiva *Confirm email* si no quieres que tus vendedores confirmen el correo.)
3. **Authentication → URL Configuration**: en *Site URL* pon la dirección de tu app en Vercel
   (ej. `https://mi-catalogo-7pro.vercel.app`) y agrégala también en *Redirect URLs*.
4. Abre la app → menú → **Iniciar sesión → Crear cuenta** con tu correo → **Crear mi propia tienda**.
5. Ejecuta `supabase/2-mover-mis-datos.sql` cambiando `TU_CORREO@ejemplo.com` por tu correo:
   tus catálogos, productos, ventas y QR actuales pasan a tu tienda.
6. Tus vendedores: menú → **Equipo e invitaciones → Invitar** → envías el código/enlace por WhatsApp.
   Ellos crean su cuenta con su correo y quedan unidos a tu tienda.

> ⚠️ Al ejecutar el paso 1 la versión anterior de la app deja de ver los datos. Publica esta versión el mismo día.

## 2. Cómo funciona (modos de datos)

| Situación | Qué ve |
|---|---|
| Alguien descarga la app y no inicia sesión | Una app vacía con todas las funciones. Sus catálogos quedan **solo en su dispositivo**. |
| Tu vendedor inicia sesión y escribe tu código | Tus catálogos. Puede vender, pero no ve costos ni edita (según el rol). |
| Otro comerciante crea su propia tienda | Solo sus datos; puede invitar a sus propios vendedores. No ve los tuyos ni tú los suyos. |

Roles: **Administrador** (dueño), **Co-Administrador**, **Supervisor** y **Vendedor**.

## 3. Instalar como app (PWA)

Publicada en Vercel (https), Chrome ofrece **“Instalar aplicación”**. Además, la app muestra su
propio botón **Instalar** y en iPhone explica cómo usar *Compartir → Agregar a inicio*.

Archivos de la PWA:
- `public/manifest.json`: nombre, colores, íconos, accesos directos y capturas.
- `public/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.svg`, `favicon-32.png`
- `public/screenshots/`: capturas que muestra Android al instalar.
- `public/sw.js`: service worker. Guarda la app para abrirla sin internet. Al compilar, `vite.config.ts` le agrega la lista de archivos.
- `index.html`: enlaces al manifest, `theme-color` e íconos.
- `src/main.tsx`: registra el service worker y avisa cuando hay una versión nueva.

**Play Store**: entra a https://www.pwabuilder.com con la dirección de tu app y genera el paquete Android (TWA).

## 4. Funciones nuevas

- **QR de productos**: cualquier lector de QR muestra solo nombre, marca, contenido y precio (nunca costos).
  Con la app, el QR abre el producto al instante. Escanea con la cámara o **desde una foto**.
- **Imprimir todos los QR** de un catálogo en PDF (menú ⋮ del catálogo o Importar/Exportar).
- **Fotos**: cámara con marco vertical (los perfumes se ven completos), linterna y cambio de cámara,
  encuadre automático de fotos de galería y vista en pantalla completa al tocar la foto.
- **Contenido / Presentación**: ml, L, g, kg, cm, etc.
- **Exportar**: Excel con fotos, PDF para clientes (sin costos), PDF de inventario (con costos),
  QR en PDF, JSON (respaldo exacto) y CSV.
- **Importar**: Excel (lee las fotos incrustadas), PDF (los PDF de la app traen todos los datos y fotos;
  de otros PDF se lee el texto), JSON, CSV, **varias fotos** (un producto por foto) y
  **foto de una lista de precios** (lee el texto con OCR). Siempre ves una lista para revisar antes de guardar.
- **Buscador inteligente**: sin acentos, palabras en cualquier orden, a medio escribir y con errores de tipeo.
- **Buscar por foto**: combina código de barras/QR, parecido visual (red neuronal MobileNet, incluida en la app),
  el texto de la etiqueta (OCR) y los colores.

## 5. Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
npm run preview    # prueba la versión final (con service worker) en http://localhost:4173
```

Subir a GitHub (Vercel publica solo):

```bash
git add .
git commit -m "Mi Catálogo 7pro v3: PWA instalable, multi-tienda, QR, importar/exportar"
git push
```

## 6. Estructura

```
src/
  App.tsx, main.tsx        Pantallas, modales y registro del service worker
  store.ts                 Estado global (zustand)
  actions.ts               Acciones (carrito, ventas, escáner, navegación)
  lib/session.ts           Cuentas, tiendas, invitaciones y equipo (Supabase Auth)
  lib/db.ts                Datos locales (IndexedDB) / nube, sincronización sin internet
  lib/io.ts                Importar / exportar (Excel, PDF, JSON, CSV, fotos, OCR)
  lib/qr.ts                QR de productos y QR de cobro
  lib/search.ts            Buscador tolerante a errores
  lib/imageSearch.ts       Búsqueda por foto
  lib/camera.ts            Cámara con marco guía
  components/, screens/    Interfaz
public/                    PWA (manifest, sw.js, íconos), modelo visual y OCR
supabase/                  Scripts SQL
```
