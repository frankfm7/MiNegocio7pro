-- =====================================================================
-- MiNegocio7pro · Verificar que la base de datos quedó completa
-- =====================================================================
-- Pégalo en Supabase → SQL Editor → New query → Run. Solo LEE, no cambia nada.
-- Debe mostrar "OK" en TODAS las filas. Si alguna dice "FALTA":
--   * tablas / columnas / funciones / seguridad → vuelve a ejecutar
--     supabase/1-migracion-multi-tienda.sql, luego 5-mejoras.sql, 6-precio-catalogo.sql y 7-nombre-comun.sql
--     (se pueden repetir sin riesgo).
-- =====================================================================
select * from (
  -- Tablas
  select 1 as orden, 'Tabla ' || t as revision,
         case when to_regclass('public.' || t) is not null then 'OK' else 'FALTA' end as estado
  from unnest(array['catalogs','products','sales','qrs','stores','store_members','store_invites','customers','customer_movements','price_history','store_backups']) t

  union all
  -- Columnas que usa la app
  select 2, 'Columna ' || c,
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name || '.' || column_name = c
         ) then 'OK' else 'FALTA' end
  from unnest(array[
    'catalogs.store_id','products.store_id','sales.store_id','qrs.store_id',
    'products.content_value','products.content_unit','sales.seller_uid',
    'store_members.last_seen','store_members.status','store_invites.max_uses',
    'store_members.avatar_url','products.min_stock','sales.customer_id','sales.customer_name',
    'stores.public_enabled','stores.public_slug','stores.public_whatsapp',
    'products.catalog_price','products.sku','products.common_name'
  ]) c

  union all
  -- Seguridad por filas (nadie sin permiso ve datos)
  select 3, 'Seguridad (RLS) en ' || t,
         case when coalesce((select rowsecurity from pg_tables where schemaname = 'public' and tablename = t), false)
              then 'OK' else 'FALTA' end
  from unnest(array['catalogs','products','sales','qrs','stores','store_members','store_invites','customers','customer_movements','price_history','store_backups']) t

  union all
  -- Funciones que llama la app
  select 4, 'Función ' || f,
         case when to_regprocedure('public.' || f) is not null then 'OK' else 'FALTA' end
  from unnest(array[
    'create_store(text,text)','create_invite(uuid,text,integer,integer)','join_store(text,text)',
    'register_sale(jsonb)','touch_member(uuid)','update_my_member_name(uuid,text)',
    'my_store_role(uuid)','is_store_member(uuid)','is_store_manager(uuid)',
    'set_my_avatar(text)','set_public_shop(uuid,boolean,text,text)','get_public_shop(text)','get_public_images(text,text[])',
    'backup_store(uuid,text)','restore_store_backup(uuid)','log_price_change()'
  ]) f

  union all
  -- Historial de precios automático
  select 5, 'Disparador del historial de precios',
         case when exists (select 1 from pg_trigger where tgname = 'products_price_history' and not tgisinternal) then 'OK' else 'FALTA' end

  union all
  -- Tabla antigua de usuarios (si existe debe estar bloqueada)
  select 6, 'Tabla antigua "users" bloqueada',
         case when to_regclass('public.users') is null then 'OK (no existe)'
              when (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'users')
                   and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users') then 'OK'
              else 'FALTA' end
) r
order by orden, revision;

-- Informativo: con qué método se han registrado tus usuarios (email / google)
select provider as metodo_de_acceso, count(*) as cuentas from auth.identities group by provider;
