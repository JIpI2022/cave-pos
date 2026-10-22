-- =====================================================================
--  Test de securite : on se met dans la peau d'un caissier et d'un
--  visiteur qui vient de s'inscrire, et on tente d'acceder a ce qui
--  doit leur etre interdit.
--
--  A executer apres schema.sql et seed.sql.
--
--  Le script est SANS EFFET DURABLE : il cree un compte d'essai
--  (pirate@exemple.com), tente les intrusions, puis le supprime — y compris
--  si une etape se passe mal, le nettoyage ayant lieu au debut ET a la fin.
--  Il ne provoque jamais d'erreur : chaque refus attendu est capture et
--  rapporte comme « OK (refuse) ». Il fonctionne donc aussi bien dans
--  l'editeur SQL de Supabase qu'en ligne de commande.
--
--  Il cree neanmoins de vraies ventes via smoke.sql si vous l'enchainez :
--  reservez-le a une base de demonstration ou a un projet encore vierge.
-- =====================================================================

-- Nettoyage prealable : efface la trace d'une execution precedente
-- qui se serait interrompue.
delete from auth.users where email = 'pirate@exemple.com';

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

-- Chaque tentative est executee dans un bloc qui capture le refus : le
-- script rapporte le resultat au lieu de s'interrompre.
do $$
declare
  v_verdict text;
  v_produit uuid;
  v_emplacement uuid;
  v_vente uuid;
begin
  create temporary table if not exists resultats_intrusion(tentative text, verdict text);
  delete from resultats_intrusion;

  -- a) Modifier un prix de vente
  begin
    update public.products set sale_price_ttc = 1 where true;
    v_verdict := case when (select count(*) from public.products where sale_price_ttc = 1) = 0
                      then 'OK (aucune ligne modifiee)'
                      else 'ECHEC : le caissier a modifie des prix' end;
  exception when others then v_verdict := 'OK (refuse : ' || left(sqlerrm, 40) || ')';
  end;
  insert into resultats_intrusion values ('modifier un prix de vente', v_verdict);

  -- b) Saisir un mouvement de stock
  select id into v_produit from public.products limit 1;
  select id into v_emplacement from public.locations limit 1;
  begin
    insert into public.stock_movements (product_id, location_id, type, quantity_delta, reason)
    values (v_produit, v_emplacement, 'entree', 999, 'tentative');
    v_verdict := 'ECHEC : le caissier a cree un mouvement de stock';
  exception when others then v_verdict := 'OK (refuse)';
  end;
  insert into resultats_intrusion values ('creer un mouvement de stock', v_verdict);

  -- c) Generer un code produit
  begin
    perform public.next_internal_code();
    v_verdict := 'ECHEC : le caissier a consomme un code produit';
  exception when others then v_verdict := 'OK (refuse)';
  end;
  insert into resultats_intrusion values ('generer un code produit', v_verdict);

  -- d) Ecrire dans le journal d'audit
  begin
    perform public.log_audit('faux', 'profiles', 'x');
    v_verdict := 'ECHEC : le journal d audit est falsifiable';
  exception when others then v_verdict := 'OK (refuse)';
  end;
  insert into resultats_intrusion values ('falsifier le journal d audit', v_verdict);

  -- e) Annuler une vente
  select id into v_vente from public.sales limit 1;
  begin
    perform public.cancel_sale(v_vente, 'tentative');
    v_verdict := 'ECHEC : le caissier a annule une vente';
  exception when others then v_verdict := 'OK (refuse)';
  end;
  insert into resultats_intrusion values ('annuler une vente', v_verdict);
end $$;

select tentative, verdict from resultats_intrusion;

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

-- Nettoyage : le compte d'essai ne doit laisser aucune trace
delete from auth.users where email = 'pirate@exemple.com';
drop table if exists resultats_intrusion;

select case when exists (select 1 from public.profiles where email = 'pirate@exemple.com')
            then 'ECHEC : le compte d essai n a pas ete supprime'
            else 'OK : aucune trace laissee par ce test' end as nettoyage;

select '=== FIN ===' as etape;
