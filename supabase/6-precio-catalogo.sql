-- =====================================================================
-- MiNegocio7pro · v1.0 · Precio de catálogo y código de empresa
-- =====================================================================
-- PASO A PASO
--   1. supabase.com → tu proyecto → "SQL Editor" → "New query".
--   2. Pega TODO este archivo y pulsa "Run".
--   3. Debe decir "Success. No rows returned".
--   * Antes deben estar ejecutados 1-migracion-multi-tienda.sql y 5-mejoras.sql.
--   * Se puede ejecutar varias veces sin problema (no borra datos).
--
-- Qué agrega a la tabla de productos:
--   * catalog_price → precio que figura en el catálogo de la marca
--                     (la app lo muestra tachado junto a tu precio de venta).
--   * sku           → código del producto en la empresa (Ésika, L'Bel, Cyzone,
--                     Yanbal...). Sirve para reconocer el producto al importar
--                     una factura o detalle de pedido y sumarle el stock.
-- =====================================================================
alter table public.products add column if not exists catalog_price numeric;
alter table public.products add column if not exists sku text;
create index if not exists products_sku_idx on public.products(store_id, sku);

notify pgrst, 'reload schema';
