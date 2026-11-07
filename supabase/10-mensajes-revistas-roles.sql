-- =====================================================================
-- MiNegocio7pro · 10: mensajes, revistas de la empresa, roles y ventas olvidadas
-- =====================================================================
-- Ejecutar UNA vez en Supabase → SQL Editor (después del 9). Se puede volver a
-- ejecutar sin problema. No borra ni cambia datos existentes: solo agrega.
--
--  1. Ventas: columna "note" (observación, ej. "venta olvidada") y register_sale la guarda.
--  2. Roles: nuevo rol "eventual" (vendedor por unos días: el acceso vence solo).
--  3. QR de cobro del dueño visible para todo el equipo.
--  4. Mensajes dentro de la app: chat del equipo y pedidos de clientes (con fotos,
--     videos y audios en Storage).
--  5. Revistas de la empresa (Ésika, L'Bel, Cyzone, Yanbal...) para que los clientes
--     pidan desde el catálogo público + datos de la tienda (dirección, entrega).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ventas: observación
-- ---------------------------------------------------------------------
alter table public.sales add column if not exists note text;

create or replace function public.register_sale(p_sale jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := (p_sale ->> 'store_id')::uuid;
  v_qty numeric := coalesce((p_sale ->> 'quantity')::numeric, 1);
begin
  if not public.is_store_member(v_store) then raise exception 'No perteneces a esta tienda'; end if;
  if exists (select 1 from public.sales s where s.id::text = p_sale ->> 'id') then return; end if;

  insert into public.sales (id, date, product_id, product_name, actual_price, quantity, profit, payment_method, seller_name, store_id, seller_uid, customer_id, customer_name, note)
  select r.id, coalesce(r.date, now()), r.product_id, r.product_name, r.actual_price, r.quantity, r.profit,
         r.payment_method, r.seller_name, v_store, auth.uid(), r.customer_id, r.customer_name, nullif(left(coalesce(r.note, ''), 300), '')
  from jsonb_populate_record(null::public.sales, p_sale) r;

  update public.sales s set receipt_no = sr.code
    from public.store_receipts sr
   where s.id::text = p_sale ->> 'id' and sr.store_id = v_store and (p_sale ->> 'id') = any(sr.sale_ids);

  -- Una venta olvidada que se registra después puede no descontar stock (ya se entregó y se ajustó)
  if coalesce((p_sale ->> 'skip_stock')::boolean, false) then return; end if;
  update public.products p set stock = p.stock - v_qty
  where p.id::text = p_sale ->> 'product_id' and p.store_id = v_store;
end $$;
revoke all on function public.register_sale(jsonb) from public, anon;
grant execute on function public.register_sale(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Roles: dueño (admin) · administrador (coadmin) · supervisor · vendedor · vendedor eventual
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select con.conname, rel.relname from pg_constraint con join pg_class rel on rel.oid = con.conrelid
           where rel.relname in ('store_members', 'store_invites') and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;
alter table public.store_members add constraint store_members_role_check check (role in ('admin', 'coadmin', 'supervisor', 'vendedor', 'eventual'));
alter table public.store_invites add constraint store_invites_role_check check (role in ('admin', 'coadmin', 'supervisor', 'vendedor', 'eventual'));
alter table public.store_members add column if not exists access_until timestamptz;
alter table public.store_invites add column if not exists access_days integer;

-- Un acceso vencido cuenta como "no es miembro"
create or replace function public.my_store_role(sid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.store_members
  where store_id = sid and user_id = auth.uid() and status = 'active'
    and (access_until is null or access_until > now())
$$;

drop function if exists public.create_invite(uuid, text, integer, integer);
create or replace function public.create_invite(p_store uuid, p_role text default 'vendedor', p_days integer default 7, p_max_uses integer default 1, p_access_days integer default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_hex text;
  i integer;
begin
  if not public.is_store_manager(p_store) then raise exception 'Solo los administradores pueden invitar'; end if;
  if p_role not in ('admin', 'coadmin', 'supervisor', 'vendedor', 'eventual') then raise exception 'Rol no válido'; end if;
  if p_role = 'admin' and public.my_store_role(p_store) <> 'admin' then raise exception 'Solo el dueño puede invitar a otro dueño'; end if;
  loop
    v_hex := replace(gen_random_uuid()::text, '-', '');
    v_code := 'MC7-';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, (get_byte(decode(substr(v_hex, i * 2 - 1, 2), 'hex'), 0) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.store_invites where code = v_code);
  end loop;
  insert into public.store_invites (code, store_id, role, max_uses, expires_at, created_by, access_days)
  values (v_code, p_store, p_role, greatest(coalesce(p_max_uses, 1), 1),
          case when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days) else null end, auth.uid(),
          case when p_role = 'eventual' then greatest(coalesce(p_access_days, 3), 1) else null end);
  return v_code;
end $$;
revoke all on function public.create_invite(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.create_invite(uuid, text, integer, integer, integer) to authenticated;

create or replace function public.join_store(p_code text, p_name text default null)
returns table (store_id uuid, store_name text, role text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.store_invites%rowtype;
  v_email text;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_inv from public.store_invites i where i.code = upper(trim(p_code)) for update;
  if not found or v_inv.revoked then raise exception 'Código de invitación no válido'; end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then raise exception 'El código de invitación ya venció'; end if;

  if not exists (select 1 from public.store_members m where m.store_id = v_inv.store_id and m.user_id = v_uid) then
    if v_inv.uses >= v_inv.max_uses then raise exception 'El código de invitación ya fue usado'; end if;
    select email into v_email from auth.users where id = v_uid;
    insert into public.store_members (store_id, user_id, role, name, email, access_until)
    values (v_inv.store_id, v_uid, v_inv.role, coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), v_email,
            case when v_inv.role = 'eventual' then now() + make_interval(days => coalesce(v_inv.access_days, 3)) else null end);
    update public.store_invites set uses = uses + 1 where code = v_inv.code;
  end if;

  return query
    select s.id, s.name, m.role from public.stores s
    join public.store_members m on m.store_id = s.id and m.user_id = v_uid
    where s.id = v_inv.store_id;
end $$;
revoke all on function public.join_store(text, text) from public, anon;
grant execute on function public.join_store(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. QR de cobro del dueño (lo ven administradores, supervisores y vendedores)
-- ---------------------------------------------------------------------
create or replace function public.owner_payment_qr(p_store uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(q) from public.qrs q
  where public.is_store_member(p_store) and q.store_id = p_store
    and q.user_id::text in (select m.user_id::text from public.store_members m where m.store_id = p_store and m.role = 'admin')
  order by q.is_primary desc nulls last
  limit 1
$$;
revoke all on function public.owner_payment_qr(uuid) from public, anon;
grant execute on function public.owner_payment_qr(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Mensajes: chat del equipo y pedidos de clientes
-- ---------------------------------------------------------------------
create table if not exists public.store_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  channel text not null default 'equipo' check (channel in ('equipo', 'pedidos')),
  sender_uid uuid references auth.users(id) on delete set null,
  sender_name text not null default '',
  body text not null default '',
  -- [{ "path": "store/uuid.jpg", "type": "image|video|audio|file", "name": "..." }]
  media jsonb not null default '[]'::jsonb,
  -- pedido de un cliente: { items: [...], total, phone, note, source: "catalogo|revista" }
  order_data jsonb,
  status text not null default 'nuevo' check (status in ('nuevo', 'visto', 'preparando', 'listo', 'entregado', 'cancelado')),
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists store_messages_idx on public.store_messages(store_id, channel, created_at desc);
alter table public.store_messages enable row level security;

drop policy if exists msg_select on public.store_messages;
drop policy if exists msg_insert on public.store_messages;
drop policy if exists msg_update on public.store_messages;
drop policy if exists msg_delete on public.store_messages;
create policy msg_select on public.store_messages for select to authenticated using (public.is_store_member(store_id));
create policy msg_insert on public.store_messages for insert to authenticated
  with check (public.is_store_member(store_id) and sender_uid = auth.uid());
-- El estado del pedido lo cambia cualquiera del equipo; el texto no se edita
create policy msg_update on public.store_messages for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy msg_delete on public.store_messages for delete to authenticated
  using (sender_uid = auth.uid() or public.is_store_manager(store_id));
grant select, insert, update, delete on public.store_messages to authenticated;

-- Marcar como leído (sin poder tocar el resto del mensaje)
create or replace function public.mark_messages_read(p_store uuid, p_channel text)
returns void language sql security definer set search_path = public as $$
  update public.store_messages set read_by = array_append(read_by, auth.uid())
   where store_id = p_store and channel = p_channel and public.is_store_member(p_store)
     and not (auth.uid() = any(read_by));
$$;
revoke all on function public.mark_messages_read(uuid, text) from public, anon;
grant execute on function public.mark_messages_read(uuid, text) to authenticated;

-- Pedido enviado desde el catálogo público (sin cuenta): llega a "Pedidos" de la tienda
create or replace function public.send_public_order(p_slug text, p_name text, p_phone text, p_body text, p_order jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_id uuid;
begin
  select id into v_store from public.stores s where lower(s.public_slug) = lower(trim(p_slug)) and s.public_enabled;
  if v_store is null then raise exception 'Tienda no disponible'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Escribe tu nombre'; end if;
  -- Freno contra abusos: máximo 20 pedidos por minuto por tienda
  if (select count(*) from public.store_messages m where m.store_id = v_store and m.channel = 'pedidos' and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Demasiados pedidos seguidos, intenta en un minuto';
  end if;
  insert into public.store_messages (store_id, channel, sender_name, body, order_data)
  values (v_store, 'pedidos', left(trim(p_name), 80), left(coalesce(p_body, ''), 4000),
          coalesce(p_order, '{}'::jsonb) || jsonb_build_object('phone', left(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), 20)))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.send_public_order(text, text, text, text, jsonb) from public;
grant execute on function public.send_public_order(text, text, text, text, jsonb) to anon, authenticated;

-- Avisos al instante (Realtime)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.store_messages';
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Revistas de la empresa + datos de la tienda para el catálogo público
-- ---------------------------------------------------------------------
alter table public.stores add column if not exists public_info jsonb not null default '{}'::jsonb;

create table if not exists public.store_magazines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  brand text not null default '',
  title text not null default '',
  -- rutas de las páginas en el Storage "revistas" (en orden)
  pages jsonb not null default '[]'::jsonb,
  valid_until date,
  -- días que tarda en llegar el pedido de esta revista (si es distinto al general)
  eta_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists store_magazines_idx on public.store_magazines(store_id);
alter table public.store_magazines enable row level security;
drop policy if exists mag_select on public.store_magazines;
drop policy if exists mag_write on public.store_magazines;
create policy mag_select on public.store_magazines for select to authenticated using (public.is_store_member(store_id));
create policy mag_write on public.store_magazines for all to authenticated
  using (public.is_store_manager(store_id)) with check (public.is_store_manager(store_id));
grant select, insert, update, delete on public.store_magazines to authenticated;

create or replace function public.set_public_info(p_store uuid, p_info jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_store_manager(p_store) then raise exception 'Solo los administradores pueden cambiar esto'; end if;
  update public.stores set public_info = coalesce(p_info, '{}'::jsonb) where id = p_store;
end $$;
revoke all on function public.set_public_info(uuid, jsonb) from public, anon;
grant execute on function public.set_public_info(uuid, jsonb) to authenticated;

-- El catálogo público ahora también trae las revistas y los datos de la tienda
create or replace function public.get_public_shop(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.stores%rowtype;
begin
  select * into v from public.stores s where lower(s.public_slug) = lower(trim(p_slug)) and s.public_enabled;
  if not found then return null; end if;
  return jsonb_build_object(
    'store', jsonb_build_object('name', v.name, 'whatsapp', v.public_whatsapp, 'info', coalesce(v.public_info, '{}'::jsonb)),
    'catalogs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'label', c.label, 'color', c.color) order by c.name)
                          from public.catalogs c where c.store_id = v.id), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', p.id, 'name', p.name, 'brand', p.brand, 'type', p.type, 'category', p.category,
                            'price', p.sale_price, 'stock', p.stock, 'catalog_id', p.catalog_id, 'description', p.description,
                            'offer', p.offer_text, 'cv', p.content_value, 'cu', p.content_unit,
                            'has_image', coalesce(p.image_url, '') <> '') order by p.name)
                          from public.products p where p.store_id = v.id and p.stock > 0), '[]'::jsonb),
    'magazines', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'brand', m.brand, 'title', m.title, 'pages', m.pages,
                              'valid_until', m.valid_until, 'eta_days', m.eta_days) order by m.created_at desc)
                           from public.store_magazines m
                           where m.store_id = v.id and m.active and (m.valid_until is null or m.valid_until >= current_date)), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_public_shop(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Storage: fotos/videos/audios de los mensajes (privado) y páginas de revistas (público)
-- ---------------------------------------------------------------------
-- Las carpetas empiezan con el id de la tienda: <store_id>/<archivo>
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('mensajes', 'mensajes', false, 52428800), ('revistas', 'revistas', true, 10485760)
    on conflict (id) do nothing;

    execute 'drop policy if exists "mensajes_leer" on storage.objects';
    execute 'drop policy if exists "mensajes_subir" on storage.objects';
    execute 'drop policy if exists "mensajes_borrar" on storage.objects';
    execute 'drop policy if exists "revistas_subir" on storage.objects';
    execute 'drop policy if exists "revistas_borrar" on storage.objects';
    execute $p$create policy "mensajes_leer" on storage.objects for select to authenticated
      using (bucket_id = 'mensajes' and public.is_store_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "mensajes_subir" on storage.objects for insert to authenticated
      with check (bucket_id = 'mensajes' and public.is_store_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "mensajes_borrar" on storage.objects for delete to authenticated
      using (bucket_id = 'mensajes' and public.is_store_manager(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "revistas_subir" on storage.objects for insert to authenticated
      with check (bucket_id = 'revistas' and public.is_store_manager(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "revistas_borrar" on storage.objects for delete to authenticated
      using (bucket_id = 'revistas' and public.is_store_manager(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

notify pgrst, 'reload schema';
