-- =====================================================================
-- MiNegocio7pro · Pasar tus datos actuales a TU tienda
-- =====================================================================
-- Ejecútalo DESPUÉS de:
--   1. haber ejecutado 1-migracion-multi-tienda.sql
--   2. haber creado tu cuenta y tu tienda en la app
--
-- Cambia el correo de abajo por el tuyo (el que usaste al crear la tienda)
-- y pulsa Run. Todos los catálogos, productos, ventas y QRs que todavía no
-- pertenecen a ninguna tienda pasarán a tu tienda.
-- =====================================================================
do $$
declare
  v_email text := 'TU_CORREO@ejemplo.com';   -- <<< CAMBIA ESTO
  v_store uuid;
  v_owner uuid;
begin
  select s.id, s.owner_id into v_store, v_owner
  from public.stores s join auth.users u on u.id = s.owner_id
  where lower(u.email) = lower(v_email)
  order by s.created_at
  limit 1;

  if v_store is null then
    raise exception 'No encontré una tienda creada por %. Primero crea tu cuenta y tu tienda en la app.', v_email;
  end if;

  update public.catalogs set store_id = v_store where store_id is null;
  update public.products set store_id = v_store where store_id is null;
  update public.sales    set store_id = v_store where store_id is null;
  -- Los QR de cobro antiguos pasan a ser tuyos (QR principal del negocio)
  update public.qrs set store_id = v_store, user_id = v_owner::text, role_owner = true where store_id is null;

  raise notice 'Listo: datos movidos a la tienda %', v_store;
end $$;
