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
while IFS= read -r motif; do
  [ -z "$motif" ] && continue
  if ! grep -qF "$motif" "$SORTIE"; then
    echo "✗ Refus attendu absent : « $motif »"
    echo "   Une protection a disparu : l'operation est devenue possible."
    echec=1
  fi
done <<'MOTIFS'
Droits insuffisants pour generer un code produit
permission denied for function log_audit
Seul un gerant ou un administrateur peut annuler une vente
MOTIFS

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
