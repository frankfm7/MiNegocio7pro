-- =====================================================================
-- MiNegocio7pro · Mejoras (clientes, fiados, catálogo público, historial, respaldos)
-- =====================================================================
-- Ejecuta este archivo en Supabase → SQL Editor → New query → Run.
-- Antes debes haber ejecutado 1-migracion-multi-tienda.sql.
-- Se puede ejecutar varias veces sin problema (no borra datos).
--
-- Qué agrega:
--   1. Foto de cada miembro del equipo (viene de su cuenta de Google).
--   2. Stock mínimo por producto (aviso de stock bajo configurable).
--   3. Clientes y fiados (deudas y abonos) y su vínculo con las ventas.
--   4. Catálogo público de solo lectura (enlace para clientes, sin login).
--   5. Historial de cambios de precio (automático, lo escribe la base de datos).
--   6. Respaldos automáticos y manuales en la nube (con restauración).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Foto del equipo
-- ---------------------------------------------------------------------
alter table public.store_members add column if not exists avatar_url text;

-- La app llama a esta función al iniciar sesión para guardar tu foto de Google
create or replace function public.set_my_avatar(p_avatar text)
returns void language sql security definer set search_path = public as $$
  update public.store_members set avatar_url = nullif(trim(p_avatar), '') where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 2. Stock mínimo por producto (vacío = usa el mínimo general de la app)
-- ---------------------------------------------------------------------
alter table public.products add column if not exists min_stock numeric;

-- ---------------------------------------------------------------------
-- 3. Clientes y fiados
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_movements (
  id text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id text not null,
  type text not null check (type in ('fiado', 'abono')),
  amount numeric not null check (amount > 0),
  method text,
  note text,
  sale_id text,
  seller_name text,
  seller_uid uuid,
  date timestamptz not null default now()
);

alter table public.sales add column if not exists customer_id text;
alter table public.sales add column if not exists customer_name text;

create index if not exists customers_store_idx on public.customers(store_id);
create index if not exists cmov_store_idx on public.customer_movements(store_id, customer_id);

alter table public.customers          enable row level security;
alter table public.customer_movements enable row level security;

drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
create policy customers_select on public.customers for select to authenticated using (public.is_store_member(store_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_store_member(store_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy customers_delete on public.customers for delete to authenticated using (public.is_store_manager(store_id));

drop policy if exists cmov_select on public.customer_movements;
drop policy if exists cmov_insert on public.customer_movements;
drop policy if exists cmov_delete on public.customer_movements;
create policy cmov_select on public.customer_movements for select to authenticated using (public.is_store_member(store_id));
create policy cmov_insert on public.customer_movements for insert to authenticated with check (public.is_store_member(store_id));
create policy cmov_delete on public.customer_movements for delete to authenticated using (public.is_store_manager(store_id));

-- ---------------------------------------------------------------------
-- 4. Catálogo público (solo lectura, sin iniciar sesión)
-- ---------------------------------------------------------------------
alter table public.stores add column if not exists public_enabled boolean not null default false;
alter table public.stores add column if not exists public_slug text;
alter table public.stores add column if not exists public_whatsapp text;
create unique index if not exists stores_public_slug_idx on public.stores (lower(public_slug)) where public_slug is not null;

-- Activar / configurar el catálogo público (solo administradores)
create or replace function public.set_public_shop(p_store uuid, p_enabled boolean, p_slug text, p_whatsapp text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not public.is_store_manager(p_store) then raise exception 'Solo los administradores pueden cambiar esto'; end if;
  if p_enabled and v_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception 'El nombre del enlace debe tener 3 a 40 letras minúsculas, números o guiones';
  end if;
  if v_slug <> '' and exists (select 1 from public.stores s where lower(s.public_slug) = v_slug and s.id <> p_store) then
    raise exception 'Ese nombre de enlace ya está en uso, elige otro';
  end if;
  update public.stores
     set public_enabled = coalesce(p_enabled, false),
         public_slug = nullif(v_slug, ''),
         public_whatsapp = nullif(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g'), '')
   where id = p_store;
end $$;

-- Datos públicos de la tienda: SIN costos, SIN precio mínimo, SIN fotos (las fotos se piden aparte)
create or replace function public.get_public_shop(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.stores%rowtype;
begin
  select * into v from public.stores s where lower(s.public_slug) = lower(trim(p_slug)) and s.public_enabled;
  if not found then return null; end if;
  return jsonb_build_object(
    'store', jsonb_build_object('name', v.name, 'whatsapp', v.public_whatsapp),
    'catalogs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'label', c.label, 'color', c.color) order by c.name)
                          from public.catalogs c where c.store_id = v.id), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', p.id, 'name', p.name, 'brand', p.brand, 'type', p.type, 'category', p.category,
                            'price', p.sale_price, 'stock', p.stock, 'catalog_id', p.catalog_id, 'description', p.description,
                            'offer', p.offer_text, 'cv', p.content_value, 'cu', p.content_unit,
                            'has_image', coalesce(p.image_url, '') <> '') order by p.name)
                          from public.products p where p.store_id = v.id and p.stock > 0), '[]'::jsonb)
  );
end $$;

-- Fotos de productos del catálogo público (de a pocas, para que cargue rápido)
create or replace function public.get_public_images(p_slug text, p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v uuid;
begin
  select s.id into v from public.stores s where lower(s.public_slug) = lower(trim(p_slug)) and s.public_enabled;
  if v is null then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(p.id, p.image_url)
                   from public.products p
                   where p.store_id = v and p.id = any(p_ids[1:12]) and coalesce(p.image_url, '') <> ''), '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5. Historial de cambios de precio (lo registra la base de datos sola)
-- ---------------------------------------------------------------------
create table if not exists public.price_history (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id text not null,
  product_name text,
  field text not null check (field in ('sale_price', 'min_price', 'cost_price')),
  old_value numeric,
  new_value numeric,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now()
);
create index if not exists price_history_idx on public.price_history(store_id, product_id, changed_at desc);
alter table public.price_history enable row level security;
drop policy if exists price_history_select on public.price_history;
-- Solo administradores ven el historial (incluye costos)
create policy price_history_select on public.price_history for select to authenticated using (public.is_store_manager(store_id));

create or replace function public.log_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select m.name into v_name from public.store_members m where m.store_id = new.store_id and m.user_id = auth.uid();
  if new.sale_price is distinct from old.sale_price then
    insert into public.price_history (store_id, product_id, product_name, field, old_value, new_value, changed_by, changed_by_name)
    values (new.store_id, new.id::text, new.name, 'sale_price', old.sale_price, new.sale_price, auth.uid(), v_name);
  end if;
  if new.min_price is distinct from old.min_price then
    insert into public.price_history (store_id, product_id, product_name, field, old_value, new_value, changed_by, changed_by_name)
    values (new.store_id, new.id::text, new.name, 'min_price', old.min_price, new.min_price, auth.uid(), v_name);
  end if;
  if new.cost_price is distinct from old.cost_price then
    insert into public.price_history (store_id, product_id, product_name, field, old_value, new_value, changed_by, changed_by_name)
    values (new.store_id, new.id::text, new.name, 'cost_price', old.cost_price, new.cost_price, auth.uid(), v_name);
  end if;
  return new;
end $$;

drop trigger if exists products_price_history on public.products;
create trigger products_price_history
  after update on public.products
  for each row
  when (old.sale_price is distinct from new.sale_price
     or old.min_price  is distinct from new.min_price
     or old.cost_price is distinct from new.cost_price)
  execute function public.log_price_change();

-- ---------------------------------------------------------------------
-- 6. Respaldos en la nube
-- ---------------------------------------------------------------------
create table if not exists public.store_backups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  kind text not null default 'manual',
  counts jsonb,
  size_bytes integer,
  payload jsonb not null
);
create index if not exists store_backups_idx on public.store_backups(store_id, created_at desc);
alter table public.store_backups enable row level security;
drop policy if exists store_backups_select on public.store_backups;
create policy store_backups_select on public.store_backups for select to authenticated using (public.is_store_manager(store_id));
-- (sin políticas de insertar/borrar: solo las funciones de abajo escriben)

-- Hace la copia de una tienda y deja solo las 20 más recientes
create or replace function public.make_store_backup(p_store uuid, p_kind text, p_uid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb;
  v_id uuid;
begin
  v_payload := jsonb_build_object(
    'version', 1,
    'catalogs',           coalesce((select jsonb_agg(to_jsonb(x)) from public.catalogs x where x.store_id = p_store), '[]'::jsonb),
    'products',           coalesce((select jsonb_agg(to_jsonb(x)) from public.products x where x.store_id = p_store), '[]'::jsonb),
    'customers',          coalesce((select jsonb_agg(to_jsonb(x)) from public.customers x where x.store_id = p_store), '[]'::jsonb),
    'customer_movements', coalesce((select jsonb_agg(to_jsonb(x)) from public.customer_movements x where x.store_id = p_store), '[]'::jsonb),
    'sales',              coalesce((select jsonb_agg(to_jsonb(x)) from public.sales x where x.store_id = p_store), '[]'::jsonb)
  );
  insert into public.store_backups (store_id, created_by, kind, payload, size_bytes, counts)
  values (p_store, p_uid, p_kind, v_payload, pg_column_size(v_payload),
          jsonb_build_object(
            'catalogs', jsonb_array_length(v_payload -> 'catalogs'),
            'products', jsonb_array_length(v_payload -> 'products'),
            'customers', jsonb_array_length(v_payload -> 'customers'),
            'sales', jsonb_array_length(v_payload -> 'sales')))
  returning id into v_id;
  delete from public.store_backups b
   where b.store_id = p_store
     and b.id not in (select id from public.store_backups where store_id = p_store order by created_at desc limit 20);
  return v_id;
end $$;

-- Respaldar ahora (administradores). kind = 'manual' | 'auto'.
-- Si es 'auto' y ya hay un respaldo de las últimas 20 horas, no crea otro.
create or replace function public.backup_store(p_store uuid, p_kind text default 'manual')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_last uuid;
begin
  if not public.is_store_manager(p_store) then raise exception 'Solo los administradores pueden respaldar'; end if;
  if p_kind = 'auto' then
    select id into v_last from public.store_backups
     where store_id = p_store and created_at > now() - interval '20 hours' order by created_at desc limit 1;
    if v_last is not null then return v_last; end if;
  end if;
  return public.make_store_backup(p_store, case when p_kind = 'auto' then 'auto' else 'manual' end, auth.uid());
end $$;

-- Restaurar un respaldo (SOLO el administrador de la tienda).
-- Antes de restaurar guarda una copia del estado actual (kind = 'antes-de-restaurar').
-- Reemplaza catálogos, productos, clientes y fiados. Las ventas se conservan y se
-- agregan las que falten.
create or replace function public.restore_store_backup(p_backup uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.store_backups%rowtype;
begin
  select * into b from public.store_backups where id = p_backup;
  if not found then raise exception 'Respaldo no encontrado'; end if;
  if public.my_store_role(b.store_id) is distinct from 'admin' then raise exception 'Solo el administrador puede restaurar'; end if;

  perform public.make_store_backup(b.store_id, 'antes-de-restaurar', auth.uid());

  delete from public.customer_movements where store_id = b.store_id;
  delete from public.customers          where store_id = b.store_id;
  delete from public.products           where store_id = b.store_id;
  delete from public.catalogs           where store_id = b.store_id;

  insert into public.catalogs           select * from jsonb_populate_recordset(null::public.catalogs,           b.payload -> 'catalogs');
  insert into public.products           select * from jsonb_populate_recordset(null::public.products,           b.payload -> 'products');
  insert into public.customers          select * from jsonb_populate_recordset(null::public.customers,          b.payload -> 'customers');
  insert into public.customer_movements select * from jsonb_populate_recordset(null::public.customer_movements, b.payload -> 'customer_movements');
  insert into public.sales              select * from jsonb_populate_recordset(null::public.sales,              b.payload -> 'sales')
  on conflict (id) do nothing;
end $$;

-- Respaldo de TODAS las tiendas (para el programador diario, ver más abajo)
create or replace function public.backup_all_stores()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; n integer := 0;
begin
  for r in select s.id from public.stores s
           where not exists (select 1 from public.store_backups b where b.store_id = s.id and b.created_at > now() - interval '20 hours')
  loop
    perform public.make_store_backup(r.id, 'auto', null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------
revoke all on function public.set_my_avatar(text) from public, anon;
revoke all on function public.set_public_shop(uuid, boolean, text, text) from public, anon;
revoke all on function public.make_store_backup(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.backup_store(uuid, text) from public, anon;
revoke all on function public.restore_store_backup(uuid) from public, anon;
revoke all on function public.backup_all_stores() from public, anon, authenticated;
grant execute on function public.set_my_avatar(text) to authenticated;
grant execute on function public.set_public_shop(uuid, boolean, text, text) to authenticated;
grant execute on function public.backup_store(uuid, text) to authenticated;
grant execute on function public.restore_store_backup(uuid) to authenticated;
-- El catálogo público lo puede leer cualquier persona (anon), pero solo lo que expone la función
grant execute on function public.get_public_shop(text) to anon, authenticated;
grant execute on function public.get_public_images(text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- OPCIONAL · Respaldo diario automático aunque nadie abra la app
-- ---------------------------------------------------------------------
-- 1. Supabase → Database → Extensions → busca "pg_cron" → actívalo.
-- 2. Quita los dos guiones (--) de las líneas de abajo y ejecútalas:
--
-- select cron.schedule('respaldo-diario', '0 7 * * *', $$ select public.backup_all_stores() $$);
--
-- (Para quitarlo: select cron.unschedule('respaldo-diario');)

-- Recargar el esquema de la API
notify pgrst, 'reload schema';
