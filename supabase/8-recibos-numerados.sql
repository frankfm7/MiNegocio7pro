-- =====================================================================
-- MiNegocio7pro · v1.6 · Recibos de venta numerados (correlativos por tienda)
-- =====================================================================
-- Qué agrega:
--   * Cada tienda tiene su CÓDIGO de recibo (ej. "PA7F3") y su contador.
--   * Cada recibo recibe el número siguiente: PA7F3-000001, PA7F3-000002...
--     El número lo da la base de datos en un solo paso (bloqueando la fila de la
--     tienda), así aunque varios vendedores vendan al mismo tiempo NUNCA se repite
--     ni se salta un número.
--   * Registro de todos los recibos emitidos (store_receipts) y el número en cada venta.
--   * Datos de la tienda para el recibo (teléfono, dirección, NIT...), compartidos con el equipo.
--
-- PASO A PASO
--   1. Supabase → SQL Editor → New query.
--   2. Pega todo este archivo y toca Run. Debe decir "Success".
--   3. Ejecuta 4-verificar.sql: todo debe decir OK.
-- Se puede ejecutar varias veces sin riesgo; no borra datos.
-- =====================================================================

alter table public.stores add column if not exists receipt_prefix text;
alter table public.stores add column if not exists receipt_seq bigint not null default 0;
alter table public.stores add column if not exists receipt_info jsonb not null default '{}'::jsonb;
alter table public.sales  add column if not exists receipt_no text;
create index if not exists sales_receipt_idx on public.sales (store_id, receipt_no);

-- Registro de recibos emitidos (uno por número; la clave impide duplicados)
create table if not exists public.store_receipts (
  store_id       uuid not null references public.stores(id) on delete cascade,
  seq            bigint not null,
  code           text not null,
  sale_ids       text[] not null default '{}',
  total          numeric,
  issued_by      uuid default auth.uid(),
  issued_by_name text,
  issued_at      timestamptz not null default now(),
  primary key (store_id, seq)
);
create unique index if not exists store_receipts_code_idx on public.store_receipts (store_id, code);
alter table public.store_receipts enable row level security;
drop policy if exists store_receipts_select on public.store_receipts;
create policy store_receipts_select on public.store_receipts for select to authenticated using (public.is_store_member(store_id));
-- (no hay políticas de insertar/editar: solo se escribe con las funciones de abajo)

-- Código por defecto: iniciales del nombre + 3 caracteres del id (ej. "Perfumería Ana" → "PA7F3")
create or replace function public.receipt_default_prefix(p_name text, p_id uuid)
returns text language sql immutable as $$
  select coalesce(nullif(left(regexp_replace(upper(
           (select string_agg(left(w, 1), '') from regexp_split_to_table(
              translate(coalesce(p_name, ''), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '\s+') w)
         ), '[^A-Z0-9]', '', 'g'), 3), ''), 'R')
         || upper(left(replace(p_id::text, '-', ''), 3))
$$;

-- Emite el siguiente número de recibo de la tienda (atómico: nunca se repite)
create or replace function public.issue_receipt(p_store uuid, p_sale_ids text[], p_total numeric, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_seq bigint;
  v_prefix text;
  v_code text;
begin
  if not public.is_store_member(p_store) then raise exception 'No perteneces a esta tienda'; end if;
  -- El UPDATE bloquea la fila de la tienda hasta terminar: dos ventas a la vez esperan su turno
  update public.stores
     set receipt_seq = receipt_seq + 1,
         receipt_prefix = coalesce(nullif(receipt_prefix, ''), public.receipt_default_prefix(name, id))
   where id = p_store
  returning receipt_seq, receipt_prefix into v_seq, v_prefix;
  if v_seq is null then raise exception 'Tienda no encontrada'; end if;
  v_code := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  insert into public.store_receipts (store_id, seq, code, sale_ids, total, issued_by_name)
  values (p_store, v_seq, v_code, coalesce(p_sale_ids, '{}'), p_total, p_name);
  update public.sales set receipt_no = v_code where store_id = p_store and id = any(coalesce(p_sale_ids, '{}'));
  return json_build_object('seq', v_seq, 'code', v_code);
end $$;

-- Agrega ventas a un recibo ya emitido ("Agregar más productos a esta venta")
create or replace function public.attach_receipt_sales(p_store uuid, p_code text, p_sale_ids text[], p_add_total numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_store_member(p_store) then raise exception 'No perteneces a esta tienda'; end if;
  update public.store_receipts
     set sale_ids = sale_ids || coalesce(p_sale_ids, '{}'), total = coalesce(total, 0) + coalesce(p_add_total, 0)
   where store_id = p_store and code = p_code;
  if not found then raise exception 'Recibo % no encontrado', p_code; end if;
  update public.sales set receipt_no = p_code where store_id = p_store and id = any(coalesce(p_sale_ids, '{}'));
end $$;

-- Configuración del recibo (solo administradores): código, número inicial y datos de la tienda
create or replace function public.set_receipt_settings(p_store uuid, p_prefix text, p_start_at bigint, p_info jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := nullif(left(regexp_replace(upper(coalesce(p_prefix, '')), '[^A-Z0-9]', '', 'g'), 8), '');
  v_seq bigint;
begin
  if not public.is_store_manager(p_store) then raise exception 'Solo los administradores pueden cambiar el recibo'; end if;
  update public.stores
     set receipt_prefix = coalesce(v_prefix, receipt_prefix, public.receipt_default_prefix(name, id)),
         -- Solo se puede adelantar la numeración (nunca retroceder: evitaría duplicados)
         receipt_seq = greatest(receipt_seq, coalesce(p_start_at, 1) - 1),
         receipt_info = coalesce(p_info, receipt_info)
   where id = p_store
  returning receipt_seq, receipt_prefix into v_seq, v_prefix;
  return json_build_object('next', v_seq + 1, 'prefix', v_prefix);
end $$;

revoke all on function public.issue_receipt(uuid, text[], numeric, text) from public, anon;
revoke all on function public.attach_receipt_sales(uuid, text, text[], numeric) from public, anon;
revoke all on function public.set_receipt_settings(uuid, text, bigint, jsonb) from public, anon;
grant execute on function public.issue_receipt(uuid, text[], numeric, text) to authenticated;
grant execute on function public.attach_receipt_sales(uuid, text, text[], numeric) to authenticated;
grant execute on function public.set_receipt_settings(uuid, text, bigint, jsonb) to authenticated;
grant select on public.store_receipts to authenticated;

notify pgrst, 'reload schema';
