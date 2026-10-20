-- ===== AI INFLUENCE — Schéma Supabase & Enregistrement des 1 000 Billets =====
-- À exécuter dans : Supabase Dashboard -> SQL Editor -> New query -> Run
-- Préfixe "aif_" pour éviter tout conflit avec les tables existantes du projet.

-- 1) Table des billets — cycle de vie sécurisé : stock -> sold -> used
create table if not exists public.aif_tickets (
  id                  uuid primary key default gen_random_uuid(),
  serial_number       text not null unique,        -- Format: AJ9128001 à AJ9129000
  lot_number          integer not null default 1,  -- 1 à 10
  lot_name            text not null default 'LOT 1', -- 'LOT 1' à 'LOT 10'
  status              text not null default 'stock'
                      check (status in ('stock', 'sold', 'used')),
  price               integer not null default 10, -- 10 HTG

  -- Enregistrement initial
  added_by            uuid references auth.users(id),
  added_by_email      text,

  -- Vente
  seller_id           uuid references auth.users(id),
  seller_email        text,
  sold_at             timestamptz,

  -- Contrôle à l'entrée (Porte)
  checked_in_by       uuid references auth.users(id),
  checked_in_by_email text,
  checked_in_at       timestamptz,

  created_at          timestamptz not null default now()
);

-- Si la table existait déjà sans lot_number / lot_name, on s'assure d'ajouter les colonnes :
alter table public.aif_tickets add column if not exists lot_number integer default 1;
alter table public.aif_tickets add column if not exists lot_name text default 'LOT 1';

-- Index pour des performances ultrarapides lors du scan caméra (< 5ms)
create index if not exists aif_tickets_serial_idx     on public.aif_tickets (serial_number);
create index if not exists aif_tickets_status_idx     on public.aif_tickets (status);
create index if not exists aif_tickets_lot_idx        on public.aif_tickets (lot_number);
create index if not exists aif_tickets_created_idx    on public.aif_tickets (created_at desc);

-- 2) Row Level Security (RLS)
alter table public.aif_tickets enable row level security;

drop policy if exists "equipe peut lire les tickets"          on public.aif_tickets;
drop policy if exists "equipe peut ajouter des tickets"       on public.aif_tickets;
drop policy if exists "equipe peut modifier les tickets"      on public.aif_tickets;
drop policy if exists "createur peut supprimer ticket stock"  on public.aif_tickets;

create policy "equipe peut lire les tickets"
  on public.aif_tickets for select
  to authenticated
  using (true);

create policy "equipe peut ajouter des tickets"
  on public.aif_tickets for insert
  to authenticated
  with check (auth.uid() = added_by or added_by is null);

create policy "equipe peut modifier les tickets"
  on public.aif_tickets for update
  to authenticated
  using (true)
  with check (true);

create policy "createur peut supprimer ticket stock"
  on public.aif_tickets for delete
  to authenticated
  using (auth.uid() = added_by and status = 'stock');

-- 3) FONCTION RPC HAUTE SÉCURITÉ : Validation Atomique à l'Entrée (Race-Condition Free)
-- Cette fonction verrouille la ligne (SELECT ... FOR UPDATE) pour empêcher qu'un billet
-- soit scanné simultanément par 2 caméras différentes à 2 portes différentes.
create or replace function public.aif_validate_ticket_scan(
  p_serial text,
  p_user_id uuid,
  p_user_email text
)
returns json
language plpgsql
security definer
as $$
declare
  v_ticket record;
  v_serial_clean text;
begin
  -- Nettoyage du numéro de série (majuscules, sans espaces)
  v_serial_clean := upper(regexp_replace(p_serial, '\s+', '', 'g'));

  -- Recherche avec verrou exclusif (FOR UPDATE)
  select * into v_ticket
  from public.aif_tickets
  where serial_number = v_serial_clean
  for update;

  -- 1) Billet introuvable
  if not found then
    return json_build_object(
      'success', false,
      'code', 'FAUX_BILLET',
      'verdict', 'FAUX BILLET',
      'message', 'Numéro introuvable dans le système. Ce billet ne provient pas de notre stock officiel.',
      'serial_number', v_serial_clean
    );
  end if;

  -- 2) Billet jamais vendu (En stock)
  if v_ticket.status = 'stock' then
    return json_build_object(
      'success', false,
      'code', 'JAMAIS_VENDU',
      'verdict', 'BILLET JAMAIS VENDU',
      'message', 'Ce billet authentique n''a jamais été encaissé / marqué comme vendu.',
      'ticket', row_to_json(v_ticket)
    );
  end if;

  -- 3) Billet déjà entré (Fraude ou photocopie)
  if v_ticket.status = 'used' then
    return json_build_object(
      'success', false,
      'code', 'DEJA_UTILISE',
      'verdict', 'BILLET DÉJÀ ENTRÉ',
      'message', 'Ce billet a déjà servi à entrer le ' || to_char(v_ticket.checked_in_at, 'DD Mon YYYY à HH24:MI') || ' par ' || coalesce(v_ticket.checked_in_by_email, 'un agent'),
      'ticket', row_to_json(v_ticket)
    );
  end if;

  -- 4) Billet vendu et valide -> passage à "used"
  update public.aif_tickets
  set
    status = 'used',
    checked_in_by = p_user_id,
    checked_in_by_email = p_user_email,
    checked_in_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  return json_build_object(
    'success', true,
    'code', 'ENTREE_AUTORISEE',
    'verdict', 'ENTRÉE AUTORISÉE',
    'message', 'Billet valide ! Accès autorisé pour le ' || v_ticket.serial_number || ' (' || v_ticket.lot_name || ').',
    'ticket', row_to_json(v_ticket)
  );
end;
$$;

-- 4) GÉNÉRATION AUTOMATIQUE DES 1 000 BILLETS EN 10 LOTS
-- AJ9128001 à AJ9129000 (100 billets par lot)
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

-- 5) Realtime
do $$
begin
  alter publication supabase_realtime add table public.aif_tickets;
exception when duplicate_object then
  null;
end $$;
