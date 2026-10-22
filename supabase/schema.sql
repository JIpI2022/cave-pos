-- =====================================================================
--  CAVE & CAISSE - Schema PostgreSQL complet (Supabase)
--  A executer dans : Supabase > SQL Editor > New query > Run
--  Idempotent : peut etre rejoue (les objets sont recrees proprement).
--
--  Conventions metier
--   * Toutes les quantites de stock sont exprimees en UNITE DE BASE = 1 bouteille.
--     Un carton de 6 est donc enregistre comme 6 unites de base (champ pack_size).
--   * prix_achat_ht (purchase_price_ht) = cout d'une unite de base (1 bouteille) HT.
--   * prix_vente_ttc (sale_price_ttc)   = prix public d'une unite de base TTC.
--   * Les montants sont stockes en numeric(14,2) ; la devise est un simple parametre
--     d'affichage (EUR, FCFA...) defini dans app_settings.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TYPES ENUMERES
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'gerant', 'caissier');
  end if;
  if not exists (select 1 from pg_type where typname = 'product_unit') then
    create type public.product_unit as enum ('bouteille', 'carton_6', 'carton_12');
  end if;
  if not exists (select 1 from pg_type where typname = 'movement_type') then
    -- entree : reception fournisseur / sortie : vente
    -- transfert : deplacement entre emplacements (2 lignes liees)
    -- casse : perte, bris, peremption / ajustement : correction d'inventaire
    -- retour : annulation de vente ou retour d'article
    create type public.movement_type as enum
      ('entree', 'sortie', 'transfert', 'casse', 'ajustement', 'retour');
  end if;
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum ('validee', 'annulee');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('especes', 'carte', 'mobile_money');
  end if;
  if not exists (select 1 from pg_type where typname = 'cash_status') then
    create type public.cash_status as enum ('ouverte', 'cloturee');
  end if;
  if not exists (select 1 from pg_type where typname = 'inventory_status') then
    create type public.inventory_status as enum ('ouverte', 'validee', 'annulee');
  end if;
  if not exists (select 1 from pg_type where typname = 'reception_status') then
    create type public.reception_status as enum ('brouillon', 'validee');
  end if;
  if not exists (select 1 from pg_type where typname = 'discount_type') then
    create type public.discount_type as enum ('aucune', 'pourcentage', 'montant');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. PARAMETRES DE L'APPLICATION (table singleton, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id                   smallint primary key default 1 check (id = 1),
  company_name         text    not null default 'Ma Cave',
  address              text    default '',
  phone                text    default '',
  tax_id               text    default '',          -- SIRET / NIF / RCCM
  currency             text    not null default 'EUR',
  currency_symbol      text    not null default '€',
  currency_decimals    smallint not null default 2 check (currency_decimals between 0 and 3),
  timezone             text    not null default 'Europe/Paris', -- fuseau des rapports
  default_vat_rate     numeric(5,2) not null default 20.00,
  internal_code_prefix text    not null default 'CAV',
  internal_code_next   bigint  not null default 1,
  internal_code_padding smallint not null default 6,
  ticket_footer        text    default 'Merci de votre visite !',
  ticket_prefix        text    not null default 'T',
  low_stock_default    numeric(14,2) not null default 6,
  -- Operateurs de paiement mobile proposes en caisse (Orange Money, Wave...)
  mobile_money_operators text[] not null default array['Orange Money','MTN MoMo','Moov Money','Wave'],
  updated_at           timestamptz not null default now()
);
-- Colonnes ajoutees apres coup (permet de rejouer le script sur une base existante)
alter table public.app_settings add column if not exists timezone text not null default 'Europe/Paris';
alter table public.app_settings add column if not exists ticket_prefix text not null default 'T';
alter table public.app_settings add column if not exists low_stock_default numeric(14,2) not null default 6;
alter table public.app_settings add column if not exists mobile_money_operators text[] not null
  default array['Orange Money','MTN MoMo','Moov Money','Wave'];

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. UTILISATEURS & ROLES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role not null default 'caissier',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Le tout premier compte cree devient automatiquement « admin ».
-- Les suivants sont crees avec le role « caissier » (modifiable par un admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
  v_role     public.user_role;
begin
  select count(*) = 0 into v_is_first from public.profiles;
  v_role := case
              when v_is_first then 'admin'::public.user_role
              when new.raw_user_meta_data ->> 'role' in ('admin','gerant','caissier')
                then (new.raw_user_meta_data ->> 'role')::public.user_role
              else 'caissier'::public.user_role
            end;

  insert into public.profiles (id, email, full_name, role)
  values (new.id,
          coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email,''), '@', 1)),
          v_role)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de securite (SECURITY DEFINER pour eviter la recursion RLS)
create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- « gerant ou plus » : acces stock, rapports, annulations
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin','gerant'), false) $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin','gerant','caissier'), false) $$;

-- ---------------------------------------------------------------------
-- 4. JOURNAL D'AUDIT
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  user_email  text default '',
  action      text not null,            -- ex. 'vente.annulation', 'produit.prix'
  entity      text not null,            -- nom de la table concernee
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_log (created_at desc);
create index if not exists idx_audit_entity on public.audit_log (entity, entity_id);

create or replace function public.log_audit(
  p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_log (user_id, user_email, action, entity, entity_id, details)
  values (auth.uid(),
          coalesce((select email from public.profiles where id = auth.uid()), 'systeme'),
          p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- 5. REFERENTIELS
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  label      text not null,
  sort_order smallint not null default 100,
  active     boolean not null default true
);

create table if not exists public.locations (
  id      uuid primary key default gen_random_uuid(),
  code    text not null unique,
  name    text not null,
  kind    text not null default 'cave',   -- cave / depot / reserve / boutique
  is_sales_point boolean not null default false,  -- emplacement par defaut de la caisse
  active  boolean not null default true
);

create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text default '',
  phone      text default '',
  email      text default '',
  address    text default '',
  notes      text default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_suppliers_name on public.suppliers (lower(name));

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text default '',
  email      text default '',
  address    text default '',
  notes      text default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_name on public.customers (lower(name));
create index if not exists idx_customers_phone on public.customers (phone);

-- ---------------------------------------------------------------------
-- 6. PRODUITS
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  category_id       uuid references public.categories (id) on delete set null,
  appellation       text default '',          -- appellation / origine
  vintage           smallint,                 -- millesime
  volume_ml         integer,                  -- contenance en millilitres (750, 1500...)
  supplier_id       uuid references public.suppliers (id) on delete set null,
  purchase_price_ht numeric(14,2) not null default 0 check (purchase_price_ht >= 0),
  sale_price_ttc    numeric(14,2) not null default 0 check (sale_price_ttc >= 0),
  vat_rate          numeric(5,2)  not null default 20.00 check (vat_rate >= 0 and vat_rate < 100),
  barcode           text,                     -- EAN-13 / UPC existant
  internal_code     text,                     -- code maison genere (ex. CAV000123)
  unit              public.product_unit not null default 'bouteille',
  pack_size         smallint not null default 1 check (pack_size > 0), -- bouteilles par colis vendu
  stock_alert_threshold numeric(14,2) not null default 6 check (stock_alert_threshold >= 0),
  photo_url         text default '',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists uq_products_barcode
  on public.products (barcode) where barcode is not null and barcode <> '';
create unique index if not exists uq_products_internal_code
  on public.products (internal_code) where internal_code is not null and internal_code <> '';
create index if not exists idx_products_name on public.products (lower(name));
create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_products_active on public.products (active);

-- Generation d'un code interne unique (compteur dans app_settings)
create or replace function public.next_internal_code()
returns text
language plpgsql security definer set search_path = public
as $$
declare v_prefix text; v_num bigint; v_pad smallint;
begin
  update public.app_settings
     set internal_code_next = internal_code_next + 1
   where id = 1
  returning internal_code_prefix, internal_code_next - 1, internal_code_padding
    into v_prefix, v_num, v_pad;
  return v_prefix || lpad(v_num::text, v_pad, '0');
end $$;

-- Avant insertion : si le produit n'a pas de code-barres, on lui attribue un code interne.
create or replace function public.products_before_write()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.barcode       := nullif(btrim(coalesce(new.barcode, '')), '');
  new.internal_code := nullif(btrim(coalesce(new.internal_code, '')), '');

  if new.barcode is null and new.internal_code is null then
    new.internal_code := public.next_internal_code();
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_products_before_write on public.products;
create trigger trg_products_before_write
  before insert or update on public.products
  for each row execute function public.products_before_write();

-- Audit des modifications de prix (exigence : tracer toute modification tarifaire)
create or replace function public.products_audit_price()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
       old.sale_price_ttc    is distinct from new.sale_price_ttc
    or old.purchase_price_ht is distinct from new.purchase_price_ht
    or old.vat_rate          is distinct from new.vat_rate) then
    perform public.log_audit('produit.prix', 'products', new.id::text, jsonb_build_object(
      'produit', new.name,
      'avant', jsonb_build_object('achat_ht', old.purchase_price_ht,
                                  'vente_ttc', old.sale_price_ttc, 'tva', old.vat_rate),
      'apres', jsonb_build_object('achat_ht', new.purchase_price_ht,
                                  'vente_ttc', new.sale_price_ttc, 'tva', new.vat_rate)));
  elsif tg_op = 'DELETE' then
    perform public.log_audit('produit.suppression', 'products', old.id::text,
                             jsonb_build_object('produit', old.name, 'code', coalesce(old.barcode, old.internal_code)));
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_products_audit on public.products;
create trigger trg_products_audit
  after update or delete on public.products
  for each row execute function public.products_audit_price();

-- ---------------------------------------------------------------------
-- 7. STOCK : niveaux + mouvements traces
-- ---------------------------------------------------------------------
-- Niveau de stock par (produit, emplacement). Table maintenue UNIQUEMENT
-- par le trigger ci-dessous : on n'ecrit jamais dedans directement.
create table if not exists public.stock_levels (
  product_id  uuid not null references public.products (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  quantity    numeric(14,2) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (product_id, location_id)
);
create index if not exists idx_stock_levels_location on public.stock_levels (location_id);

create table if not exists public.stock_movements (
  id             bigserial primary key,
  product_id     uuid not null references public.products (id) on delete cascade,
  location_id    uuid not null references public.locations (id) on delete restrict,
  type           public.movement_type not null,
  -- delta signe applique a l'emplacement, en unite de base (bouteilles) :
  -- positif = entree, negatif = sortie.
  quantity_delta numeric(14,2) not null check (quantity_delta <> 0),
  unit_cost_ht   numeric(14,2),              -- cout unitaire au moment du mouvement
  reason         text not null default '',   -- motif obligatoire cote applicatif
  reference      text default '',            -- n° de ticket, n° de bon de reception...
  related_id     text,                       -- id de la vente / reception / inventaire
  transfer_group uuid,                       -- relie les 2 lignes d'un transfert
  user_id        uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_mov_product  on public.stock_movements (product_id, created_at desc);
create index if not exists idx_mov_location on public.stock_movements (location_id, created_at desc);
create index if not exists idx_mov_created  on public.stock_movements (created_at desc);
create index if not exists idx_mov_type     on public.stock_movements (type);

-- TRIGGER CENTRAL : tout mouvement met a jour le niveau de stock.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  insert into public.stock_levels (product_id, location_id, quantity, updated_at)
  values (new.product_id, new.location_id, new.quantity_delta, now())
  on conflict (product_id, location_id) do update
    set quantity   = public.stock_levels.quantity + excluded.quantity,
        updated_at = now();
  return new;
end $$;

drop trigger if exists trg_apply_stock_movement on public.stock_movements;
create trigger trg_apply_stock_movement
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- Les mouvements sont immuables : on ne modifie ni ne supprime l'historique.
create or replace function public.stock_movements_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Les mouvements de stock sont immuables : creez un mouvement inverse.';
end $$;

drop trigger if exists trg_mov_immutable on public.stock_movements;
create trigger trg_mov_immutable
  before update or delete on public.stock_movements
  for each row execute function public.stock_movements_immutable();

-- Enregistrement d'un mouvement simple (entree / casse / ajustement / sortie manuelle)
create or replace function public.record_movement(
  p_product_id  uuid,
  p_location_id uuid,
  p_type        public.movement_type,
  p_quantity    numeric,                 -- quantite POSITIVE en unite de base
  p_reason      text,
  p_reference   text default '',
  p_unit_cost   numeric default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_delta numeric; v_id bigint;
begin
  if not public.is_manager() then
    raise exception 'Droits insuffisants : seuls les gerants et administrateurs peuvent saisir un mouvement.';
  end if;
  if coalesce(p_quantity, 0) = 0 then
    raise exception 'La quantite doit etre differente de zero.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Le motif est obligatoire.';
  end if;

  -- Sens du mouvement : les sorties/casses sont toujours negatives,
  -- l'ajustement accepte un signe libre (correction positive ou negative).
  v_delta := case p_type
               when 'entree'     then abs(p_quantity)
               when 'retour'     then abs(p_quantity)
               when 'sortie'     then -abs(p_quantity)
               when 'casse'      then -abs(p_quantity)
               else p_quantity
             end;

  insert into public.stock_movements
    (product_id, location_id, type, quantity_delta, unit_cost_ht, reason, reference, user_id)
  values (p_product_id, p_location_id, p_type, v_delta, p_unit_cost, btrim(p_reason), coalesce(p_reference,''), auth.uid())
  returning id into v_id;

  if p_type in ('casse', 'ajustement') then
    perform public.log_audit('stock.' || p_type::text, 'stock_movements', v_id::text,
      jsonb_build_object('produit_id', p_product_id, 'emplacement_id', p_location_id,
                         'quantite', v_delta, 'motif', p_reason));
  end if;
  return v_id;
end $$;

-- Transfert entre deux emplacements : 2 mouvements lies par transfer_group
create or replace function public.transfer_stock(
  p_product_id uuid,
  p_from_location uuid,
  p_to_location uuid,
  p_quantity numeric,
  p_reason text default 'Transfert')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_group uuid := gen_random_uuid(); v_available numeric;
begin
  if not public.is_manager() then
    raise exception 'Droits insuffisants pour effectuer un transfert.';
  end if;
  if p_from_location = p_to_location then
    raise exception 'Les emplacements source et destination doivent etre differents.';
  end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'La quantite transferee doit etre positive.';
  end if;

  select coalesce(quantity, 0) into v_available
    from public.stock_levels
   where product_id = p_product_id and location_id = p_from_location;

  if coalesce(v_available, 0) < p_quantity then
    raise exception 'Stock insuffisant a la source (% disponible).', coalesce(v_available, 0);
  end if;

  insert into public.stock_movements
    (product_id, location_id, type, quantity_delta, reason, transfer_group, user_id)
  values (p_product_id, p_from_location, 'transfert', -abs(p_quantity), p_reason, v_group, auth.uid()),
         (p_product_id, p_to_location,   'transfert',  abs(p_quantity), p_reason, v_group, auth.uid());

  return v_group;
end $$;

-- ---------------------------------------------------------------------
-- 8. FOURNISSEURS : BONS DE RECEPTION
-- ---------------------------------------------------------------------
create sequence if not exists public.reception_number_seq start 1;

create table if not exists public.receptions (
  id           uuid primary key default gen_random_uuid(),
  number       text not null default ('BR' || lpad(nextval('public.reception_number_seq')::text, 5, '0')),
  supplier_id  uuid references public.suppliers (id) on delete set null,
  location_id  uuid not null references public.locations (id) on delete restrict,
  received_on  date not null default current_date,
  status       public.reception_status not null default 'brouillon',
  invoice_ref  text default '',
  notes        text default '',
  total_ht     numeric(14,2) not null default 0,
  user_id      uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists uq_receptions_number on public.receptions (number);
create index if not exists idx_receptions_supplier on public.receptions (supplier_id);
create index if not exists idx_receptions_date on public.receptions (received_on desc);

create table if not exists public.reception_lines (
  id                uuid primary key default gen_random_uuid(),
  reception_id      uuid not null references public.receptions (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete restrict,
  quantity          numeric(14,2) not null check (quantity > 0),  -- nb de colis ou de bouteilles saisies
  pack_size         smallint not null default 1 check (pack_size > 0), -- bouteilles par colis
  purchase_price_ht numeric(14,2) not null default 0 check (purchase_price_ht >= 0), -- par unite de base
  update_product_price boolean not null default true
);
create index if not exists idx_reception_lines_reception on public.reception_lines (reception_id);

-- Validation d'un bon de reception : entree en stock + mise a jour du prix d'achat
create or replace function public.validate_reception(p_reception_id uuid)
returns public.receptions
language plpgsql security definer set search_path = public
as $$
declare r public.receptions; l record; v_total numeric(14,2) := 0;
begin
  if not public.is_manager() then
    raise exception 'Droits insuffisants pour valider une reception.';
  end if;

  select * into r from public.receptions where id = p_reception_id for update;
  if r.id is null then raise exception 'Bon de reception introuvable.'; end if;
  if r.status = 'validee' then raise exception 'Ce bon de reception est deja valide.'; end if;
  if not exists (select 1 from public.reception_lines where reception_id = p_reception_id) then
    raise exception 'Impossible de valider un bon de reception vide.';
  end if;

  for l in select * from public.reception_lines where reception_id = p_reception_id loop
    -- Entree en stock, convertie en unite de base (bouteilles)
    insert into public.stock_movements
      (product_id, location_id, type, quantity_delta, unit_cost_ht, reason, reference, related_id, user_id)
    values (l.product_id, r.location_id, 'entree', l.quantity * l.pack_size, l.purchase_price_ht,
            'Reception fournisseur', r.number, r.id::text, auth.uid());

    -- Mise a jour du prix d'achat du produit si demande
    if l.update_product_price and l.purchase_price_ht > 0 then
      update public.products set purchase_price_ht = l.purchase_price_ht where id = l.product_id;
    end if;

    v_total := v_total + round(l.quantity * l.pack_size * l.purchase_price_ht, 2);
  end loop;

  update public.receptions
     set status = 'validee', validated_at = now(), total_ht = v_total, user_id = coalesce(user_id, auth.uid())
   where id = p_reception_id
  returning * into r;

  perform public.log_audit('reception.validation', 'receptions', r.id::text,
    jsonb_build_object('numero', r.number, 'total_ht', v_total));
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 9. INVENTAIRE (session de comptage par scan)
-- ---------------------------------------------------------------------
create table if not exists public.inventory_sessions (
  id           uuid primary key default gen_random_uuid(),
  label        text not null default '',
  location_id  uuid not null references public.locations (id) on delete restrict,
  status       public.inventory_status not null default 'ouverte',
  notes        text default '',
  started_by   uuid references public.profiles (id) on delete set null,
  started_at   timestamptz not null default now(),
  validated_at timestamptz
);
create index if not exists idx_inv_sessions_status on public.inventory_sessions (status, started_at desc);

create table if not exists public.inventory_lines (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.inventory_sessions (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete restrict,
  theoretical_qty numeric(14,2) not null default 0,  -- stock theorique figé a la saisie
  counted_qty     numeric(14,2) not null default 0,  -- quantite comptee
  reason          text default '',                   -- motif de l'ecart
  updated_at      timestamptz not null default now(),
  unique (session_id, product_id)
);
create index if not exists idx_inv_lines_session on public.inventory_lines (session_id);

-- Ajout / incrementation d'une ligne d'inventaire par scan
create or replace function public.inventory_scan(
  p_session_id uuid, p_product_id uuid, p_qty numeric default 1)
returns public.inventory_lines
language plpgsql security definer set search_path = public
as $$
declare v_theo numeric(14,2); v_loc uuid; v_line public.inventory_lines;
begin
  if not public.is_manager() then
    raise exception 'Droits insuffisants pour saisir un inventaire.';
  end if;

  select location_id into v_loc from public.inventory_sessions
   where id = p_session_id and status = 'ouverte';
  if v_loc is null then raise exception 'Session d''inventaire introuvable ou deja cloturee.'; end if;

  select coalesce(quantity, 0) into v_theo from public.stock_levels
   where product_id = p_product_id and location_id = v_loc;

  insert into public.inventory_lines (session_id, product_id, theoretical_qty, counted_qty)
  values (p_session_id, p_product_id, coalesce(v_theo, 0), p_qty)
  on conflict (session_id, product_id) do update
    set counted_qty = public.inventory_lines.counted_qty + p_qty,
        updated_at  = now()
  returning * into v_line;
  return v_line;
end $$;

-- Validation de l'inventaire : genere un mouvement d'ajustement par ecart
create or replace function public.validate_inventory(p_session_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare s public.inventory_sessions; l record; v_count integer := 0; v_gap numeric;
begin
  if not public.is_manager() then
    raise exception 'Droits insuffisants pour valider un inventaire.';
  end if;

  select * into s from public.inventory_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'Session d''inventaire introuvable.'; end if;
  if s.status <> 'ouverte' then raise exception 'Cette session est deja cloturee.'; end if;

  for l in select * from public.inventory_lines where session_id = p_session_id loop
    -- On recalcule l'ecart par rapport au stock REEL au moment de la validation
    v_gap := l.counted_qty - coalesce(
      (select quantity from public.stock_levels
        where product_id = l.product_id and location_id = s.location_id), 0);

    if v_gap <> 0 then
      insert into public.stock_movements
        (product_id, location_id, type, quantity_delta, reason, reference, related_id, user_id)
      values (l.product_id, s.location_id, 'ajustement', v_gap,
              coalesce(nullif(btrim(l.reason), ''), 'Ecart d''inventaire'),
              'INV-' || left(p_session_id::text, 8), p_session_id::text, auth.uid());
      v_count := v_count + 1;
    end if;
  end loop;

  update public.inventory_sessions
     set status = 'validee', validated_at = now() where id = p_session_id;

  perform public.log_audit('inventaire.validation', 'inventory_sessions', p_session_id::text,
    jsonb_build_object('ecarts_appliques', v_count, 'emplacement_id', s.location_id));
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 10. CAISSE : sessions, ventes, paiements, retours
-- ---------------------------------------------------------------------
create table if not exists public.cash_sessions (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references public.locations (id) on delete restrict,
  status         public.cash_status not null default 'ouverte',
  opening_float  numeric(14,2) not null default 0 check (opening_float >= 0), -- fond de caisse
  opened_by      uuid references public.profiles (id) on delete set null,
  opened_at      timestamptz not null default now(),
  closed_by      uuid references public.profiles (id) on delete set null,
  closed_at      timestamptz,
  counted_cash   numeric(14,2),      -- especes comptees a la cloture
  expected_cash  numeric(14,2),      -- especes theoriques (fond + encaissements - remboursements)
  cash_gap       numeric(14,2),      -- ecart (compte - theorique)
  notes          text default ''
);
create index if not exists idx_cash_sessions_status on public.cash_sessions (status, opened_at desc);
-- Une seule caisse ouverte a la fois par emplacement
create unique index if not exists uq_cash_open_per_location
  on public.cash_sessions (location_id) where status = 'ouverte';

create sequence if not exists public.ticket_number_seq start 1;

create table if not exists public.sales (
  id              uuid primary key default gen_random_uuid(),
  ticket_number   bigint not null default nextval('public.ticket_number_seq'),
  ticket_ref      text not null default '',       -- ex. T000042 (prefixe parametrable)
  client_uuid     uuid not null,                  -- identifiant genere par le poste de caisse
  cash_session_id uuid references public.cash_sessions (id) on delete set null,
  location_id     uuid not null references public.locations (id) on delete restrict,
  customer_id     uuid references public.customers (id) on delete set null,
  user_id         uuid references public.profiles (id) on delete set null,
  status          public.sale_status not null default 'validee',
  total_ht        numeric(14,2) not null default 0,
  total_vat       numeric(14,2) not null default 0,
  total_ttc       numeric(14,2) not null default 0,
  discount_total  numeric(14,2) not null default 0,  -- remises lignes + remise ticket
  note            text default '',
  cancelled_by    uuid references public.profiles (id) on delete set null,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz not null default now()
);
-- Idempotence de la synchronisation hors ligne : un client_uuid = une seule vente
create unique index if not exists uq_sales_client_uuid on public.sales (client_uuid);
create unique index if not exists uq_sales_ticket_number on public.sales (ticket_number);
create index if not exists idx_sales_created on public.sales (created_at desc);
create index if not exists idx_sales_session on public.sales (cash_session_id);
create index if not exists idx_sales_customer on public.sales (customer_id);
create index if not exists idx_sales_user on public.sales (user_id);

create table if not exists public.sale_items (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references public.sales (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  label          text not null,                 -- libelle figé (historique)
  quantity       numeric(14,2) not null check (quantity > 0),      -- nb de colis/bouteilles vendus
  pack_size      smallint not null default 1,   -- bouteilles par colis vendu
  unit           text not null default 'bouteille',
  unit_price_ttc numeric(14,2) not null check (unit_price_ttc >= 0),
  vat_rate       numeric(5,2)  not null default 20,
  discount_type  public.discount_type not null default 'aucune',
  discount_value numeric(14,2) not null default 0,
  line_discount  numeric(14,2) not null default 0,  -- remise ligne + part de remise ticket
  line_ttc       numeric(14,2) not null default 0,  -- net a payer de la ligne
  line_ht        numeric(14,2) not null default 0,
  line_vat       numeric(14,2) not null default 0,
  unit_cost_ht   numeric(14,2) not null default 0,  -- cout d'achat figé (marge)
  position       smallint not null default 0
);
create index if not exists idx_sale_items_sale on public.sale_items (sale_id);
create index if not exists idx_sale_items_product on public.sale_items (product_id);

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales (id) on delete cascade,
  method       public.payment_method not null,
  amount       numeric(14,2) not null check (amount > 0),   -- montant impute a la vente
  tendered     numeric(14,2),                               -- montant remis par le client (especes)
  change_given numeric(14,2) not null default 0,            -- rendu monnaie
  reference    text default '',                             -- n° de transaction mobile money / carte
  -- Operateur du paiement mobile (Orange Money, MTN MoMo, Moov Money, Wave...).
  -- Vide pour les especes et la carte. Permet de rapprocher chaque compte
  -- separement a la cloture de caisse.
  operator     text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists idx_payments_sale on public.payments (sale_id);
alter table public.payments add column if not exists operator text not null default '';

create table if not exists public.sale_returns (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales (id) on delete cascade,
  sale_item_id uuid references public.sale_items (id) on delete set null,
  product_id   uuid references public.products (id) on delete set null,
  quantity     numeric(14,2) not null check (quantity > 0),  -- en colis/bouteilles vendus
  amount_ttc   numeric(14,2) not null default 0,
  reason       text not null,
  user_id      uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_returns_sale on public.sale_returns (sale_id);
create index if not exists idx_returns_created on public.sale_returns (created_at desc);

-- ---- Ouverture de caisse ------------------------------------------------
create or replace function public.open_cash_session(
  p_location_id uuid, p_opening_float numeric default 0, p_notes text default '')
returns public.cash_sessions
language plpgsql security definer set search_path = public
as $$
declare s public.cash_sessions;
begin
  if not public.is_staff() then raise exception 'Authentification requise.'; end if;
  if coalesce(p_opening_float, 0) < 0 then raise exception 'Le fond de caisse ne peut pas etre negatif.'; end if;

  if exists (select 1 from public.cash_sessions
              where location_id = p_location_id and status = 'ouverte') then
    raise exception 'Une caisse est deja ouverte sur cet emplacement.';
  end if;

  insert into public.cash_sessions (location_id, opening_float, opened_by, notes)
  values (p_location_id, coalesce(p_opening_float, 0), auth.uid(), coalesce(p_notes, ''))
  returning * into s;

  perform public.log_audit('caisse.ouverture', 'cash_sessions', s.id::text,
    jsonb_build_object('fond_de_caisse', s.opening_float));
  return s;
end $$;

-- ---- Especes theoriques d'une session (fond + ventes especes - rendus - remboursements)
create or replace function public.cash_session_expected(p_session_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select round(
      (select opening_float from public.cash_sessions where id = p_session_id)
    + coalesce((select sum(p.amount)
                  from public.payments p
                  join public.sales s on s.id = p.sale_id
                 where s.cash_session_id = p_session_id
                   and s.status = 'validee'
                   and p.method = 'especes'), 0)
    - coalesce((select sum(r.amount_ttc)
                  from public.sale_returns r
                  join public.sales s on s.id = r.sale_id
                 where s.cash_session_id = p_session_id), 0)
  , 2)
$$;

-- ---- Cloture de caisse (rapport Z) -------------------------------------
create or replace function public.close_cash_session(
  p_session_id uuid, p_counted_cash numeric, p_notes text default '')
returns public.cash_sessions
language plpgsql security definer set search_path = public
as $$
declare s public.cash_sessions; v_expected numeric(14,2);
begin
  if not public.is_staff() then raise exception 'Authentification requise.'; end if;

  select * into s from public.cash_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'Session de caisse introuvable.'; end if;
  if s.status = 'cloturee' then raise exception 'Cette caisse est deja cloturee.'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Le comptage des especes est obligatoire.';
  end if;

  v_expected := public.cash_session_expected(p_session_id);

  update public.cash_sessions
     set status = 'cloturee',
         closed_at = now(),
         closed_by = auth.uid(),
         counted_cash = round(p_counted_cash, 2),
         expected_cash = v_expected,
         cash_gap = round(p_counted_cash, 2) - v_expected,
         notes = case when coalesce(p_notes,'') = '' then notes
                      else coalesce(notes,'') || case when coalesce(notes,'') = '' then '' else E'\n' end || p_notes end
   where id = p_session_id
  returning * into s;

  perform public.log_audit('caisse.cloture', 'cash_sessions', s.id::text,
    jsonb_build_object('theorique', s.expected_cash, 'compte', s.counted_cash, 'ecart', s.cash_gap));
  return s;
end $$;

-- ---------------------------------------------------------------------
-- 11. RPC CENTRALE DE LA CAISSE : creation d'une vente
-- ---------------------------------------------------------------------
-- Tout est calcule et verifie cote serveur (le poste de caisse ne fait
-- qu'afficher). La fonction est IDEMPOTENTE sur « client_uuid » : rejouer
-- une vente mise en file d'attente hors ligne ne la duplique jamais.
--
-- Algorithme (strictement identique a src/lib/calc.ts, teste avec Vitest) :
--   1. ligne : brut = qte x PU TTC ; remise ligne (% ou montant) ; net
--   2. remise ticket calculee sur la somme des nets
--   3. remise ticket repartie au prorata des nets, le reliquat d'arrondi
--      etant impute a la derniere ligne (somme exacte garantie)
--   4. HT = round(TTC / (1 + taux/100), 2) ; TVA = TTC - HT
-- ---------------------------------------------------------------------
create or replace function public.pos_create_sale(p jsonb)
returns public.sales
language plpgsql security definer set search_path = public
as $$
declare
  v_sale      public.sales;
  v_items     jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_payments  jsonb := coalesce(p -> 'payments', '[]'::jsonb);
  n           integer;
  i           integer;
  it          jsonb;
  pay         jsonb;
  v_prod      public.products;
  v_gross     numeric(14,2);
  v_ldisc     numeric(14,2);
  nets        numeric[] := array[]::numeric[];
  discs       numeric[] := array[]::numeric[];
  v_sum_net   numeric(14,2) := 0;
  v_tdisc     numeric(14,2) := 0;
  v_alloc     numeric(14,2);
  v_running   numeric(14,2) := 0;
  v_ttc       numeric(14,2);
  v_ht        numeric(14,2);
  v_tot_ttc   numeric(14,2) := 0;
  v_tot_ht    numeric(14,2) := 0;
  v_tot_disc  numeric(14,2) := 0;
  v_paid      numeric(14,2) := 0;
  v_tolerance numeric(14,2);
  v_decimals  smallint;
  v_prefix    text;
  v_qty_base  numeric(14,2);
  v_client    uuid;
  v_loc       uuid;
begin
  if not public.is_staff() then
    raise exception 'Authentification requise pour enregistrer une vente.';
  end if;

  v_client := nullif(p ->> 'client_uuid', '')::uuid;
  if v_client is null then
    raise exception 'client_uuid manquant (identifiant de vente du poste de caisse).';
  end if;

  -- Idempotence : la vente a deja ete enregistree (double envoi, resynchro...)
  select * into v_sale from public.sales where client_uuid = v_client;
  if v_sale.id is not null then
    return v_sale;
  end if;

  n := jsonb_array_length(v_items);
  if n = 0 then raise exception 'Le panier est vide.'; end if;

  v_loc := nullif(p ->> 'location_id', '')::uuid;
  if v_loc is null then
    select id into v_loc from public.locations where is_sales_point and active order by code limit 1;
  end if;
  if v_loc is null then raise exception 'Aucun emplacement de vente defini.'; end if;

  select currency_decimals, ticket_prefix into v_decimals, v_prefix from public.app_settings where id = 1;
  v_tolerance := case when coalesce(v_decimals, 2) = 0 then 1 else 0.05 end;

  -- ---- Passe 1 : net par ligne -----------------------------------------
  for i in 1 .. n loop
    it := v_items -> (i - 1);
    v_gross := round((it ->> 'quantity')::numeric * (it ->> 'unit_price_ttc')::numeric, 2);
    if v_gross < 0 then raise exception 'Montant de ligne negatif interdit.'; end if;

    v_ldisc := case coalesce(it ->> 'discount_type', 'aucune')
                 when 'pourcentage' then round(v_gross * coalesce((it ->> 'discount_value')::numeric, 0) / 100, 2)
                 when 'montant'     then least(coalesce((it ->> 'discount_value')::numeric, 0), v_gross)
                 else 0 end;
    v_ldisc := greatest(v_ldisc, 0);

    nets  := array_append(nets, v_gross - v_ldisc);
    discs := array_append(discs, v_ldisc);
    v_sum_net := v_sum_net + (v_gross - v_ldisc);
  end loop;

  -- ---- Passe 2 : remise ticket -----------------------------------------
  v_tdisc := case coalesce(p ->> 'ticket_discount_type', 'aucune')
               when 'pourcentage' then round(v_sum_net * coalesce((p ->> 'ticket_discount_value')::numeric, 0) / 100, 2)
               when 'montant'     then least(coalesce((p ->> 'ticket_discount_value')::numeric, 0), v_sum_net)
               else 0 end;
  v_tdisc := greatest(least(v_tdisc, v_sum_net), 0);

  -- ---- Passe 3 : repartition au prorata + insertion de la vente --------
  insert into public.sales
    (client_uuid, cash_session_id, location_id, customer_id, user_id, note, created_at)
  values (v_client,
          nullif(p ->> 'cash_session_id', '')::uuid,
          v_loc,
          nullif(p ->> 'customer_id', '')::uuid,
          auth.uid(),
          coalesce(p ->> 'note', ''),
          coalesce(nullif(p ->> 'created_at', '')::timestamptz, now()))
  returning * into v_sale;

  update public.sales
     set ticket_ref = coalesce(v_prefix, 'T') || lpad(v_sale.ticket_number::text, 6, '0')
   where id = v_sale.id
  returning * into v_sale;

  for i in 1 .. n loop
    it := v_items -> (i - 1);

    -- Part de remise ticket imputee a la ligne (reliquat sur la derniere ligne)
    if v_tdisc = 0 or v_sum_net <= 0 then
      v_alloc := 0;
    elsif i < n then
      v_alloc := round(v_tdisc * nets[i] / v_sum_net, 2);
      v_running := v_running + v_alloc;
    else
      v_alloc := round(v_tdisc - v_running, 2);
    end if;

    v_ttc := nets[i] - v_alloc;
    v_ht  := round(v_ttc / (1 + coalesce((it ->> 'vat_rate')::numeric, 0) / 100), 2);

    select * into v_prod from public.products where id = nullif(it ->> 'product_id', '')::uuid;

    insert into public.sale_items
      (sale_id, product_id, label, quantity, pack_size, unit, unit_price_ttc, vat_rate,
       discount_type, discount_value, line_discount, line_ttc, line_ht, line_vat,
       unit_cost_ht, position)
    values (v_sale.id,
            v_prod.id,
            coalesce(nullif(it ->> 'label', ''), v_prod.name, 'Article'),
            (it ->> 'quantity')::numeric,
            coalesce((it ->> 'pack_size')::smallint, 1),
            coalesce(nullif(it ->> 'unit', ''), 'bouteille'),
            (it ->> 'unit_price_ttc')::numeric,
            coalesce((it ->> 'vat_rate')::numeric, 0),
            coalesce(nullif(it ->> 'discount_type', ''), 'aucune')::public.discount_type,
            coalesce((it ->> 'discount_value')::numeric, 0),
            discs[i] + v_alloc,
            v_ttc, v_ht, v_ttc - v_ht,
            coalesce(v_prod.purchase_price_ht, 0),
            i);

    v_tot_ttc  := v_tot_ttc + v_ttc;
    v_tot_ht   := v_tot_ht + v_ht;
    v_tot_disc := v_tot_disc + discs[i] + v_alloc;

    -- ---- Decrementation du stock (en unite de base = bouteilles) -------
    if v_prod.id is not null then
      v_qty_base := (it ->> 'quantity')::numeric * coalesce((it ->> 'pack_size')::numeric, 1);
      insert into public.stock_movements
        (product_id, location_id, type, quantity_delta, unit_cost_ht, reason, reference, related_id, user_id)
      values (v_prod.id, v_loc, 'sortie', -v_qty_base, coalesce(v_prod.purchase_price_ht, 0),
              'Vente', v_sale.ticket_ref, v_sale.id::text, auth.uid());
    end if;
  end loop;

  update public.sales
     set total_ttc = v_tot_ttc,
         total_ht  = v_tot_ht,
         total_vat = v_tot_ttc - v_tot_ht,
         discount_total = v_tot_disc
   where id = v_sale.id
  returning * into v_sale;

  -- ---- Paiements --------------------------------------------------------
  for pay in select jsonb_array_elements(v_payments) loop
    if coalesce((pay ->> 'amount')::numeric, 0) > 0 then
      insert into public.payments (sale_id, method, amount, tendered, change_given, reference, operator)
      values (v_sale.id,
              (pay ->> 'method')::public.payment_method,
              round((pay ->> 'amount')::numeric, 2),
              nullif(pay ->> 'tendered', '')::numeric,
              round(coalesce((pay ->> 'change_given')::numeric, 0), 2),
              coalesce(pay ->> 'reference', ''),
              coalesce(pay ->> 'operator', ''));
      v_paid := v_paid + round((pay ->> 'amount')::numeric, 2);
    end if;
  end loop;

  if abs(v_paid - v_tot_ttc) > v_tolerance then
    raise exception 'Paiements (%) differents du total du ticket (%).', v_paid, v_tot_ttc;
  end if;

  return v_sale;
end $$;

-- ---------------------------------------------------------------------
-- 12. ANNULATION DE VENTE / RETOUR D'ARTICLE (gerant ou admin)
-- ---------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns public.sales
language plpgsql security definer set search_path = public
as $$
declare s public.sales; l record;
begin
  if not public.is_manager() then
    raise exception 'Seul un gerant ou un administrateur peut annuler une vente.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire.';
  end if;

  select * into s from public.sales where id = p_sale_id for update;
  if s.id is null then raise exception 'Vente introuvable.'; end if;
  if s.status = 'annulee' then raise exception 'Cette vente est deja annulee.'; end if;

  -- Remise en stock de tous les articles
  for l in select * from public.sale_items where sale_id = p_sale_id and product_id is not null loop
    insert into public.stock_movements
      (product_id, location_id, type, quantity_delta, unit_cost_ht, reason, reference, related_id, user_id)
    values (l.product_id, s.location_id, 'retour', l.quantity * l.pack_size, l.unit_cost_ht,
            'Annulation vente : ' || btrim(p_reason), s.ticket_ref, s.id::text, auth.uid());
  end loop;

  update public.sales
     set status = 'annulee', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_sale_id
  returning * into s;

  perform public.log_audit('vente.annulation', 'sales', s.id::text,
    jsonb_build_object('ticket', s.ticket_ref, 'montant', s.total_ttc, 'motif', btrim(p_reason)));
  return s;
end $$;

create or replace function public.return_sale_item(
  p_sale_item_id uuid, p_quantity numeric, p_reason text)
returns public.sale_returns
language plpgsql security definer set search_path = public
as $$
declare it public.sale_items; s public.sales; r public.sale_returns;
        v_already numeric; v_amount numeric(14,2);
begin
  if not public.is_manager() then
    raise exception 'Seul un gerant ou un administrateur peut enregistrer un retour.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Le motif du retour est obligatoire.';
  end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'La quantite retournee doit etre positive.';
  end if;

  select * into it from public.sale_items where id = p_sale_item_id;
  if it.id is null then raise exception 'Ligne de vente introuvable.'; end if;
  select * into s from public.sales where id = it.sale_id;
  if s.status = 'annulee' then raise exception 'Vente deja annulee dans son ensemble.'; end if;

  select coalesce(sum(quantity), 0) into v_already
    from public.sale_returns where sale_item_id = p_sale_item_id;
  if v_already + p_quantity > it.quantity then
    raise exception 'Quantite retournee superieure a la quantite vendue (% deja retournee sur %).',
      v_already, it.quantity;
  end if;

  -- Montant rembourse au prorata du net de la ligne (remises incluses)
  v_amount := round(it.line_ttc * p_quantity / it.quantity, 2);

  insert into public.sale_returns (sale_id, sale_item_id, product_id, quantity, amount_ttc, reason, user_id)
  values (s.id, it.id, it.product_id, p_quantity, v_amount, btrim(p_reason), auth.uid())
  returning * into r;

  if it.product_id is not null then
    insert into public.stock_movements
      (product_id, location_id, type, quantity_delta, unit_cost_ht, reason, reference, related_id, user_id)
    values (it.product_id, s.location_id, 'retour', p_quantity * it.pack_size, it.unit_cost_ht,
            'Retour article : ' || btrim(p_reason), s.ticket_ref, s.id::text, auth.uid());
  end if;

  perform public.log_audit('vente.retour', 'sale_returns', r.id::text,
    jsonb_build_object('ticket', s.ticket_ref, 'article', it.label,
                       'quantite', p_quantity, 'montant', v_amount, 'motif', btrim(p_reason)));
  return r;
end $$;

-- Les ventes ne peuvent pas etre supprimees : on annule (trace).
create or replace function public.sales_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Une vente ne peut pas etre supprimee : utilisez l''annulation (tracee).';
end $$;
drop trigger if exists trg_sales_no_delete on public.sales;
create trigger trg_sales_no_delete before delete on public.sales
  for each row execute function public.sales_no_delete();

-- ---------------------------------------------------------------------
-- 13. VUES DE REPORTING
--  « security_invoker = on » : les vues respectent les politiques RLS
--  de l'utilisateur connecte (PostgreSQL 15+, standard sur Supabase).
-- ---------------------------------------------------------------------

-- Fuseau horaire des rapports (parametre)
create or replace function public.report_tz()
returns text language sql stable security definer set search_path = public
as $$ select coalesce(timezone, 'Europe/Paris') from public.app_settings where id = 1 $$;

-- 13.1 Produits enrichis (categorie, fournisseur, stock total, alerte)
create or replace view public.v_products_full as
select p.*,
       c.label  as category_label,
       c.code   as category_code,
       s.name   as supplier_name,
       coalesce(sl.total_stock, 0)                as total_stock,
       coalesce(sl.total_stock, 0) <= p.stock_alert_threshold as is_low_stock,
       round(coalesce(sl.total_stock, 0) * p.purchase_price_ht, 2) as stock_value_ht,
       round(p.sale_price_ttc / (1 + p.vat_rate / 100), 2)         as sale_price_ht,
       round(p.sale_price_ttc / (1 + p.vat_rate / 100) - p.purchase_price_ht, 2) as unit_margin_ht
  from public.products p
  left join public.categories c on c.id = p.category_id
  left join public.suppliers  s on s.id = p.supplier_id
  left join (select product_id, sum(quantity) as total_stock
               from public.stock_levels group by product_id) sl on sl.product_id = p.id;
alter view public.v_products_full set (security_invoker = on);

-- 13.2 Stock par produit et par emplacement
create or replace view public.v_stock_by_location as
select sl.product_id, sl.location_id, sl.quantity, sl.updated_at,
       p.name as product_name, p.barcode, p.internal_code,
       p.purchase_price_ht, p.sale_price_ttc, p.stock_alert_threshold, p.active,
       c.label as category_label,
       l.name as location_name, l.code as location_code,
       round(sl.quantity * p.purchase_price_ht, 2) as value_ht
  from public.stock_levels sl
  join public.products  p on p.id = sl.product_id
  join public.locations l on l.id = sl.location_id
  left join public.categories c on c.id = p.category_id;
alter view public.v_stock_by_location set (security_invoker = on);

-- 13.3 Produits sous le seuil d'alerte
create or replace view public.v_low_stock as
select id, name, barcode, internal_code, category_label, supplier_name,
       total_stock, stock_alert_threshold,
       (stock_alert_threshold - total_stock) as missing_qty,
       purchase_price_ht, sale_price_ttc
  from public.v_products_full
 where active and total_stock <= stock_alert_threshold;
alter view public.v_low_stock set (security_invoker = on);

-- 13.4 Valeur totale du stock (au prix d'achat)
create or replace view public.v_stock_value as
select count(distinct sl.product_id)                      as nb_products,
       coalesce(sum(sl.quantity), 0)                      as total_units,
       round(coalesce(sum(sl.quantity * p.purchase_price_ht), 0), 2) as value_purchase_ht,
       round(coalesce(sum(sl.quantity * p.sale_price_ttc), 0), 2)    as value_sale_ttc
  from public.stock_levels sl
  join public.products p on p.id = sl.product_id
 where sl.quantity > 0;
alter view public.v_stock_value set (security_invoker = on);

-- 13.5 Mouvements de stock enrichis (journal / export)
create or replace view public.v_movements_full as
select m.id, m.created_at, m.type, m.quantity_delta, m.reason, m.reference,
       m.unit_cost_ht, m.transfer_group, m.related_id,
       p.id as product_id, p.name as product_name, p.barcode, p.internal_code,
       l.id as location_id, l.name as location_name,
       pr.email as user_email, pr.full_name as user_name
  from public.stock_movements m
  join public.products  p  on p.id = m.product_id
  join public.locations l  on l.id = m.location_id
  left join public.profiles pr on pr.id = m.user_id;
alter view public.v_movements_full set (security_invoker = on);

-- 13.6 Lignes de vente enrichies (base des marges et des exports)
create or replace view public.v_sale_items_full as
select si.id, si.sale_id, si.product_id, si.label, si.quantity, si.pack_size, si.unit,
       si.unit_price_ttc, si.vat_rate, si.line_discount, si.line_ttc, si.line_ht, si.line_vat,
       si.unit_cost_ht,
       (si.quantity * si.pack_size)                                          as qty_base,
       round(si.line_ht - si.unit_cost_ht * si.quantity * si.pack_size, 2)   as margin_ht,
       s.ticket_ref, s.ticket_number, s.created_at, s.status, s.cash_session_id,
       s.location_id, s.customer_id,
       (s.created_at at time zone public.report_tz())::date                  as sale_date,
       c.label as category_label,
       pr.email as user_email
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  left join public.products p on p.id = si.product_id
  left join public.categories c on c.id = p.category_id
  left join public.profiles pr on pr.id = s.user_id;
alter view public.v_sale_items_full set (security_invoker = on);

-- 13.7 Chiffre d'affaires par jour (ventes validees uniquement)
create or replace view public.v_sales_daily as
with ventes as (
  select (s.created_at at time zone public.report_tz())::date as sale_date,
         s.id, s.total_ttc, s.total_ht, s.total_vat, s.discount_total
    from public.sales s
   where s.status = 'validee'
), marges as (
  select v.sale_date,
         round(sum(si.line_ht - si.unit_cost_ht * si.quantity * si.pack_size), 2) as marge_ht
    from public.sale_items si
    join ventes v on v.id = si.sale_id
   group by 1
)
select v.sale_date,
       count(*)                          as nb_tickets,
       round(sum(v.total_ttc), 2)        as ca_ttc,
       round(sum(v.total_ht), 2)         as ca_ht,
       round(sum(v.total_vat), 2)        as total_tva,
       round(sum(v.discount_total), 2)   as total_remises,
       round(avg(v.total_ttc), 2)        as panier_moyen,
       coalesce(m.marge_ht, 0)           as marge_ht
  from ventes v
  left join marges m on m.sale_date = v.sale_date
 group by v.sale_date, m.marge_ht;
alter view public.v_sales_daily set (security_invoker = on);

-- 13.8 Meilleures ventes par produit
create or replace view public.v_top_products as
select si.product_id,
       coalesce(p.name, si.label)                   as product_name,
       c.label                                      as category_label,
       sum(si.quantity * si.pack_size)              as qty_sold,
       round(sum(si.line_ttc), 2)                   as ca_ttc,
       round(sum(si.line_ht), 2)                    as ca_ht,
       round(sum(si.line_ht - si.unit_cost_ht * si.quantity * si.pack_size), 2) as marge_ht,
       min((s.created_at at time zone public.report_tz())::date) as first_sale,
       max((s.created_at at time zone public.report_tz())::date) as last_sale
  from public.sale_items si
  join public.sales s on s.id = si.sale_id and s.status = 'validee'
  left join public.products p on p.id = si.product_id
  left join public.categories c on c.id = p.category_id
 group by 1, 2, 3;
alter view public.v_top_products set (security_invoker = on);

-- 13.9 Repartition par moyen de paiement
create or replace view public.v_payments_breakdown as
select (s.created_at at time zone public.report_tz())::date as sale_date,
       pm.method,
       pm.operator,
       count(*)                     as nb_paiements,
       round(sum(pm.amount), 2)     as total,
       s.cash_session_id
  from public.payments pm
  join public.sales s on s.id = pm.sale_id and s.status = 'validee'
 group by 1, 2, 3, 6;
alter view public.v_payments_breakdown set (security_invoker = on);

-- 13.10 Rapport Z : synthese d'une session de caisse
create or replace view public.v_cash_session_report as
select cs.id, cs.location_id, cs.status, cs.opening_float, cs.opened_at, cs.closed_at,
       cs.counted_cash, cs.expected_cash, cs.cash_gap, cs.notes,
       l.name as location_name,
       po.email as opened_by_email, pc.email as closed_by_email,
       coalesce(v.nb_tickets, 0)        as nb_tickets,
       coalesce(v.ca_ttc, 0)            as ca_ttc,
       coalesce(v.ca_ht, 0)             as ca_ht,
       coalesce(v.total_tva, 0)         as total_tva,
       coalesce(v.remises, 0)           as total_remises,
       coalesce(pa.especes, 0)          as total_especes,
       coalesce(pa.carte, 0)            as total_carte,
       coalesce(pa.mobile, 0)           as total_mobile_money,
       coalesce(re.total, 0)            as total_retours,
       coalesce(an.nb, 0)               as nb_annulations,
       coalesce(mo.detail, '[]'::jsonb) as mobile_money_detail
  from public.cash_sessions cs
  join public.locations l on l.id = cs.location_id
  left join public.profiles po on po.id = cs.opened_by
  left join public.profiles pc on pc.id = cs.closed_by
  left join (select cash_session_id, count(*) nb_tickets, sum(total_ttc) ca_ttc,
                    sum(total_ht) ca_ht, sum(total_vat) total_tva, sum(discount_total) remises
               from public.sales where status = 'validee' group by 1) v
         on v.cash_session_id = cs.id
  left join (select s.cash_session_id,
                    sum(case when p.method = 'especes'      then p.amount else 0 end) especes,
                    sum(case when p.method = 'carte'        then p.amount else 0 end) carte,
                    sum(case when p.method = 'mobile_money' then p.amount else 0 end) mobile
               from public.payments p
               join public.sales s on s.id = p.sale_id and s.status = 'validee'
              group by 1) pa
         on pa.cash_session_id = cs.id
  left join (select s.cash_session_id, sum(r.amount_ttc) total
               from public.sale_returns r join public.sales s on s.id = r.sale_id
              group by 1) re
         on re.cash_session_id = cs.id
  left join (select cash_session_id, count(*) nb
               from public.sales where status = 'annulee' group by 1) an
         on an.cash_session_id = cs.id
  -- Detail du mobile money par operateur, pour rapprocher chaque compte
  left join (select cash_session_id,
                    jsonb_agg(jsonb_build_object('operateur', operateur, 'total', total)
                              order by total desc) as detail
               from (select s.cash_session_id,
                            nullif(p.operator, '') as operateur,
                            round(sum(p.amount), 2) as total
                       from public.payments p
                       join public.sales s on s.id = p.sale_id and s.status = 'validee'
                      where p.method = 'mobile_money'
                      group by 1, 2) x
              group by 1) mo
         on mo.cash_session_id = cs.id;
alter view public.v_cash_session_report set (security_invoker = on);

-- 13.11 Etat d'une session d'inventaire (ecarts)
create or replace view public.v_inventory_lines_full as
select il.id, il.session_id, il.product_id, il.theoretical_qty, il.counted_qty,
       (il.counted_qty - il.theoretical_qty) as gap,
       il.reason, il.updated_at,
       p.name as product_name, p.barcode, p.internal_code, p.purchase_price_ht,
       round((il.counted_qty - il.theoretical_qty) * p.purchase_price_ht, 2) as gap_value_ht,
       c.label as category_label
  from public.inventory_lines il
  join public.products p on p.id = il.product_id
  left join public.categories c on c.id = p.category_id;
alter view public.v_inventory_lines_full set (security_invoker = on);

-- ---------------------------------------------------------------------
-- 14. GARDE-FOUS SUR LES PROFILS
-- ---------------------------------------------------------------------
-- Un utilisateur peut modifier son nom, mais seul un admin peut changer
-- un role ou desactiver un compte.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (old.role is distinct from new.role or old.active is distinct from new.active)
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un role ou desactiver un compte.';
  end if;

  if old.role is distinct from new.role then
    perform public.log_audit('utilisateur.role', 'profiles', new.id::text,
      jsonb_build_object('email', new.email, 'avant', old.role, 'apres', new.role));
  end if;
  if old.active is distinct from new.active then
    perform public.log_audit('utilisateur.activation', 'profiles', new.id::text,
      jsonb_build_object('email', new.email, 'actif', new.active));
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- 15. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.app_settings       enable row level security;
alter table public.profiles           enable row level security;
alter table public.audit_log          enable row level security;
alter table public.categories         enable row level security;
alter table public.locations          enable row level security;
alter table public.suppliers          enable row level security;
alter table public.customers          enable row level security;
alter table public.products           enable row level security;
alter table public.stock_levels       enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.receptions         enable row level security;
alter table public.reception_lines    enable row level security;
alter table public.inventory_sessions enable row level security;
alter table public.inventory_lines    enable row level security;
alter table public.cash_sessions      enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.payments           enable row level security;
alter table public.sale_returns       enable row level security;

-- Suppression des politiques existantes (rejouabilite du script)
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 15.1 Parametres : lisibles par tous les utilisateurs, modifiables par l'admin
create policy settings_select on public.app_settings for select to authenticated using (public.is_staff());
create policy settings_update on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 15.2 Profils
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_delete_admin on public.profiles for delete to authenticated
  using (public.is_admin());

-- 15.3 Journal d'audit : consultation gerant/admin, ecriture par les fonctions uniquement
create policy audit_select on public.audit_log for select to authenticated using (public.is_manager());

-- 15.4 Referentiels : lecture pour tous, ecriture gerant/admin
create policy categories_select on public.categories for select to authenticated using (public.is_staff());
create policy categories_write  on public.categories for all    to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy locations_select on public.locations for select to authenticated using (public.is_staff());
create policy locations_write  on public.locations for all    to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy suppliers_select on public.suppliers for select to authenticated using (public.is_staff());
create policy suppliers_write  on public.suppliers for all    to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Les clients peuvent etre crees depuis la caisse (role caissier inclus)
create policy customers_select on public.customers for select to authenticated using (public.is_staff());
create policy customers_insert on public.customers for insert to authenticated with check (public.is_staff());
create policy customers_update on public.customers for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy customers_delete on public.customers for delete to authenticated using (public.is_manager());

-- 15.5 Produits : lecture pour tous (necessaire a la caisse), ecriture gerant/admin
create policy products_select on public.products for select to authenticated using (public.is_staff());
create policy products_insert on public.products for insert to authenticated with check (public.is_manager());
create policy products_update on public.products for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy products_delete on public.products for delete to authenticated using (public.is_admin());

-- 15.6 Stock : lecture pour tous ; aucune ecriture directe (uniquement via les
--      fonctions record_movement / transfer_stock / pos_create_sale).
create policy stock_levels_select on public.stock_levels for select to authenticated using (public.is_staff());
create policy movements_select    on public.stock_movements for select to authenticated using (public.is_staff());
create policy movements_insert    on public.stock_movements for insert to authenticated with check (public.is_manager());

-- 15.7 Receptions : gerant/admin
create policy receptions_all on public.receptions for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy reception_lines_all on public.reception_lines for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- 15.8 Inventaire : gerant/admin
create policy inventory_sessions_all on public.inventory_sessions for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy inventory_lines_all on public.inventory_lines for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- 15.9 Sessions de caisse : le caissier voit les siennes, le gerant voit tout.
create policy cash_sessions_select on public.cash_sessions for select to authenticated
  using (opened_by = auth.uid() or public.is_manager());
create policy cash_sessions_update on public.cash_sessions for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- 15.10 Ventes : insertion uniquement via la RPC pos_create_sale (SECURITY DEFINER).
create policy sales_select on public.sales for select to authenticated
  using (user_id = auth.uid() or public.is_manager());
create policy sale_items_select on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s
                  where s.id = sale_id and (s.user_id = auth.uid() or public.is_manager())));
create policy payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.sales s
                  where s.id = sale_id and (s.user_id = auth.uid() or public.is_manager())));
create policy returns_select on public.sale_returns for select to authenticated
  using (exists (select 1 from public.sales s
                  where s.id = sale_id and (s.user_id = auth.uid() or public.is_manager())));

-- ---------------------------------------------------------------------
-- 16. PRIVILEGES
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.categories, public.locations, public.suppliers, public.customers,
  public.products, public.receptions, public.reception_lines,
  public.inventory_sessions, public.inventory_lines
  to authenticated;
grant insert on public.stock_movements to authenticated;
grant update on public.app_settings, public.profiles, public.cash_sessions to authenticated;
grant insert, delete on public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Fonctions appelables depuis le client (les droits sont verifies a l'interieur)
grant execute on function public.my_role()               to authenticated;
grant execute on function public.is_admin()              to authenticated;
grant execute on function public.is_manager()            to authenticated;
grant execute on function public.is_staff()              to authenticated;
grant execute on function public.next_internal_code()    to authenticated;
grant execute on function public.record_movement(uuid, uuid, public.movement_type, numeric, text, text, numeric) to authenticated;
grant execute on function public.transfer_stock(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.validate_reception(uuid) to authenticated;
grant execute on function public.inventory_scan(uuid, uuid, numeric) to authenticated;
grant execute on function public.validate_inventory(uuid) to authenticated;
grant execute on function public.open_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.cash_session_expected(uuid) to authenticated;
grant execute on function public.pos_create_sale(jsonb)  to authenticated;
grant execute on function public.cancel_sale(uuid, text)  to authenticated;
grant execute on function public.return_sale_item(uuid, numeric, text) to authenticated;
grant execute on function public.report_tz()             to authenticated;

revoke execute on function public.log_audit(text, text, text, jsonb) from authenticated, anon;

-- ---------------------------------------------------------------------
-- 17. STOCKAGE DES PHOTOS DE PRODUITS (Supabase Storage)
--  Cree un bucket public « produits » et autorise les gerants a y deposer
--  des images. Le bloc est ignore si l'extension Storage n'est pas presente
--  (par exemple sur une base PostgreSQL locale).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public)
    values ('produits', 'produits', true)
    on conflict (id) do update set public = true;

    -- Lecture publique (les photos s'affichent sans authentification)
    begin
      drop policy if exists "produits_lecture_publique" on storage.objects;
      create policy "produits_lecture_publique" on storage.objects
        for select using (bucket_id = 'produits');
    exception when insufficient_privilege then
      raise notice 'Politiques Storage non modifiables : creez-les depuis l''interface Supabase.';
    end;

    -- Depot / remplacement / suppression reserves aux gerants et admins
    begin
      drop policy if exists "produits_ecriture_gerant" on storage.objects;
      create policy "produits_ecriture_gerant" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'produits' and public.is_manager());

      drop policy if exists "produits_maj_gerant" on storage.objects;
      create policy "produits_maj_gerant" on storage.objects
        for update to authenticated
        using (bucket_id = 'produits' and public.is_manager());

      drop policy if exists "produits_suppression_gerant" on storage.objects;
      create policy "produits_suppression_gerant" on storage.objects
        for delete to authenticated
        using (bucket_id = 'produits' and public.is_manager());
    exception when insufficient_privilege then
      raise notice 'Politiques Storage non modifiables : creez-les depuis l''interface Supabase.';
    end;
  end if;
end $$;

-- Realtime (facultatif) : suivi en direct du stock et des ventes
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.sales;
      alter publication supabase_realtime add table public.stock_levels;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- =====================================================================
--  FIN DU SCHEMA
-- =====================================================================
