select r.revision, r.estado from (
  select 'Tabla ' || t as revision, case when to_regclass('public.' || t) is not null then 'OK' else 'FALTA' end as estado
  from unnest(array['catalogs','products','sales','qrs','stores','store_members','store_invites','customers','customer_movements','price_history','store_backups','store_receipts']) t
  union all
  select 'Columna ' || c, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name || '.' || column_name = c) then 'OK' else 'FALTA' end
  from unnest(array['products.catalog_price','products.sku','products.common_name','stores.receipt_prefix','stores.receipt_seq','stores.receipt_info','sales.receipt_no']) c
  union all
  select 'Función ' || f, case when to_regprocedure('public.' || f) is not null then 'OK' else 'FALTA' end
  from unnest(array['issue_receipt(uuid,text[],numeric,text)','attach_receipt_sales(uuid,text,text[],numeric)','set_receipt_settings(uuid,text,bigint,jsonb)']) f
) r
order by (r.estado = 'OK'), r.revision;