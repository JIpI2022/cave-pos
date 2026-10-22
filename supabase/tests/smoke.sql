-- =====================================================================
--  Test de bout en bout du schema (optionnel)
--  Verifie : roles, caisse, remises, TVA, stock, annulation, retour,
--            transfert, inventaire, cloture de caisse.
--  A executer sur une base de DEMONSTRATION uniquement (il cree des ventes).
--  Prerequis : schema.sql puis seed.sql.
-- =====================================================================
\set ON_ERROR_STOP on

-- Identite de test : le premier admin cree par handle_new_user().
-- Sur Supabase, remplacez la valeur par l'UUID de votre compte admin
-- (Authentication > Users) ; auth.uid() est deja renseigne dans l'editeur SQL.
\if :{?admin_uid}
\else
  \set admin_uid '11111111-1111-1111-1111-111111111111'
\endif

select '--- 1. Roles ---' as etape;
select public.my_role() as role_courant, public.is_manager() as est_gerant;

select '--- 2. Ouverture de caisse (fond 100) ---' as etape;
select id from public.open_cash_session(
  (select id from public.locations where code = 'BOUTIQUE'), 100, 'Test automatise') \gset
\set cs :id

select id from public.products where name = 'Saint-Emilion Grand Cru' \gset
\set p1 :id
select id from public.products where name = 'Chablis Premier Cru' \gset
\set p2 :id

select '--- 3. Vente avec remise ligne 10% + remise ticket 5 ---' as etape;
-- 2 x 27,50 = 55,00 - 10% = 49,50 | 1 x 31,00 | remise ticket 5,00 => 75,50 TTC
select ticket_ref, total_ttc, total_ht, total_vat, discount_total
from public.pos_create_sale(jsonb_build_object(
  'client_uuid', 'aaaaaaaa-0000-0000-0000-000000000001',
  'cash_session_id', :'cs',
  'location_id', (select id from public.locations where code = 'BOUTIQUE'),
  'ticket_discount_type', 'montant', 'ticket_discount_value', 5,
  'items', jsonb_build_array(
     jsonb_build_object('product_id', :'p1', 'quantity', 2, 'pack_size', 1,
        'unit', 'bouteille', 'unit_price_ttc', 27.50, 'vat_rate', 20,
        'discount_type', 'pourcentage', 'discount_value', 10),
     jsonb_build_object('product_id', :'p2', 'quantity', 1, 'pack_size', 1,
        'unit', 'bouteille', 'unit_price_ttc', 31.00, 'vat_rate', 20)),
  'payments', jsonb_build_array(
     jsonb_build_object('method', 'especes', 'amount', 75.50,
                        'tendered', 100, 'change_given', 24.50))));

select label, quantity, line_discount, line_ttc, line_ht, line_vat
  from public.sale_items
 where sale_id = (select id from public.sales where client_uuid = 'aaaaaaaa-0000-0000-0000-000000000001')
 order by position;

select '--- 4. Idempotence de la synchro hors ligne ---' as etape;
select (public.pos_create_sale(jsonb_build_object(
  'client_uuid', 'aaaaaaaa-0000-0000-0000-000000000001',
  'location_id', (select id from public.locations where code = 'BOUTIQUE'),
  'items', jsonb_build_array(jsonb_build_object('product_id', :'p1',
            'quantity', 99, 'unit_price_ttc', 1, 'vat_rate', 20)),
  'payments', jsonb_build_array(jsonb_build_object('method', 'carte', 'amount', 99))
))).ticket_ref as rejeu_renvoie_le_meme_ticket;
select count(*) as nb_ventes_attendu_1 from public.sales;

select '--- 5. Stock boutique apres vente (12 - 2 et 12 - 1) ---' as etape;
select p.name, sl.quantity from public.stock_levels sl
  join public.products p on p.id = sl.product_id
 where sl.location_id = (select id from public.locations where code = 'BOUTIQUE')
   and p.id in (:'p1', :'p2') order by p.name;

select '--- 6. Vente carte puis mixte ---' as etape;
select ticket_ref, total_ttc from public.pos_create_sale(jsonb_build_object(
  'client_uuid', 'aaaaaaaa-0000-0000-0000-000000000002',
  'cash_session_id', :'cs',
  'location_id', (select id from public.locations where code = 'BOUTIQUE'),
  'items', jsonb_build_array(jsonb_build_object('product_id', :'p2',
            'quantity', 2, 'unit_price_ttc', 31.00, 'vat_rate', 20)),
  'payments', jsonb_build_array(
     jsonb_build_object('method', 'carte', 'amount', 40),
     jsonb_build_object('method', 'especes', 'amount', 22, 'tendered', 22, 'change_given', 0))));

select '--- 7. Retour d''un article (1 Chablis) ---' as etape;
select quantity, amount_ttc, reason from public.return_sale_item(
  (select si.id from public.sale_items si
     join public.sales s on s.id = si.sale_id
    where s.client_uuid = 'aaaaaaaa-0000-0000-0000-000000000002' limit 1),
  1, 'Bouteille bouchonnee');

select '--- 8. Annulation complete de la 1re vente ---' as etape;
select ticket_ref, status, cancel_reason from public.cancel_sale(
  (select id from public.sales where client_uuid = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Erreur de saisie du caissier');

select '--- 9. Stock boutique apres annulation + retour ---' as etape;
select p.name, sl.quantity from public.stock_levels sl
  join public.products p on p.id = sl.product_id
 where sl.location_id = (select id from public.locations where code = 'BOUTIQUE')
   and p.id in (:'p1', :'p2') order by p.name;

select '--- 10. Transfert cave -> boutique (6 bouteilles) ---' as etape;
select public.transfer_stock(:'p1',
  (select id from public.locations where code = 'CAVE'),
  (select id from public.locations where code = 'BOUTIQUE'), 6, 'Rotation boutique') is not null as transfert_ok;
select l.code, sl.quantity from public.stock_levels sl
  join public.locations l on l.id = sl.location_id
 where sl.product_id = :'p1' order by l.code;

select '--- 11. Inventaire avec ecart ---' as etape;
insert into public.inventory_sessions (label, location_id)
values ('Inventaire test', (select id from public.locations where code = 'DEPOT'))
returning id \gset
\set inv :id
select counted_qty, theoretical_qty from public.inventory_scan(:'inv', :'p1', 15);
select public.validate_inventory(:'inv') as ecarts_appliques;
select l.code, sl.quantity from public.stock_levels sl
  join public.locations l on l.id = sl.location_id
 where sl.product_id = :'p1' and l.code = 'DEPOT';

select '--- 12. Cloture de caisse (rapport Z) ---' as etape;
select public.cash_session_expected(:'cs') as especes_theoriques;
select opening_float, counted_cash, expected_cash, cash_gap
  from public.close_cash_session(:'cs', 95, 'Comptage du soir');
select nb_tickets, ca_ttc, total_especes, total_carte, total_retours, nb_annulations
  from public.v_cash_session_report where id = :'cs';

select '--- 13. Journal d''audit ---' as etape;
select action, entity, details from public.audit_log order by id;

select '--- 14. Vues de reporting ---' as etape;
select * from public.v_sales_daily;
select product_name, qty_sold, ca_ttc, marge_ht from public.v_top_products order by ca_ttc desc limit 5;
select nb_products, total_units, value_purchase_ht from public.v_stock_value;
select count(*) as nb_produits_sous_seuil from public.v_low_stock;
