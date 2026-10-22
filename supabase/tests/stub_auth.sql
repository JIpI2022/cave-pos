-- =====================================================================
--  IMITATION LOCALE DU SCHEMA « auth » DE SUPABASE
--
--  ⚠ A N'EXECUTER QUE SUR UNE BASE POSTGRESQL JETABLE (tests automatises).
--    Sur un vrai projet Supabase, le schema « auth » existe deja et ce
--    fichier n'a RIEN a y faire : il remplacerait auth.uid() par une
--    version pilotee par un simple parametre de session.
--
--  Il permet de rejouer schema.sql, seed.sql et les tests sur un
--  PostgreSQL nu, par exemple dans l'integration continue.
-- =====================================================================
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

-- Dans Supabase, auth.uid() lit l'identifiant dans le jeton JWT.
-- Ici, on le prend dans un parametre de session : set app.uid = '...'
create or replace function auth.uid() returns uuid
language sql stable as
$$ select nullif(current_setting('app.uid', true), '')::uuid $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
