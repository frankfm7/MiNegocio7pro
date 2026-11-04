# MiNegocio7pro · v1.2

App de catálogos, stock y ventas en **React + TypeScript + Tailwind CSS + Vite**.
Se instala como app (PWA) en Android, iPhone y computadora, y funciona sin internet.

---

> 📘 **Guía completa y detallada de Supabase: `GUIA-SUPABASE.md`.** (Resumen abajo.)

## 1. Pasos en Supabase (proyecto NUEVO, una sola vez)

1. Entra a https://supabase.com → **New project** (nombre: `minegocio7pro`).
2. **Project Settings → API**: copia la **Project URL** y la clave **publishable / anon**.
3. **SQL Editor → New query**: pega y ejecuta `supabase/1-migracion-multi-tienda.sql`
   (tablas, tiendas, invitaciones y seguridad RLS). `2-mover-mis-datos.sql` solo se usa si
   vienes de la app anterior con datos; en un proyecto nuevo se omite.
   Luego ejecuta, en consultas nuevas, `supabase/5-mejoras.sql`, `supabase/6-precio-catalogo.sql`
   y por último `supabase/4-verificar.sql` (todo debe decir OK).
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

## 4a. Novedades v1.2 · Editor de fotos de producto

Al elegir una foto (o con **Ajustar foto** sobre la imagen en *Editar producto*) se abre el editor:
- **Encuadre**: vertical, cuadrada u horizontal; zoom; mover con el dedo (pellizcar para acercar); girar, espejo y *Centrar* automático.
- **Fondo**: original, **blanco**, **negro** o cualquier color. *Quitar el fondo* lo separa del producto
  (mejor con pared, mesa o papel de un solo color), con *Sensibilidad*, pincel **Borrar / Recuperar**, *Deshacer* y sombra suave.
- **Luz y color**: auto-mejorar, brillo, contraste, color y nitidez.
- Recuerda el último estilo (ej. fondo blanco) para la siguiente foto. Todo funciona sin internet.
- Las tarjetas y el detalle usan el mismo color del fondo de la foto, para que se vea de borde a borde.

## 4a·0. Novedades v1.1

- **Mejor lectura de nombres en facturas**: foto procesada con más detalle, segunda lectura para Belcorp,
  diccionario de perfumería que corrige letras confundidas (O/0, S/5, I/1...), separa palabras pegadas
  ("PERFUMADOROLLON" → "Perfumado Rollon") y quita restos de columnas ("UNIDAD (BIENES)").
  En Belcorp el costo se comprueba con los % de descuento de la misma fila.
- **Ventas con selección múltiple** (Ventas del día e Informes): toca las ventas → **Recibo** (imagen o WhatsApp),
  **Copiar**, **Compartir** o **Eliminar** (solo administradores; pregunta si se devuelven las unidades al stock).
- **Avisos de agotados y stock bajo que se pueden ocultar**: botón *Ocultar* en el aviso de inicio y
  *Ya lo vi* en cada lista. Vuelven a avisar solo si otro producto se agota o baja de stock.
- Los cuadros de resumen ya no se cortan a la derecha con montos grandes.

## 4a·1. Novedades v1.0

- **Importar desde foto de factura, recibo o detalle de pedido** (Datos → Importar → *Foto de factura…*).
  Reconoce Belcorp (Ésika, L'Bel, Cyzone; en dólares con su tipo de cambio) y Yanbal (en Bs), el código
  de la empresa, cantidad, costo y precio de catálogo. Marca con ⚠ las filas dudosas, separa material
  (revistas, flyers) y regalos, suma stock si el producto ya existe y pregunta en qué catálogo guardar.
- **Precio de catálogo**: se ve tachado junto a tu precio ("Catálogo ~~120~~ · Tu precio 99 · Ahorras 21").
- **Costo visible** en la tarjeta, en el detalle y al vender (solo administradores; se oculta en modo cliente).
- **Moneda configurable** (Bs, USD, S/, …) en *Datos del negocio*.
- **Tarjetas rediseñadas**: foto → nombre → detalles → precios → botones; los nombres ya no se cortan.
- Requiere ejecutar `supabase/6-precio-catalogo.sql` para guardar precio de catálogo y código en la nube.

## 4b. Novedades anteriores

- **Fotos del equipo** (de la cuenta de Google) en equipo, ventas y cierre de caja.
- **Aviso de stock bajo** con mínimo general y por producto, número en el menú, aviso al abrir y notificación opcional.
- **Cierre de caja** por día: por método de pago, por vendedor y abonos; envío por WhatsApp, copiar o imagen.
- **Clientes y fiados**: libreta con deudas y abonos, pago “Fiado” al vender, recordatorios por WhatsApp.
- **Ticket por WhatsApp** al terminar una venta (texto) o como imagen.
- **Catálogo público** (`?tienda=nombre`): solo lectura, sin cuenta, pedido por WhatsApp, sin costos.
- **Etiquetas imprimibles** con QR + código de barras (A4 o térmica 40×25, 50×30, 60×40).
- **Historial de cambios de precio** (quién y cuándo).
- **Respaldos en la nube** automáticos y manuales, con restauración.

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
git commit -m "MiNegocio7pro v3.5"
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

## 7. Subir a tu repositorio nuevo de GitHub

```bash
cd MiNegocio7pro
git init
git add .
git commit -m "MiNegocio7pro v1.0"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/MiNegocio7pro.git
git push -u origin main
```
Si la carpeta ya tenía git: `git remote set-url origin https://github.com/TU_USUARIO/MiNegocio7pro.git`
y luego `git add . && git commit -m "v1.0" && git push`. En Vercel: *Add New → Project* → elige el
repositorio → agrega las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY` → *Deploy*.
