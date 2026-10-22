-- =====================================================================
--  CAVE & CAISSE - Donnees de demonstration
--  A executer APRES supabase/schema.sql (Supabase > SQL Editor).
--  Rejouable : les insertions sont idempotentes (on conflict do nothing).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parametres de la boutique (a adapter)
-- ---------------------------------------------------------------------
update public.app_settings set
  company_name         = 'Cave des Deux Plateaux',
  address              = 'Cocody Deux Plateaux, Abidjan, Cote d''Ivoire',
  phone                = '+225 27 22 00 00 00',
  tax_id               = 'RCCM ABJ-2026-B-00000 / CC 2026000000',
  -- Franc CFA : aucune decimale, le symbole s'ecrit apres le montant
  currency             = 'XOF',
  currency_symbol      = 'FCFA',
  currency_decimals    = 0,
  -- Fuseau d'Abidjan (UTC+0) : les journees comptables se cloturent a minuit
  -- heure locale, et non a 01h ou 02h comme avec un fuseau europeen.
  timezone             = 'Africa/Abidjan',
  default_vat_rate     = 20.00,
  internal_code_prefix = 'CAV',
  internal_code_padding = 6,
  ticket_prefix        = 'T',
  low_stock_default    = 6,
  mobile_money_operators = array['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave'],
  ticket_footer        = E'Merci de votre visite !\nL''abus d''alcool est dangereux pour la sante.'
where id = 1;

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
insert into public.categories (code, label, sort_order) values
  ('vin_rouge',   'Vin rouge',       10),
  ('vin_blanc',   'Vin blanc',       20),
  ('vin_rose',    'Vin rose',        30),
  ('champagne',   'Champagne / Effervescent', 40),
  ('spiritueux',  'Spiritueux',      50),
  ('biere',       'Biere',           60),
  ('soft',        'Soft / Sans alcool', 70),
  ('autre',       'Autre',           99)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Emplacements de stock
-- ---------------------------------------------------------------------
insert into public.locations (code, name, kind, is_sales_point) values
  ('BOUTIQUE', 'Boutique (surface de vente)', 'boutique', true),
  ('CAVE',     'Cave de garde',               'cave',     false),
  ('DEPOT',    'Depot',                       'depot',    false),
  ('RESERVE',  'Reserve arriere-boutique',    'reserve',  false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Fournisseurs
-- ---------------------------------------------------------------------
insert into public.suppliers (name, contact, phone, email, address) values
  ('Domaines & Terroirs',   'M. Kouassi',  '+225 27 21 00 11 22', 'contact@domaines-terroirs.ci', 'Zone 4, Abidjan'),
  ('Maison Rhone Vallee',   'Mme Girard',  '+225 27 21 00 33 44', 'ventes@rhone-vallee.ci',       'Treichville, Abidjan'),
  ('Negoce Champagne Est',  'M. Perrin',   '+225 27 22 00 55 66', 'commandes@nce.ci',             'Plateau, Abidjan'),
  ('Spiritueux Import',     'M. Da Silva', '+225 27 21 00 77 88', 'pro@spiritueux-import.ci',     'Port-Bouet, Abidjan'),
  ('Brasserie Locale',      'Mme Morel',   '+225 27 23 00 99 00', 'pro@brasserie-locale.ci',      'Yopougon, Abidjan')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Clients de demonstration
-- ---------------------------------------------------------------------
insert into public.customers (name, phone, email, address) values
  ('Restaurant Le Pressoir',     '+225 07 07 00 00 01', 'achats@lepressoir.ci', 'Zone 4, Abidjan'),
  ('Mme Aka Marie-Claire',       '+225 05 05 00 00 02', 'mc.aka@email.ci',      'Cocody, Abidjan'),
  ('Comite d''entreprise Atlas',  '+225 01 01 00 00 03', 'ce@atlas.ci',          'Plateau, Abidjan')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Catalogue : 22 references (vins, champagnes, spiritueux, bieres, softs)
-- Prix indicatifs en FCFA pour le marche ivoirien (convertis depuis l'euro
-- a la parite fixe 1 EUR = 655,957 FCFA, puis arrondis a la coupure la plus
-- proche). Ajustez-les a vos tarifs reels.
-- purchase_price_ht et sale_price_ttc s'entendent pour UNE unite de base
-- (1 bouteille), TVA a 20 % : passez-la a 18 % dans Parametres si votre
-- activite releve du taux normal ivoirien.
-- ---------------------------------------------------------------------
with cat as (select code, id from public.categories),
     sup as (select name, id from public.suppliers)
insert into public.products
  (name, category_id, appellation, vintage, volume_ml, supplier_id,
   purchase_price_ht, sale_price_ttc, vat_rate, barcode, unit, pack_size, stock_alert_threshold)
select v.name,
       (select id from cat where code = v.cat),
       v.appellation, v.vintage, v.volume_ml,
       (select id from sup where name = v.supplier),
       v.achat, v.vente, 20.00, v.barcode, v.unit::public.product_unit, v.pack, v.seuil
from (values
  -- nom, categorie, appellation, millesime, cl, fournisseur, achat HT, vente TTC, EAN, unite, pack, seuil
  ('Chateau Margaux Second Vin',  'vin_rouge',  'Margaux',                2019, 750, 'Domaines & Terroirs', 27600, 52400, '3760012345670', 'bouteille', 1, 6),
  ('Chateau Les Ormes Bordeaux',  'vin_rouge',  'Bordeaux Superieur',     2020, 750, 'Domaines & Terroirs',  5.20,  9.90, '3760012345687', 'bouteille', 1, 12),
  ('Saint-Emilion Grand Cru',     'vin_rouge',  'Saint-Emilion Grand Cru',2018, 750, 'Domaines & Terroirs', 9500, 18000, '3760012345694', 'bouteille', 1, 6),
  ('Crozes-Hermitage Les Galets', 'vin_rouge',  'Crozes-Hermitage',       2021, 750, 'Maison Rhone Vallee',  9.80, 18.90, '3760012345700', 'bouteille', 1, 6),
  ('Cotes du Rhone Villages',     'vin_rouge',  'Cotes du Rhone Villages',2022, 750, 'Maison Rhone Vallee',  4.60,  8.90, '3760012345717', 'bouteille', 1, 12),
  ('Gigondas Vieilles Vignes',    'vin_rouge',  'Gigondas',               2020, 750, 'Maison Rhone Vallee', 7900, 15400, '3760012345724', 'bouteille', 1, 6),
  ('Bourgogne Pinot Noir',        'vin_rouge',  'Bourgogne',              2021, 750, 'Domaines & Terroirs', 6800, 13100, '3760012345731', 'bouteille', 1, 6),
  ('Chablis Premier Cru',         'vin_blanc',  'Chablis 1er Cru',        2021, 750, 'Domaines & Terroirs', 10500, 20300, '3760012345748', 'bouteille', 1, 6),
  ('Sancerre Les Silex',          'vin_blanc',  'Sancerre',               2022, 750, 'Domaines & Terroirs',  9.20, 17.90, '3760012345755', 'bouteille', 1, 6),
  ('Riesling Grand Cru',          'vin_blanc',  'Alsace Grand Cru',       2020, 750, 'Domaines & Terroirs', 7500, 14800, '3760012345762', 'bouteille', 1, 6),
  ('Condrieu Viognier',           'vin_blanc',  'Condrieu',               2021, 750, 'Maison Rhone Vallee', 13800, 26200, '3760012345779', 'bouteille', 1, 3),
  ('Muscadet Sevre-et-Maine',     'vin_blanc',  'Muscadet',               2022, 750, 'Brasserie Locale',     3.40,  6.90, '3760012345786', 'bouteille', 1, 12),
  ('Tavel Rose Tradition',        'vin_rose',   'Tavel',                  2022, 750, 'Maison Rhone Vallee',  6.10, 11.90, '3760012345793', 'bouteille', 1, 12),
  ('Cotes de Provence Rose',      'vin_rose',   'Cotes de Provence',      2023, 750, 'Domaines & Terroirs',  5.80, 11.50, '3760012345809', 'bouteille', 1, 12),
  ('Champagne Brut Tradition',    'champagne',  'Champagne',              null, 750, 'Negoce Champagne Est',18.50, 34.90, '3760012345816', 'bouteille', 1, 6),
  ('Champagne Blanc de Blancs',   'champagne',  'Champagne',              2016, 750, 'Negoce Champagne Est',27.00, 52.00, '3760012345823', 'bouteille', 1, 3),
  ('Cremant de Loire Brut',       'champagne',  'Cremant de Loire',       null, 750, 'Negoce Champagne Est', 4200, 8500, '3760012345830', 'bouteille', 1, 6),
  ('Whisky Single Malt 12 ans',   'spiritueux', 'Ecosse - Speyside',      null, 700, 'Spiritueux Import',   24.00, 46.90, '5000012345842', 'bouteille', 1, 3),
  ('Rhum Agricole VSOP',          'spiritueux', 'Martinique',             null, 700, 'Spiritueux Import',   19.50, 37.50, '3760012345854', 'bouteille', 1, 3),
  ('Cognac VS',                   'spiritueux', 'Cognac',                 null, 700, 'Spiritueux Import',   17.00, 32.90, '3760012345861', 'bouteille', 1, 3),
  ('Gin London Dry Premium',      'spiritueux', 'Angleterre',             null, 700, 'Spiritueux Import',   15.00, 29.90, '5000012345873', 'bouteille', 1, 3),
  ('Biere IPA artisanale 33cl',   'biere',      'Brasserie Locale',       null, 330, 'Brasserie Locale',     1.35,  2.90, '3760012345885', 'carton_12', 12, 24),
  ('Biere Blonde de Garde 75cl',  'biere',      'Brasserie Locale',       null, 750, 'Brasserie Locale',     3.10,  6.50, '3760012345892', 'bouteille', 1, 12),
  ('Eau minerale gazeuse 1L',     'soft',       'France',                 null,1000, 'Brasserie Locale',     0.42,  1.20, '3760012345908', 'carton_6',   6, 24),
  ('Jus de raisin bio 75cl',      'soft',       'France',                 null, 750, 'Brasserie Locale',     1.90,  3.90, '3760012345915', 'bouteille', 1, 12)
) as v(name, cat, appellation, vintage, volume_ml, supplier, achat, vente, barcode, unit, pack, seuil)
on conflict do nothing;

-- Un produit volontairement SANS code-barres : le trigger lui attribue un code
-- interne (CAV000001, CAV000002...) pour tester l'impression d'etiquettes.
insert into public.products
  (name, category_id, appellation, vintage, volume_ml, supplier_id,
   purchase_price_ht, sale_price_ttc, vat_rate, unit, stock_alert_threshold)
select 'Cuvee du Patron (vrac)',
       (select id from public.categories where code = 'vin_rouge'),
       'Vin de France', 2023, 1000,
       (select id from public.suppliers where name = 'Domaines & Terroirs'),
       1375, 3200, 20.00, 'bouteille', 24
where not exists (select 1 from public.products where name = 'Cuvee du Patron (vrac)');

-- ---------------------------------------------------------------------
-- Stock initial : entrees reparties entre la boutique, la cave et le depot.
-- On passe par la table des mouvements : le trigger alimente stock_levels,
-- exactement comme le fera l'application.
-- ---------------------------------------------------------------------
insert into public.stock_movements
  (product_id, location_id, type, quantity_delta, unit_cost_ht, reason, reference)
select p.id, l.id, 'entree',
       case l.code
         when 'BOUTIQUE' then 12
         when 'CAVE'     then 24
         else 18
       end,
       p.purchase_price_ht, 'Stock initial (donnees de demonstration)', 'SEED'
  from public.products p
  cross join public.locations l
 where l.code in ('BOUTIQUE', 'CAVE', 'DEPOT')
   and not exists (select 1 from public.stock_movements m
                    where m.product_id = p.id and m.reference = 'SEED');

-- Deux references volontairement sous le seuil d'alerte (test du tableau de bord)
insert into public.stock_movements
  (product_id, location_id, type, quantity_delta, reason, reference)
select p.id,
       (select id from public.locations where code = 'BOUTIQUE'),
       'casse', -52, 'Casse palette (demonstration)', 'SEED-CASSE'
  from public.products p
 where p.name in ('Condrieu Viognier', 'Champagne Blanc de Blancs')
   and not exists (select 1 from public.stock_movements m
                    where m.product_id = p.id and m.reference = 'SEED-CASSE');

-- ---------------------------------------------------------------------
-- Verification rapide
-- ---------------------------------------------------------------------
select 'produits' as objet, count(*)::text as valeur from public.products
union all select 'emplacements', count(*)::text from public.locations
union all select 'fournisseurs', count(*)::text from public.suppliers
union all select 'unites en stock', coalesce(sum(quantity), 0)::text from public.stock_levels
union all select 'valeur du stock (achat HT)', value_purchase_ht::text from public.v_stock_value
union all select 'sous le seuil d''alerte', count(*)::text from public.v_low_stock;
