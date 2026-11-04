-- =====================================================================
-- MiNegocio7pro · v1.7 · Cierres de caja e informes numerados + historial de documentos
-- =====================================================================
-- Requiere haber ejecutado antes 8-recibos-numerados.sql.
-- Qué agrega:
--   * Numeración correlativa por tienda para:
--       - Cierres de caja (y su tabla/imagen):  ANA-C-000001, ANA-C-000002...
--         Un mismo día tiene SIEMPRE el mismo número (si se vuelve a generar, se reutiliza).
--       - Informes de venta (Excel / CSV):       ANA-I-000001, ANA-I-000002...
--     El número lo da la base de datos en un solo paso: nunca se repite.
--   * Historial: se guarda una copia de cada recibo, cierre e informe para
--     revisarlo y reenviarlo desde el menú "Recibos y cierres".
--
-- PASO A PASO
--   1. Supabase → SQL Editor → New query.
--   2. Pega todo este archivo y toca Run. Debe decir "Success".
--   3. Ejecuta 4-verificar.sql: todo debe decir OK.
-- Se puede ejecutar varias veces sin riesgo; no borra datos.
-- =====================================================================

-- Copia del recibo (productos, cliente, datos de factura...) para revisarlo y reenviarlo
alter table public.store_receipts add column if not exists data jsonb;
alter table public.store_receipts add column if not exists updated_at timestamptz;

-- Contadores por tipo de documento
create table if not exists public.store_doc_counters (
  store_id uuid not null references public.stores(id) on delete cascade,
  kind     text not null,
  seq      bigint not null default 0,
  primary key (store_id, kind)
);
alter table public.store_doc_counters enable row level security;
drop policy if exists store_doc_counters_select on public.store_doc_counters;
create policy store_doc_counters_select on public.store_doc_counters for select to authenticated using (public.is_store_member(store_id));

-- Documentos emitidos (cierres e informes)
create table if not exists public.store_documents (
  store_id       uuid not null references public.stores(id) on delete cascade,
  kind           text not null check (kind in ('cierre', 'informe')),
  seq            bigint not null,
  code           text not null,
  ref            text,               -- cierre: la fecha (2026-11-04); informe: vacío
  total          numeric,
  data           jsonb,
  issued_by      uuid default auth.uid(),
  issued_by_name text,
  issued_at      timestamptz not null default now(),
  updated_at     timestamptz,
  primary key (store_id, kind, seq)
);
create unique index if not exists store_documents_code_idx on public.store_documents (store_id, code);
create unique index if not exists store_documents_ref_idx on public.store_documents (store_id, kind, ref) where ref is not null;
alter table public.store_documents enable row level security;
drop policy if exists store_documents_select on public.store_documents;
create policy store_documents_select on public.store_documents for select to authenticated using (public.is_store_member(store_id));
-- (no hay políticas de insertar/editar: solo se escribe con las funciones de abajo)

-- Emite (o reutiliza, si ya existe para esa fecha) el número de un cierre o informe
create or replace function public.issue_document(p_store uuid, p_kind text, p_ref text, p_data jsonb, p_total numeric, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_seq bigint;
  v_prefix text;
  v_code text;
  v_letter text := case p_kind when 'cierre' then 'C' when 'informe' then 'I' else null end;
begin
  if not public.is_store_member(p_store) then raise exception 'No perteneces a esta tienda'; end if;
  if v_letter is null then raise exception 'Tipo de documento no válido'; end if;

  -- El cierre de un día ya numerado conserva su número (se actualiza la copia)
  if p_ref is not null then
    update public.store_documents set data = coalesce(p_data, data), total = coalesce(p_total, total), updated_at = now()
     where store_id = p_store and kind = p_kind and ref = p_ref
    returning code, seq into v_code, v_seq;
    if v_code is not null then return json_build_object('code', v_code, 'seq', v_seq, 'existed', true); end if;
  end if;

  select coalesce(nullif(receipt_prefix, ''), public.receipt_default_prefix(name, id)) into v_prefix from public.stores where id = p_store;
  if v_prefix is null then raise exception 'Tienda no encontrada'; end if;

  -- El contador se bloquea mientras se usa: dos personas a la vez esperan su turno
  insert into public.store_doc_counters (store_id, kind, seq) values (p_store, p_kind, 1)
  on conflict (store_id, kind) do update set seq = public.store_doc_counters.seq + 1
  returning seq into v_seq;

  v_code := v_prefix || '-' || v_letter || '-' || lpad(v_seq::text, 6, '0');
  insert into public.store_documents (store_id, kind, seq, code, ref, total, data, issued_by_name)
  values (p_store, p_kind, v_seq, v_code, p_ref, p_total, p_data, p_name);
  return json_build_object('code', v_code, 'seq', v_seq, 'existed', false);
exception when unique_violation then
  -- Otra persona numeró el mismo día al mismo tiempo: se usa ese número
  select code, seq into v_code, v_seq from public.store_documents where store_id = p_store and kind = p_kind and ref = p_ref;
  if v_code is null then raise; end if;
  return json_build_object('code', v_code, 'seq', v_seq, 'existed', true);
end $$;

-- Guarda la copia de un recibo ya emitido (para revisarlo y reenviarlo)
create or replace function public.save_receipt_data(p_store uuid, p_code text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_store_member(p_store) then raise exception 'No perteneces a esta tienda'; end if;
  update public.store_receipts set data = p_data, updated_at = now() where store_id = p_store and code = p_code;
end $$;


-- Registro de ventas (reemplaza la versión del archivo 1).
-- Si una venta llega a la nube DESPUÉS de que se numeró su recibo (venta guardada sin
-- conexión o reintento), toma el número del recibo al guardarse.
create or replace function public.register_sale(p_sale jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := (p_sale ->> 'store_id')::uuid;
  v_qty numeric := coalesce((p_sale ->> 'quantity')::numeric, 1);
begin
  if not public.is_store_member(v_store) then raise exception 'No perteneces a esta tienda'; end if;
  -- Si la venta ya se guardó (reintento sin conexión), no hacer nada
  if exists (select 1 from public.sales s where s.id::text = p_sale ->> 'id') then return; end if;

  -- (ahora también guarda el cliente de las ventas a fiado)
  insert into public.sales (id, date, product_id, product_name, actual_price, quantity, profit, payment_method, seller_name, store_id, seller_uid, customer_id, customer_name)
  select r.id, coalesce(r.date, now()), r.product_id, r.product_name, r.actual_price, r.quantity, r.profit,
         r.payment_method, r.seller_name, v_store, auth.uid(), r.customer_id, r.customer_name
  from jsonb_populate_record(null::public.sales, p_sale) r;

  update public.sales s set receipt_no = sr.code
    from public.store_receipts sr
   where s.id::text = p_sale ->> 'id' and sr.store_id = v_store and (p_sale ->> 'id') = any(sr.sale_ids);

  update public.products p set stock = p.stock - v_qty
  where p.id::text = p_sale ->> 'product_id' and p.store_id = v_store;
end $$;

revoke all on function public.issue_document(uuid, text, text, jsonb, numeric, text) from public, anon;
revoke all on function public.save_receipt_data(uuid, text, jsonb) from public, anon;
grant execute on function public.issue_document(uuid, text, text, jsonb, numeric, text) to authenticated;
grant execute on function public.save_receipt_data(uuid, text, jsonb) to authenticated;
grant select on public.store_documents, public.store_doc_counters to authenticated;

notify pgrst, 'reload schema';
