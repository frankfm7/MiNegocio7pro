-- =====================================================================
-- MiNegocio7pro · v1.4 · Nombre común de los productos
-- =====================================================================
-- Agrega la columna "common_name" (ej. "Protector solar" para "Total Block").
-- Se puede ejecutar varias veces sin riesgo; no borra ni cambia datos.
--
-- PASO A PASO
--   1. Supabase → SQL Editor → New query.
--   2. Pega todo este archivo y toca Run. Debe decir "Success".
--   3. (Opcional) Ejecuta 4-verificar.sql: "Columna products.common_name" debe decir OK.
-- Si no lo ejecutas, la app sigue funcionando: el nombre común solo queda en el
-- dispositivo y en la nube se muestra el sugerido según el nombre.
-- =====================================================================
alter table public.products add column if not exists common_name text;

-- Recargar el esquema para que la app vea la columna nueva al instante
notify pgrst, 'reload schema';
