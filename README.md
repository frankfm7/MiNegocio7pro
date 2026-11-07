# MiNegocio7pro · v1.9

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
   Luego ejecuta, en consultas nuevas, `supabase/5-mejoras.sql`, `supabase/6-precio-catalogo.sql`,
   luego `supabase/7-nombre-comun.sql`, `supabase/8-recibos-numerados.sql`, `supabase/9-documentos-numerados.sql`, `supabase/10-mensajes-revistas-roles.sql` y por último `supabase/4-verificar.sql` (todo debe decir OK, 84 revisiones).
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

## 4a. Novedades v2.5

1. **Etiquetas: lo elegido ya no se reinicia solo.** Causa: la app se sincroniza con la nube cada 30 segundos y trae
   una copia nueva de catálogos y productos; la ventana de etiquetas lo tomaba como "recién abierta" y volvía a
   *Todos* y a la selección inicial. Ahora se reinicia solo al abrirla; con datos nuevos conserva el catálogo,
   los productos marcados y las cantidades (solo quita los productos que se borraron).
2. **Corregido (error de la v2.4)**: la pantalla *Iniciar sesión / Cambiar de tienda* no se abría (la app mostraba
   un error). Revisadas todas las ventanas con el botón atrás: ninguna tenía otro caso.

## 4a·1. Novedades v2.4

1. **Etiquetas "Solo QR + nombre"**: siempre usan la hoja ajustada al QR (antes podía quedar elegida la hoja de
   38 × 25 mm). Etiqueta = QR + 4 mm de ancho (19 mm con QR de 15 mm) y QR + 8,5 mm de alto, QR centrado,
   márgenes mínimos; el nombre se achica hasta entrar en 2 líneas sin salirse del borde. 10 por fila, 120 por hoja.
2. **Botón atrás del celular y tocar fuera**: todas las ventanas, paneles y visores (detalle, ventas, formulario de
   producto, menú lateral, cuenta, editor de fotos, visores de imagen y QR, cámara, menú ⋮ del detalle, selección
   múltiple, catálogo público) se anotan en `src/lib/backClose.ts`. *Atrás* cierra solo la de encima y la pantalla
   de atrás no se mueve; si no hay nada abierto, navega como antes. Todas las ventanas se cierran tocando fuera
   (la vista previa de una importación pregunta antes de descartar la lista).

## 4a·1. Novedades v2.3

1. **QR de texto**: el QR del producto ya no es un enlace. Con cualquier celular sin la app solo se ve
   `PERFUME FLORAL - ESIKA - 100 ML - REF 12345678` (sin abrir la web). El escáner de la app lee el `REF` y abre el producto.
   Sigue siendo chico (25 a 29 cuadritos; nombres de más de 30 letras se acortan en el QR). Los QR anteriores siguen funcionando.
   Como el QR lleva el nombre, ahora sí cambia en el formulario al editar nombre, marca o contenido.
2. **Hoja A4 ajustada al QR** (diseño *Solo QR + nombre*): etiquetas justas de (QR + 4,5) × (QR + 10) mm con márgenes
   mínimos: con QR de 1,5 cm entran **10 por fila y 110 por hoja** (19,5 × 25 mm).

## 4a·0. Novedades v2.2

1. **Buscador del catálogo con una sola X**: la regla CSS que ocultaba la X del navegador tenía un selector de Microsoft
   (`::-ms-clear`) junto con los de Chrome, y Chrome descartaba toda la regla. Ahora va en reglas separadas.
2. **QR aún más grande, como el de las revistas**: el enlace va en mayúsculas y sin `?` ni `=`
   (`HTTPS://MINEGOCIO7PRO.VERCEL.APP/Q/12345678`), así el QR usa el modo alfanumérico: **25 × 25 cuadritos**
   (antes 33 × 33 en la v2.1 y 53 × 53 en la v2.0). `vercel.json` redirige `/Q/...` a la app. Los QR anteriores siguen funcionando.
3. **Etiquetas**: diseño *Solo QR + nombre* (nombre, marca y ml/g arriba o abajo del QR), **tamaño del QR configurable**
   (1 a 3 cm, 1,5 cm por defecto), hoja A4 de **4 por fila** (32 etiquetas de 48,5 × 34 mm) y hoja **mini 38 × 25 mm** (55 etiquetas).
   El PDF "Códigos QR" de Exportar ahora pone 4 por fila.

## 4a·1. Novedades v2.1

1. **Ventas de días anteriores**: en *Ventas del día* hay calendario, flechas y botones *Ayer / Anteayer* (y los últimos
   días con ventas). El *Cierre de caja* y la *Tabla de cierre* salen del día elegido. Las ventas quedan guardadas siempre.
2. **Venta olvidada**: se registra en el día y hora reales, con motivo; queda la observación 📝 en la lista, en la tabla
   de cierre y en los informes (columna *Observación*). Opción de no descontar stock si ya se corrigió.
3. **Informe personalizado**: en *Informes*, al seleccionar ventas aparece el botón **Informe** (numerado, solo con esas ventas).
4. **QR compacto** (como el de las revistas): el QR lleva solo `?q=<código de 8 números>`, por eso tiene 33 cuadritos por
   lado en vez de 53 (puntos 1,6× más grandes) y abre siempre la ficha actual del producto. Los QR viejos siguen
   funcionando. **Código de barras** corto (8 números, CODE128) de barras gruesas (0,33 mm). Probado con un lector ZXing.
5. **Etiquetas**: ventana para elegir producto por producto y cuántas de cada uno, marca ✓ de impresas y botón
   *Sin imprimir*; nuevas hojas A4 de 40 (48,5 × 25,4 mm) y 65 (38 × 21 mm) etiquetas.
6. **Cámara de los invitados**: si el navegador no deja usar la cámara (enlace abierto desde WhatsApp/Facebook, o permiso
   negado), se ofrece *Abrir la cámara del teléfono* / *Elegir de la galería* (sin permisos). Igual en el escáner.
   Además, el enlace de invitación ya no queda tapado por la pantalla de bienvenida.
7. **Menú Datos**: *Importar archivo* muestra solo importar y *Exportar datos* solo exportar.
8. **Tarjetas de producto**: la foto llena todo el ancho en formato 4:5 (~64 % de la tarjeta) y los textos son más compactos.
9. **Roles**: Dueño · Administrador · Supervisor · Vendedor · **Vendedor eventual** (acceso de 1 a 30 días que vence solo).
   El **QR de cobro del dueño** lo ve todo el equipo (antes los administradores no lo veían).
10. **WhatsApp del catálogo público**: acepta `+591 71101154`, `71101154` (agrega el código del país) o un enlace wa.me,
    muestra a qué número llegarán los pedidos y tiene botón *Probar*. Antes, un número sin código de país no funcionaba.
11. **Mensajes y pedidos** (💬): chat del equipo con fotos, videos y notas de voz; los clientes pueden mandar el pedido
    **a la app** sin WhatsApp (llega a *Pedidos* con estados Nuevo → Preparando → Listo → Entregado).
12. **Revistas para pedidos**: sube la revista de Ésika, L'Bel, Cyzone, Yanbal… (PDF o fotos); los clientes la hojean en
    el catálogo público, piden por código y página, y ven el tiempo estimado de llegada y los datos de la tienda.
13. Requiere ejecutar `supabase/10-mensajes-revistas-roles.sql` (y luego `4-verificar.sql`: 84 revisiones OK).
    Sin ese archivo, los puntos 1–8 funcionan igual (la observación de una venta olvidada queda solo en el celular
    que la registró) y los puntos 9–12 avisan que falta ejecutarlo.

## 4b. Novedades v2.0

1. **Detalle del producto**: se quitó el cuadro repetido "Costo mínimo de venta" (el mínimo queda en el cuadro grande
   del precio). *Costo de adquisición* y *Precio de catálogo* van en una fila más baja; *Ganancia estimada* ocupa todo
   el ancho en una sola línea. Para cerrar tocando la zona de detalles hay que tocar **dos veces** (tocar fuera o la ✕
   sigue cerrando con un toque).
2. **Productos repetidos**: al importar factura (foto/PDF) se busca primero por **código del producto** y luego por
   nombre, pero **solo si la presentación coincide** (50 ml ≠ 100 ml; 1 L = 1000 ml). Al crear un producto a mano,
   si el nombre, código o código de barras ya existe sale *"¿Es ese producto?"* → abrir el existente o "es otro producto".
3. **QR del producto**: verificado que se actualiza en vivo al cambiar nombre, marca, contenido, precio u oferta.
   Los costos **no** van en el QR a propósito (el cliente que lo escanea no debe verlos).
4. **Selección múltiple en el catálogo**: barra con **Eliminar · Duplicar · Compartir · Nota de venta** en una línea.
5. **Quitar fondo con IA**: modelo U²-Net-p (Apache 2.0) con onnxruntime-web, corre en el celular (sin servidor).
   La 1ª vez descarga ~15 MB (`public/ai/`), luego funciona sin internet. Control *Recorte*. Se mantiene el modo
   "Por color del fondo". Sin cambios en Supabase.

## 4c. Novedades v1.9

1. **Recibo por WhatsApp**: campo para el número del cliente + *Enviar por WhatsApp* (abre `wa.me/NUMERO?text=...` con el
   detalle). Si no tiene código de país se usa el configurado o el de la moneda (Bs → 591). Opciones: compartir imagen +
   texto (Web Share), elegir contacto o copiar el texto.
2. **Costos y precios** (formulario de producto y revisión de facturas): *Costo de factura*, *Costo mínimo de venta*
   (valor o % sobre la factura) y *Precio de venta máx.* (valor o % sobre el mínimo o la factura; es el del catálogo).
   Aviso en rojo si el precio de venta queda debajo del mínimo. Costo en dólares × **tipo de cambio** (siempre visible).
   Se quitaron el "% de costo" genérico y el "descuento de empresa". Sin columnas nuevas: usa cost_price / min_price / sale_price.
3. **Facturas**: código de producto editable; al cambiar código o nombre se busca solo en el catálogo; indicador verde
   "✓ Producto reconocido en catálogo" (solo se actualizan unidades y costos) y sugerencia "¿Es «...»?".
4. **Catálogo**: sin botón "Ver"; el detalle se cierra tocando fuera o en la zona de detalles (no en botones/foto/precio).
5. **Tarjetas**: muestran precio de venta y mínimo (sin costo ni ganancia); el detalle muestra el desglose completo.
6. **Nota de venta** (reemplaza el botón "Pedido" de las tarjetas): pulsación larga para elegir productos, barra
   *Nota de venta*, cantidades, descuento por producto o global (% o monto), totales en vivo, **nunca por debajo del costo
   mínimo**, *Guardar borrador* o *Procesar venta* (recibo numerado con el descuento).

## 4a·0. Novedades v1.8

- **Datos de la tienda** (nombre, dirección, teléfono, celular, NIT, código): ahora arriba de todo en menú ☰ →
  **Datos de la tienda (recibo)**; el recibo avisa si faltan.
- **Números visibles antes de enviar**: el cierre de caja muestra "N° de cierre" (botón *Asignar número*; el primer
  toque en WhatsApp/Copiar asigna y muestra el número). Informes: *Generar informe numerado* muestra el N° y luego
  Excel / CSV / Compartir.
- **Facturas en PDF**: se leen con el lector de facturas por columnas (descripciones en varias líneas, cantidades);
  PDF escaneado → se usa la foto original del PDF.
- **Código de producto** = lo que va antes del guión (5109-20014207 → 5109); los productos ya importados se reconocen igual.
- **Porcentajes** al importar: costo ± %, descuento de la empresa sobre catálogo (31% editable, costo referencial) y
  precio de venta = catálogo ± % o costo + % de ganancia, "Aplicar a toda la lista".
- Campos numéricos (tipo de cambio, cantidad, costo, precios) se pueden borrar sin que salte a 0.

## 4a·0. Novedades v1.7 · Cierres e informes numerados, historial y WhatsApp con imagen

- **Recibo desde la selección múltiple**: si las ventas son de un mismo recibo se abre ese recibo (copia, mismo número);
  si no tienen recibo se emite uno nuevo; **una venta nunca sale en dos recibos** (si se mezclan, la app avisa).
- **Cierre de caja / tabla de cierre** numerados `ANA-C-000001` (un día = siempre el mismo número, aunque lo genere otra persona).
- **Informes de venta** (Excel/CSV) numerados `ANA-I-000001`, con columna de N° de recibo y cliente.
- **WhatsApp con imagen**: el recibo se envía como imagen con el menú de compartir del celular (o como texto, opcional).
- **Recibos y cierres** (menú ☰): historial de recibos, cierres e informes de todo el equipo, con buscador; ver, reenviar
  o volver a descargar.
- Corregido en la nube: las ventas a fiado guardan el cliente, y una venta que sube tarde toma el número de su recibo.
- Requiere ejecutar `supabase/9-documentos-numerados.sql` (y luego `4-verificar.sql`: 76 revisiones OK).

## 4a·0. Novedades v1.6 · Recibos numerados

- **Número correlativo en cada recibo** con el código de la tienda (ej. `ANA-000123`). En una tienda lo da la base de
  datos en un solo paso: aunque vendan varios del equipo a la vez, **nunca se repite ni se salta**. Queda registro de
  cada recibo (`store_receipts`) y cada venta guarda su número. "Agregar más productos" mantiene el mismo número.
- **Datos del negocio → Recibo de venta**: nombre en el recibo, código de la tienda, empezar desde N° (solo adelantar),
  teléfono, celular, dirección y NIT, con opción de mostrar u ocultar cada uno. En la tienda lo cambian solo los administradores.
- **Diseño del recibo**: logo de la app, datos de la tienda, número grande y el nombre del negocio repetido en diagonal
  como marca de agua semitransparente.
- **Datos que pide el cliente** (opcional, en el recibo): N° de factura, código de autorización, N° de pedido, NIT/CI del cliente.
- Sin internet el recibo sale con número provisional y recibe el definitivo al sincronizar.
- Requiere ejecutar `supabase/8-recibos-numerados.sql` (y luego `4-verificar.sql`: 69 revisiones OK).

## 4a·0. Novedades v1.5

- **Venta en curso (varios productos, un solo recibo)**: en *Registrar venta* el botón **Agregar a la venta** guarda el
  producto y vuelve al catálogo. Aparece el botón flotante verde **Finalizar venta** (con el total) hasta que se finalice o
  se descarte con la ✕. Con una venta en curso, el botón verde dice **Agregar y finalizar**.
- **Agregar más productos a una venta ya cobrada**: en el recibo "¡Venta exitosa!" → *Agregar más productos a esta venta*.
  Al finalizar sale **un solo recibo** con lo ya cobrado más lo nuevo.
- **Ventanas que se cortaban a la derecha** (ej. *Lista de ventas* en celulares angostos): corregido para todas las ventanas.
  Tocar fuera cierra la lista de ventas sin perder los productos.
- **Detalle del producto**: el botón *Ver en grande* se cambió por **Modo cliente** (la foto se agranda tocándola).
  El botón desaparece mientras el modo cliente está activo.
- **Foto en grande**: se cierra con **doble toque** (o con la ✕); un toque suelto ya no la cierra.

## 4a·0. Novedades v1.4

- **Selección múltiple de ventas**: se activa **manteniendo presionada** una venta (½ segundo). Con la selección abierta,
  un toque o una pulsación larga agrega o quita ventas; **cuando no queda ninguna seleccionada se cierra sola**.
- **Precio mínimo**: vuelve a verse como antes en el detalle. **Solo en modo cliente** se oculta y se consulta con
  **3 toques seguidos sobre el precio de venta** (ventanita "Mínimo"). El ahorro frente al catálogo muestra también el %.
- **Nombre común** del producto (ej. "Protector solar" para "Total Block"): se ve debajo del nombre en tarjetas y detalle,
  y el buscador lo usa. Si no se escribe, se sugiere solo según el nombre. Columna "Nombre Común" en Excel/CSV.
  Para guardarlo en la nube ejecuta `supabase/7-nombre-comun.sql`.
- **Importar facturas sobre productos que ya existen**: se reconocen por código, código casi igual o nombre parecido;
  solo se suman stock y se actualizan costo y precio de catálogo. **El nombre, la foto y tu precio de venta no cambian.**
  Botón *No es el mismo* si la coincidencia no es correcta. Corregido: al reimportar facturas en dólares ya no se vuelve
  a convertir tu precio de venta. Detección más firme de dólares y del tipo de cambio en Belcorp.
- **Bienvenida**: "Mi Negocio 7pro" como protagonista y "Desarrollado por Ruah Producciones" al pie.

## 4a·1. Novedades v1.3

- **Editor de fotos**: cada foto empieza normal; los ajustes de una foto ya no se aplican a la siguiente.
- **Precio mínimo oculto**: ya no se ve en el detalle (ni en modo cliente). Toca **3 veces seguidas el precio de venta**
  para ver la ventanita "Puedo darlo hasta ...".
- **Equipo en línea**: en *Equipo e invitaciones* cada miembro muestra **En línea** (verde) o **Últ. vez ...** (negro).
  Se actualiza cada 30 s mientras la ventana está abierta. No requiere cambios en Supabase.
- **Cómo usar la app**: guía completa por temas (ventas, recibos, venta rápida, facturas, fiados, cierre de caja, equipo...).

## 4a·0. Novedades v1.2 · Editor de fotos de producto

Al elegir una foto (o con **Ajustar foto** sobre la imagen en *Editar producto*) se abre el editor:
- **Encuadre**: vertical, cuadrada u horizontal; zoom; mover con el dedo (pellizcar para acercar); girar, espejo y *Centrar* automático.
- **Fondo**: original, **blanco**, **negro** o cualquier color. *Quitar el fondo* lo separa del producto
  (mejor con pared, mesa o papel de un solo color), con *Sensibilidad*, pincel **Borrar / Recuperar**, *Deshacer* y sombra suave.
- **Luz y color**: auto-mejorar, brillo, contraste, color y nitidez.
- Cada foto empieza normal (los ajustes no pasan a la siguiente). Todo funciona sin internet.
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
