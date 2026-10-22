#!/usr/bin/env bash
#
# Rejoue les tentatives d'intrusion sur une base PostgreSQL jetable.
# Utilise par l'integration continue et executable en local.
#
# Variables attendues : PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
# (ou PSQL pour fournir une commande psql complete).
set -euo pipefail

PSQL=${PSQL:-psql}
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SORTIE="$(mktemp)"
ADMIN='11111111-1111-1111-1111-111111111111'

echo "→ Mise en place du schema sur une base vierge"
$PSQL -v ON_ERROR_STOP=1 -q -f "$RACINE/supabase/tests/stub_auth.sql"
$PSQL -v ON_ERROR_STOP=1 -q -f "$RACINE/supabase/schema.sql"
$PSQL -v ON_ERROR_STOP=1 -q -f "$RACINE/supabase/seed.sql" > /dev/null

echo "→ Creation du compte administrateur de test"
$PSQL -v ON_ERROR_STOP=1 -q -c \
  "insert into auth.users (id, email, raw_user_meta_data)
   values ('$ADMIN', 'patron@test.local', '{\"full_name\":\"Patron\"}')
   on conflict (id) do nothing;"

echo "→ Scenario fonctionnel complet (ventes, remises, stock, caisse)"
$PSQL -v ON_ERROR_STOP=1 -q -c "set app.uid = '$ADMIN'" \
  -f "$RACINE/supabase/tests/smoke.sql" > /dev/null

echo "→ Tentatives d'intrusion"
$PSQL -c "set app.uid = '$ADMIN'" -f "$RACINE/supabase/tests/securite.sql" > "$SORTIE" 2>&1 || true

echec=0

if grep -q "ECHEC" "$SORTIE"; then
  echo "✗ Des controles de securite ont echoue :"
  grep -n "ECHEC" "$SORTIE" | sed 's/^/    /'
  echec=1
fi

# Les REFUS attendus doivent apparaitre : sans cela, une regression qui
# ouvrirait les droits passerait inapercue (plus d'erreur = plus de refus).
# L'alignement des colonnes varie : on compare sans tenir compte des espaces.
while IFS= read -r tentative; do
  [ -z "$tentative" ] && continue
  if ! grep -qE "$tentative +\| OK" "$SORTIE"; then
    echo "✗ Tentative non rapportee comme refusee : « $tentative »"
    echo "   Une protection a disparu, ou le scenario ne s'est pas deroule."
    echec=1
  fi
done <<'MOTIFS'
modifier un prix de vente
creer un mouvement de stock
generer un code produit
falsifier le journal d audit
annuler une vente
MOTIFS

# Le compte d'essai ne doit laisser aucune trace
if ! grep -q "OK : aucune trace laissee par ce test" "$SORTIE"; then
  echo "✗ Le compte d'essai pirate@exemple.com n'a pas ete supprime."
  echec=1
fi

nb_ok=$(grep -c "OK" "$SORTIE" || true)
echo "→ $nb_ok controle(s) au vert dans le scenario d'intrusion"
[ "$nb_ok" -lt 10 ] && { echo "✗ Trop peu de controles executes : le scenario n'a pas tourne entierement."; echec=1; }

if [ "$echec" -eq 0 ]; then
  echo "✓ Aucune intrusion n'a abouti."
else
  echo "--- Sortie complete ---"; cat "$SORTIE"
fi
rm -f "$SORTIE"
exit "$echec"
