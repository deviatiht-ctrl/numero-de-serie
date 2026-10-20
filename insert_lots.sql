-- ===== AI INFLUENCE — Ensèsyon 1 000 Tikè pa Lo (LOT 1 a LOT 10) =====
-- Kouri sa a nan Supabase SQL Editor si baz done w la deja kreye.

-- 1) Asire kolòn lot_number ak lot_name egziste
alter table if exists public.aif_tickets add column if not exists lot_number integer default 1;
alter table if exists public.aif_tickets add column if not exists lot_name text default 'LOT 1';
create index if not exists aif_tickets_lot_idx on public.aif_tickets (lot_number);

-- 2) Insérer ou mettre à jour les 1 000 billets : AJ9128001 à AJ9129000
insert into public.aif_tickets (
  serial_number,
  lot_number,
  lot_name,
  status,
  price
)
select
  'AJ' || s::text as serial_number,
  case
    when s between 9128001 and 9128100 then 1
    when s between 9128101 and 9128200 then 2
    when s between 9128201 and 9128300 then 3
    when s between 9128301 and 9128400 then 4
    when s between 9128401 and 9128500 then 5
    when s between 9128501 and 9128600 then 6
    when s between 9128601 and 9128700 then 7
    when s between 9128701 and 9128800 then 8
    when s between 9128801 and 9128900 then 9
    when s between 9128901 and 9129000 then 10
  end as lot_number,
  'LOT ' || (
    case
      when s between 9128001 and 9128100 then 1
      when s between 9128101 and 9128200 then 2
      when s between 9128201 and 9128300 then 3
      when s between 9128301 and 9128400 then 4
      when s between 9128401 and 9128500 then 5
      when s between 9128501 and 9128600 then 6
      when s between 9128601 and 9128700 then 7
      when s between 9128701 and 9128800 then 8
      when s between 9128801 and 9128900 then 9
      when s between 9128901 and 9129000 then 10
    end
  ) as lot_name,
  'stock' as status,
  10 as price
from generate_series(9128001, 9129000) as s
on conflict (serial_number) do update
set
  lot_number = excluded.lot_number,
  lot_name   = excluded.lot_name;

-- 3) Tcheke kantite ki monte pa lo pou verifye
select 
  lot_name, 
  min(serial_number) as de, 
  max(serial_number) as a, 
  count(*) as total_billets,
  count(*) filter (where status = 'stock') as en_stock,
  count(*) filter (where status = 'sold') as vendus,
  count(*) filter (where status = 'used') as entres
from public.aif_tickets
where serial_number between 'AJ9128001' and 'AJ9129000'
group by lot_number, lot_name
order by lot_number;
