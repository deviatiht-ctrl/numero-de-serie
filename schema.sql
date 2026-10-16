-- ===== AI INFLUENCE — Schéma Supabase =====
-- À exécuter dans : Supabase Dashboard -> SQL Editor -> New query -> Run
-- Préfixe "aif_" pour éviter tout conflit avec les tables existantes du projet.
--
-- ATTENTION : ce script SUPPRIME et recrée la table aif_tickets.
-- La table est vide pour l'instant, donc aucune perte. Ne pas ré-exécuter
-- après le lancement des ventes sans sauvegarde.

drop table if exists public.aif_tickets cascade;

-- 1) Table des billets — cycle de vie : stock -> sold -> used
create table public.aif_tickets (
  id                 uuid primary key default gen_random_uuid(),
  serial_number      text not null unique,      -- unique = pas de doublon
  status             text not null default 'stock'
                     check (status in ('stock', 'sold', 'used')),
  price              integer not null default 10,   -- prix en gourdes (HTG)

  -- Qui a ajouté le numéro au stock
  added_by           uuid references auth.users(id),
  added_by_email     text,

  -- Qui l'a vendu (quand l'acheteur paie ses 10 HTG)
  seller_id          uuid references auth.users(id),
  seller_email       text,
  sold_at            timestamptz,

  -- Qui l'a contrôlé à l'entrée de l'événement
  checked_in_by      uuid references auth.users(id),
  checked_in_by_email text,
  checked_in_at      timestamptz,

  created_at         timestamptz not null default now()
);

-- Index pour des recherches rapides
create index aif_tickets_serial_idx  on public.aif_tickets (serial_number);
create index aif_tickets_status_idx  on public.aif_tickets (status);
create index aif_tickets_created_idx on public.aif_tickets (created_at desc);

-- 2) Row Level Security (RLS)
alter table public.aif_tickets enable row level security;

-- Ré-exécution possible : on supprime les anciennes policies d'abord
drop policy if exists "equipe peut lire les tickets"          on public.aif_tickets;
drop policy if exists "equipe peut ajouter des tickets"       on public.aif_tickets;
drop policy if exists "equipe peut modifier les tickets"      on public.aif_tickets;
drop policy if exists "createur peut supprimer ticket stock"  on public.aif_tickets;

-- Tout membre connecté peut LIRE tous les billets (stats + contrôles)
create policy "equipe peut lire les tickets"
  on public.aif_tickets for select
  to authenticated
  using (true);

-- Un membre peut AJOUTER des numéros au stock (added_by = lui-même)
create policy "equipe peut ajouter des tickets"
  on public.aif_tickets for insert
  to authenticated
  with check (auth.uid() = added_by);

-- Un membre peut MODIFIER un billet (vendre / contrôler à l'entrée)
create policy "equipe peut modifier les tickets"
  on public.aif_tickets for update
  to authenticated
  using (true)
  with check (true);

-- Seul celui qui a ajouté un numéro peut le SUPPRIMER,
-- et uniquement tant qu'il est encore "stock" (correction de faute de frappe)
create policy "createur peut supprimer ticket stock"
  on public.aif_tickets for delete
  to authenticated
  using (auth.uid() = added_by and status = 'stock');

-- 3) Realtime — le dashboard se met à jour quand un autre membre agit
do $$
begin
  alter publication supabase_realtime add table public.aif_tickets;
exception when duplicate_object then
  null; -- déjà ajoutée, on ignore
end $$;

-- ===== CRÉER LES COMPTES DE L'ÉQUIPE =====
-- Dans : Supabase Dashboard -> Authentication -> Users -> "Add user"
-- Saisissez email + mot de passe pour chaque membre de l'équipe.
-- (Pas d'inscription publique — seul l'admin crée les comptes.)
