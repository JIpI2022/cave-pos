-- =====================================================================
--  Test de securite : on se met dans la peau d'un caissier et d'un
--  visiteur qui vient de s'inscrire, et on tente d'acceder a ce qui
--  doit leur etre interdit.
--
--  A executer sur une base de DEMONSTRATION, apres schema.sql et seed.sql.
--  Chaque ligne « ATTENDU » indique le resultat correct.
-- =====================================================================
\set ON_ERROR_STOP off

select '=== 1. INSCRIPTION : un visiteur peut-il se declarer administrateur ? ===' as etape;
-- Sur Supabase, les metadonnees d'inscription sont choisies par le client :
-- supabase.auth.signUp({ ..., options: { data: { role: 'admin' } } })
insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-4444-444444444444', 'pirate@exemple.com',
        '{"full_name":"Pirate","role":"admin"}')
on conflict (id) do nothing;

select email, role, active,
       case when role = 'caissier' and not active then 'OK'
            else 'ECHEC : escalade de privileges possible' end as verdict
  from public.profiles where email = 'pirate@exemple.com';
-- ATTENDU : role = caissier, active = false, verdict = OK

select '=== 2. COMPTE NON ACTIVE : tout doit etre refuse ===' as etape;
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';
select coalesce(public.my_role()::text, 'aucun role') as role_effectif,
       (select count(*) from public.v_pos_catalog) as produits_visibles,
       case when (select count(*) from public.v_pos_catalog) = 0
            then 'OK' else 'ECHEC : un compte non active voit le catalogue' end as verdict;
-- ATTENDU : aucun role, 0 produit, verdict = OK
reset role;

select '=== 3. CAISSIER ACTIF : ce qu''il voit, ce qu''il ne voit pas ===' as etape;
-- L'activation est faite par un administrateur, comme dans l'application.
set app.uid = '11111111-1111-1111-1111-111111111111';
update public.profiles set active = true where email = 'pirate@exemple.com';
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';

select 'catalogue de caisse'  as ressource, count(*)::text as lignes,
       case when count(*) > 0 then 'OK (acces normal)' else 'ECHEC : caisse inutilisable' end as verdict
  from public.v_pos_catalog
union all
select 'prix d''achat (products)', count(*)::text,
       case when count(*) = 0 then 'OK (refuse)' else 'ECHEC : couts exposes' end
  from public.products
union all
select 'marges (v_products_full)', count(*)::text,
       case when count(*) = 0 then 'OK (refuse)' else 'ECHEC : marges exposees' end
  from public.v_products_full
union all
select 'valeur du stock', coalesce((select count(*)::text from public.v_stock_value where value_purchase_ht > 0), '0'),
       case when not exists (select 1 from public.v_stock_value where value_purchase_ht > 0)
            then 'OK (refuse)' else 'ECHEC : valorisation exposee' end
union all
select 'mouvements de stock', count(*)::text,
       case when count(*) = 0 then 'OK (refuse)' else 'ECHEC : couts d''achat exposes' end
  from public.stock_movements
union all
select 'lignes de vente (cout figé)', count(*)::text,
       case when count(*) = 0 then 'OK (refuse)' else 'ECHEC : couts exposes' end
  from public.sale_items
union all
select 'journal d''audit', count(*)::text,
       case when count(*) = 0 then 'OK (refuse)' else 'ECHEC : audit lisible' end
  from public.audit_log
union all
select 'ventes des autres caissiers', count(*)::text,
       case when count(*) = 0 then 'OK (refuse)' else 'ECHEC : ventes d''autrui lisibles' end
  from public.sales;

select '=== 4. ECRITURES INTERDITES AU CAISSIER ===' as etape;
-- Chaque instruction doit echouer ou ne rien modifier.
update public.products set sale_price_ttc = 1 where true;
select 'modification de prix' as tentative,
       case when (select count(*) from public.products where sale_price_ttc = 1) = 0
            then 'OK (aucune ligne modifiee)' else 'ECHEC' end as verdict;

insert into public.stock_movements (product_id, location_id, type, quantity_delta, reason)
select id, (select id from public.locations limit 1), 'entree', 999, 'vol'
  from public.products limit 1;
-- ATTENDU : ERROR (violation de la politique de securite) ou 0 ligne

select public.next_internal_code();
-- ATTENDU : ERROR « Droits insuffisants »

select public.log_audit('faux', 'profiles', 'x');
-- ATTENDU : ERROR « permission denied »

select public.cancel_sale((select id from public.sales limit 1), 'tentative');
-- ATTENDU : ERROR « Seul un gerant ou un administrateur... »

reset role;

select '=== 5. GERANT : il doit, lui, tout voir ===' as etape;
set app.uid = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'gerant' where email = 'pirate@exemple.com';
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';
select 'produits' as ressource, count(*)::text as lignes,
       case when count(*) > 0 then 'OK' else 'ECHEC : gerant bride' end as verdict
  from public.products
union all
select 'mouvements', count(*)::text,
       case when count(*) > 0 then 'OK' else 'ECHEC : gerant bride' end
  from public.stock_movements;
reset role;

-- Nettoyage
delete from auth.users where email = 'pirate@exemple.com';
select '=== FIN ===' as etape;
