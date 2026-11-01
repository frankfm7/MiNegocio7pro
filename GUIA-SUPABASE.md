# Guía de Supabase para MiNegocio7pro (paso a paso)

Elige **UNA** de las dos rutas. Los pasos 3 a 7 son iguales en ambas.

| | Ruta A · Proyecto NUEVO | Ruta B · Reutilizar el proyecto que ya tienes |
|---|---|---|
| Cuándo | Quieres empezar limpio, sin los datos de la app anterior | Quieres conservar tus catálogos, productos y ventas actuales |
| Datos viejos | No se traen | Se conservan y se pasan a tu tienda |

---
## Paso 1 · Preparar el proyecto

### Ruta A (nuevo)
1. https://supabase.com → **New project** → nombre `minegocio7pro`, región cercana, guarda la contraseña.
2. Espera 1–2 minutos a que termine de crearse.

### Ruta B (el que ya tienes)
1. Entra a tu proyecto actual en https://supabase.com (el de la app "Mi Catálogo 7pro").
2. No borres nada. Todo el SQL es **repetible**: agrega lo que falta y no borra datos.

## Paso 2 · Copiar las claves
**Project Settings → API**:
- **Project URL** → es `VITE_SUPABASE_URL`
- Clave **publishable** (o *anon*) → es `VITE_SUPABASE_KEY`
(Nunca uses la clave `service_role` en la app.)

## Paso 3 · Ejecutar el SQL (SQL Editor → New query → pegar → Run)
Ejecútalos **en este orden** (cada uno en una consulta nueva: *New query → pegar → Run*). Todos se pueden repetir sin riesgo.
1. `supabase/1-migracion-multi-tienda.sql` → tablas, tiendas, invitaciones, funciones y seguridad.
   Debe terminar con "Success". Si sale un error, copia el mensaje y envíamelo.
2. `supabase/5-mejoras-v4.sql` → **lo nuevo de la v3.5**: fotos del equipo, stock mínimo, clientes y fiados,
   catálogo público, historial de precios y respaldos en la nube.
3. **Solo Ruta B**, y solo después del paso 7: `supabase/2-mover-mis-datos.sql`
   (cambia `TU_CORREO@ejemplo.com` por el correo con el que creaste tu tienda).
4. `supabase/4-verificar.sql` → debe mostrar **OK en todas las filas** (son 57 revisiones).
   Si alguna dice FALTA, vuelve a ejecutar el 1 y luego el 5.

> Si NO ejecutas el 5, la app sigue funcionando como antes, pero clientes/fiados solo quedan en el dispositivo,
> y no habrá catálogo público, historial de precios ni respaldos en la nube.

## Paso 4 · Direcciones de la app
**Authentication → URL Configuration**
- *Site URL*: la dirección de tu app, ej. `https://minegocio7pro.vercel.app`
- *Redirect URLs*: agrega esa misma dirección y `http://localhost:5173` (para probar en tu PC).

## Paso 5 · Iniciar sesión con Google (la foto de perfil sale de Google)
1. https://console.cloud.google.com → crea un proyecto.
2. **APIs y servicios → Pantalla de consentimiento OAuth** → tipo *Externo* → nombre `MiNegocio7pro` y tu correo → Guardar.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   En *URI de redireccionamiento autorizados* pega: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
   (Supabase lo muestra en Authentication → Providers → Google).
4. Copia **Client ID** y **Client Secret**.
5. Supabase → **Authentication → Providers → Google** → activar → pegar ambos → Save.
6. Correo y contraseña: en **Providers → Email** déjalo activado
   (opcional: desactiva *Confirm email* para que tus vendedores no tengan que confirmar el correo).

## Paso 6 · Conectar Vercel (tu carpeta ya está enlazada a GitHub)
1. Vercel → tu proyecto → **Settings → Environment Variables**. Crea (marcando Production, Preview y Development):
   - `VITE_SUPABASE_URL` = Project URL del paso 2
   - `VITE_SUPABASE_KEY` = clave publishable del paso 2
   - `VITE_PUBLIC_URL` = tu dirección oficial, ej. `https://minegocio7pro.vercel.app` (hace que **los QR siempre apunten a la dirección correcta**)
2. **Deployments → ⋯ → Redeploy** (las variables solo se aplican con un despliegue nuevo).
3. En tu PC (opcional): copia `.env.example` como `.env` con los mismos valores.

## Paso 7 · Primer uso y pruebas
1. Abre la app → **Entrar → Continuar con Google**. Arriba a la derecha debe aparecer **tu foto**.
2. **Ruta A**: *Crear mi propia tienda en la nube*.
   **Ruta B**: crea tu tienda y luego ejecuta `2-mover-mis-datos.sql` (paso 3.2); recarga la app.
3. Crea un producto → en el editor se ve su **QR en vivo**. Descárgalo y escanéalo con la cámara del celular:
   debe abrir la app en ese producto.
4. Menú → **Equipo e invitaciones → Invitar**: envía el código/enlace por WhatsApp a un vendedor y comprueba que entra a tu tienda.
5. Haz una venta de prueba y revisa que aparezca en **Informes**.
6. **Fotos del equipo:** cada persona que entra con Google aparece con su foto en *Equipo e invitaciones*, en las ventas y en el cierre de caja.
7. **Clientes y fiados:** al vender elige pago **Fiado**, escoge o crea el cliente. En *Clientes y fiados* registra abonos y envía recordatorios por WhatsApp.
8. **Cierre de caja:** menú → *Cierre de caja* → revisa el total por método de pago y por vendedor → *Enviar por WhatsApp*.
9. **Catálogo público:** menú → *Catálogo público* → activar, elige el nombre del enlace y el WhatsApp que recibe pedidos → copia el enlace o el QR y pruébalo en una ventana privada (sin sesión).
10. **Respaldos:** menú → *Respaldo de datos* → *Respaldar ahora*. Verás la lista; *Restaurar* solo lo hace el administrador.
11. **Historial de precios:** cambia el precio de un producto y abre ⋮ → *Historial de precios*.

## Respaldo diario aunque nadie abra la app (opcional)
La app ya pide un respaldo al abrirla (máximo uno cada 20 horas). Si quieres que se haga solo todos los días:
Supabase → **Database → Extensions** → activa `pg_cron`, y en el SQL Editor ejecuta
`select cron.schedule('respaldo-diario', '0 7 * * *', $$ select public.backup_all_stores() $$);`

## Si algo falla
| Mensaje en la app | Causa y solución |
|---|---|
| "Falta conectar Supabase…" | Faltan las variables de Vercel (paso 6) o no hiciste Redeploy |
| "Falta activar Google en Supabase" | Paso 5.5 sin terminar |
| "redirect_uri_mismatch" (pantalla de Google) | La URI del paso 5.3 no coincide exactamente con la de Supabase |
| Vuelve al login después de Google | Falta tu dirección en *Redirect URLs* (paso 4) |
| "Falta ejecutar … 1-migracion-multi-tienda.sql" | Paso 3.1 sin ejecutar; vuelve a correrlo |
| `4-verificar.sql` con "FALTA" | Vuelve a ejecutar `1-migracion-multi-tienda.sql` y verifica de nuevo |
| El QR abre una dirección rara | Define `VITE_PUBLIC_URL` (paso 6.1) y reimprime los QR |
| "Falta ejecutar … 5-mejoras-v4.sql" | Ejecuta el archivo 5 (paso 3.2) |
| El catálogo público dice "no encontrado" | No está activado, o el nombre del enlace no coincide; revísalo en *Catálogo público* |
| El WhatsApp abre sin número | Falta el WhatsApp del cliente o el *código de país* en *Datos del negocio* |
| Las fotos del equipo no aparecen | Cada persona debe iniciar sesión con Google al menos una vez después de ejecutar el SQL 5 |
