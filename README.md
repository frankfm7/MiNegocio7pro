# MiNegocio7pro · v3.2

App de catálogos, stock y ventas en **React + TypeScript + Tailwind CSS + Vite**.
Se instala como app (PWA) en Android, iPhone y computadora, y funciona sin internet.

---

## 1. Pasos en Supabase (proyecto NUEVO, una sola vez)

1. Entra a https://supabase.com → **New project** (nombre: `minegocio7pro`).
2. **Project Settings → API**: copia la **Project URL** y la clave **publishable / anon**.
3. **SQL Editor → New query**: pega y ejecuta `supabase/1-migracion-multi-tienda.sql`
   (tablas, tiendas, invitaciones y seguridad RLS). `2-mover-mis-datos.sql` solo se usa si
   vienes de la app anterior con datos; en un proyecto nuevo se omite.
4. **Authentication → URL Configuration**: *Site URL* = la dirección de tu app en Vercel
   (ej. `https://minegocio7pro.vercel.app`) y agrégala también en *Redirect URLs*
   (agrega además `http://localhost:5173` para probar en tu computadora).
5. **Iniciar sesión con Google (la foto de perfil sale de tu cuenta de Google):**
   1. https://console.cloud.google.com → crea un proyecto → **APIs y servicios → Pantalla de consentimiento OAuth**
      (tipo Externo; nombre de la app `MiNegocio7pro`, tu correo).
   2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
      En *URI de redireccionamiento autorizados* pega: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
      (Supabase → Authentication → Providers → Google te muestra esa URL).
   3. Copia el **Client ID** y el **Client Secret**.
   4. Supabase → **Authentication → Providers → Google**: actívalo, pega Client ID y Secret → Save.
6. **Conectar la app al proyecto nuevo**: en Vercel → Settings → Environment Variables crea
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY` (datos del paso 2) y haz *Redeploy*.
   (En tu computadora: copia `.env.example` como `.env` con los mismos valores.)
7. Abre la app → **Entrar → Continuar con Google** → **Crear mi propia tienda**.
   Tu foto de Google aparece arriba a la derecha. También se puede entrar con correo y contraseña
   (en ese caso se muestra tu inicial).
8. Tus vendedores: menú → **Equipo e invitaciones → Invitar** → envías el código/enlace por WhatsApp.

---|---|
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
git commit -m "MiNegocio7pro v3.2"
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
