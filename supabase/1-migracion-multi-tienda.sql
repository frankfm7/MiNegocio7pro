-- =====================================================================
-- MiNegocio7pro · Migración a tiendas separadas (multi-tienda)
-- =====================================================================
-- Ejecuta este archivo UNA VEZ en Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin problema (no borra datos).
--
-- Qué hace:
--   * Crea las tablas de tiendas, miembros e invitaciones.
--   * Agrega store_id a catálogos, productos, ventas y QRs para que cada
--     tienda vea SOLO sus datos.
--   * Activa la seguridad por filas (RLS): quien descargue la app sin
--     iniciar sesión NO puede leer ningún dato de la nube.
--   * Agrega los campos de contenido (ml, g, L...) a los productos.
--   * Bloquea la tabla antigua "users" (tenía contraseñas sin cifrar).
--
-- Después de ejecutarlo:
--   1. En la app crea tu cuenta con tu correo y crea tu tienda.
--   2. Ejecuta 2-mover-mis-datos.sql (con tu correo) para pasar tus
--      catálogos actuales a tu tienda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tablas de datos (se crean solo si no existen)
-- ---------------------------------------------------------------------
create table if not exists public.catalogs (
  id text primary key,
  name text not null,
  label text,
  color text,
  cover text,
  favorite boolean default false
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  brand text,
  type text,
  category text,
  cost_price numeric default 0,
  sale_price numeric default 0,
  min_price numeric default 0,
  stock numeric default 0,
  sold boolean default false,
  catalog_id text,
  image_url text,
  description text,
  barcode text,
  offer_text text
);

create table if not exists public.sales (
  id text primary key,
  date timestamptz default now(),
  product_id text,
  product_name text,
  actual_price numeric default 0,
  quantity numeric default 1,
  profit numeric default 0,
  payment_method text,
  seller_name text
);

create table if not exists public.qrs (
  id text primary key,
  user_id text,
  image text,
  label text,
  is_primary boolean default false,
  role_owner boolean default false
);

-- ---------------------------------------------------------------------
-- 2. Tiendas, miembros e invitaciones
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'vendedor' check (role in ('admin', 'coadmin', 'supervisor', 'vendedor')),
  name text,
  email text,
  status text not null default 'active' check (status in ('active', 'blocked')),
  joined_at timestamptz not null default now(),
  last_seen timestamptz,
  primary key (store_id, user_id)
);

create table if not exists public.store_invites (
  code text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null default 'vendedor' check (role in ('admin', 'coadmin', 'supervisor', 'vendedor')),
  max_uses integer not null default 1,
  uses integer not null default 0,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Columnas nuevas en las tablas existentes
-- ---------------------------------------------------------------------
alter table public.catalogs add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.products add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.sales    add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.qrs      add column if not exists store_id uuid references public.stores(id) on delete cascade;

alter table public.products add column if not exists content_value text;
alter table public.products add column if not exists content_unit  text;
alter table public.sales    add column if not exists seller_uid uuid;

create index if not exists catalogs_store_idx on public.catalogs(store_id);
create index if not exists products_store_idx on public.products(store_id);
create index if not exists sales_store_idx    on public.sales(store_id);
create index if not exists qrs_store_idx      on public.qrs(store_id);
create index if not exists members_user_idx   on public.store_members(user_id);

-- ---------------------------------------------------------------------
-- 4. Funciones de ayuda (permisos)
-- ---------------------------------------------------------------------
create or replace function public.my_store_role(sid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.store_members
  where store_id = sid and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_store_member(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_store_role(sid) is not null
$$;

create or replace function public.is_store_manager(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_store_role(sid) in ('admin', 'coadmin'), false)
$$;

create or replace function public.store_owner(sid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select owner_id from public.stores where id = sid
$$;

-- ---------------------------------------------------------------------
-- 5. Seguridad por filas (RLS)
-- ---------------------------------------------------------------------
alter table public.stores        enable row level security;
alter table public.store_members enable row level security;
alter table public.store_invites enable row level security;
alter table public.catalogs      enable row level security;
alter table public.products      enable row level security;
alter table public.sales         enable row level security;
alter table public.qrs           enable row level security;

-- Tabla antigua de usuarios: se bloquea por completo (contraseñas sin cifrar)
do $$ begin
  if to_regclass('public.users') is not null then
    execute 'alter table public.users enable row level security';
  end if;
end $$;

-- Borrar políticas anteriores de estas tablas (para que solo queden las nuevas)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('stores','store_members','store_invites','catalogs','products','sales','qrs','users')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Tiendas
create policy stores_select on public.stores for select to authenticated using (public.is_store_member(id));
create policy stores_update on public.stores for update to authenticated
  using (public.my_store_role(id) = 'admin') with check (public.my_store_role(id) = 'admin');

-- Miembros
create policy members_select on public.store_members for select to authenticated using (public.is_store_member(store_id));
create policy members_update on public.store_members for update to authenticated
  using (
    public.is_store_manager(store_id)
    and user_id <> public.store_owner(store_id)
    and (public.my_store_role(store_id) = 'admin' or role <> 'admin')
  )
  with check (public.my_store_role(store_id) = 'admin' or role <> 'admin');
create policy members_delete on public.store_members for delete to authenticated
  using (
    user_id <> public.store_owner(store_id)
    and (user_id = auth.uid() or (public.is_store_manager(store_id) and (public.my_store_role(store_id) = 'admin' or role <> 'admin')))
  );

-- Invitaciones (solo administradores de la tienda)
create policy invites_select on public.store_invites for select to authenticated using (public.is_store_manager(store_id));
create policy invites_update on public.store_invites for update to authenticated
  using (public.is_store_manager(store_id)) with check (public.is_store_manager(store_id));
create policy invites_delete on public.store_invites for delete to authenticated using (public.is_store_manager(store_id));

-- Catálogos y productos: los ven los miembros, los editan admin / co-admin
create policy catalogs_select on public.catalogs for select to authenticated using (public.is_store_member(store_id));
create policy catalogs_insert on public.catalogs for insert to authenticated with check (public.is_store_manager(store_id));
create policy catalogs_update on public.catalogs for update to authenticated
  using (public.is_store_manager(store_id)) with check (public.is_store_manager(store_id));
create policy catalogs_delete on public.catalogs for delete to authenticated using (public.is_store_manager(store_id));

create policy products_select on public.products for select to authenticated using (public.is_store_member(store_id));
create policy products_insert on public.products for insert to authenticated with check (public.is_store_manager(store_id));
create policy products_update on public.products for update to authenticated
  using (public.is_store_manager(store_id)) with check (public.is_store_manager(store_id));
create policy products_delete on public.products for delete to authenticated using (public.is_store_manager(store_id));

-- Ventas: las registra cualquier miembro, las borra admin / co-admin
create policy sales_select on public.sales for select to authenticated using (public.is_store_member(store_id));
create policy sales_insert on public.sales for insert to authenticated with check (public.is_store_member(store_id));
create policy sales_update on public.sales for update to authenticated
  using (public.is_store_manager(store_id)) with check (public.is_store_manager(store_id));
create policy sales_delete on public.sales for delete to authenticated using (public.is_store_manager(store_id));

-- QR de cobro: los ven los miembros; cada uno gestiona los suyos
create policy qrs_select on public.qrs for select to authenticated using (public.is_store_member(store_id));
create policy qrs_insert on public.qrs for insert to authenticated
  with check (public.is_store_member(store_id) and user_id::text = auth.uid()::text);
create policy qrs_update on public.qrs for update to authenticated
  using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text and public.is_store_member(store_id));
create policy qrs_delete on public.qrs for delete to authenticated using (user_id::text = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 6. Funciones que usa la app (RPC)
-- ---------------------------------------------------------------------

-- Crear una tienda nueva: quien la crea queda como Administrador (dueño)
create or replace function public.create_store(p_name text, p_owner_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_store uuid;
  v_email text;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'El nombre de la tienda es obligatorio'; end if;
  select email into v_email from auth.users where id = v_uid;
  insert into public.stores (name, owner_id) values (trim(p_name), v_uid) returning id into v_store;
  insert into public.store_members (store_id, user_id, role, name, email)
  values (v_store, v_uid, 'admin', coalesce(nullif(trim(p_owner_name), ''), split_part(v_email, '@', 1)), v_email);
  return v_store;
end $$;

-- Crear un código de invitación (ej. MC7-K3MX9QPA)
create or replace function public.create_invite(p_store uuid, p_role text default 'vendedor', p_days integer default 7, p_max_uses integer default 1)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_hex text;
  i integer;
begin
  if not public.is_store_manager(p_store) then raise exception 'Solo los administradores pueden invitar'; end if;
  if p_role not in ('admin', 'coadmin', 'supervisor', 'vendedor') then raise exception 'Rol no válido'; end if;
  if p_role = 'admin' and public.my_store_role(p_store) <> 'admin' then raise exception 'Solo el administrador puede invitar administradores'; end if;
  loop
    v_hex := replace(gen_random_uuid()::text, '-', '');
    v_code := 'MC7-';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, (get_byte(decode(substr(v_hex, i * 2 - 1, 2), 'hex'), 0) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.store_invites where code = v_code);
  end loop;
  insert into public.store_invites (code, store_id, role, max_uses, expires_at, created_by)
  values (v_code, p_store, p_role, greatest(coalesce(p_max_uses, 1), 1),
          case when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days) else null end, auth.uid());
  return v_code;
end $$;

-- Unirse a una tienda con un código de invitación
create or replace function public.join_store(p_code text, p_name text default null)
returns table (store_id uuid, store_name text, role text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.store_invites%rowtype;
  v_email text;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_inv from public.store_invites i
  where i.code = upper(trim(p_code)) for update;
  if not found or v_inv.revoked then raise exception 'Código de invitación no válido'; end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then raise exception 'El código de invitación ya venció'; end if;

  if not exists (select 1 from public.store_members m where m.store_id = v_inv.store_id and m.user_id = v_uid) then
    if v_inv.uses >= v_inv.max_uses then raise exception 'El código de invitación ya fue usado'; end if;
    select email into v_email from auth.users where id = v_uid;
    insert into public.store_members (store_id, user_id, role, name, email)
    values (v_inv.store_id, v_uid, v_inv.role, coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), v_email);
    update public.store_invites set uses = uses + 1 where code = v_inv.code;
  end if;

  return query
    select s.id, s.name, m.role from public.stores s
    join public.store_members m on m.store_id = s.id and m.user_id = v_uid
    where s.id = v_inv.store_id;
end $$;

-- Registrar una venta y descontar stock en un solo paso (vendedores incluidos)
create or replace function public.register_sale(p_sale jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := (p_sale ->> 'store_id')::uuid;
  v_qty numeric := coalesce((p_sale ->> 'quantity')::numeric, 1);
begin
  if not public.is_store_member(v_store) then raise exception 'No perteneces a esta tienda'; end if;
  -- Si la venta ya se guardó (reintento sin conexión), no hacer nada
  if exists (select 1 from public.sales s where s.id::text = p_sale ->> 'id') then return; end if;

  insert into public.sales (id, date, product_id, product_name, actual_price, quantity, profit, payment_method, seller_name, store_id, seller_uid)
  select r.id, r.date, r.product_id, r.product_name, r.actual_price, r.quantity, r.profit,
         r.payment_method, r.seller_name, v_store, auth.uid()
  from jsonb_populate_record(null::public.sales, p_sale) r;

  update public.products p set stock = p.stock - v_qty
  where p.id::text = p_sale ->> 'product_id' and p.store_id = v_store;
end $$;

-- Marcar actividad del usuario (para la lista "Hoy" del equipo)
create or replace function public.touch_member(p_store uuid)
returns void language sql security definer set search_path = public as $$
  update public.store_members set last_seen = now() where store_id = p_store and user_id = auth.uid()
$$;

-- Cambiar mi nombre visible en una tienda
create or replace function public.update_my_member_name(p_store uuid, p_name text)
returns void language sql security definer set search_path = public as $$
  update public.store_members set name = trim(p_name)
  where store_id = p_store and user_id = auth.uid() and coalesce(trim(p_name), '') <> ''
$$;

revoke all on function public.create_store(text, text) from public, anon;
revoke all on function public.create_invite(uuid, text, integer, integer) from public, anon;
revoke all on function public.join_store(text, text) from public, anon;
revoke all on function public.register_sale(jsonb) from public, anon;
revoke all on function public.touch_member(uuid) from public, anon;
revoke all on function public.update_my_member_name(uuid, text) from public, anon;
grant execute on function public.create_store(text, text) to authenticated;
grant execute on function public.create_invite(uuid, text, integer, integer) to authenticated;
grant execute on function public.join_store(text, text) to authenticated;
grant execute on function public.register_sale(jsonb) to authenticated;
grant execute on function public.touch_member(uuid) to authenticated;
grant execute on function public.update_my_member_name(uuid, text) to authenticated;

-- Recargar el esquema de la API
notify pgrst, 'reload schema';
