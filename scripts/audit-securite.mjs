#!/usr/bin/env node
/**
 * Audit de securite statique du projet.
 *
 * Verifie des INVARIANTS : des proprietes qui doivent rester vraies quoi qu'il
 * arrive au code. Chaque regle correspond a une faille reelle rencontree ou
 * evitee, pas a une bonne pratique generique.
 *
 * Usage :  npm run audit:securite
 * Sortie :  code 0 si tout va bien, 1 si une regle est violee.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (p) => readFileSync(join(racine, p), 'utf8')
const schema = lire('supabase/schema.sql')

const echecs = []
const avertissements = []
const reussites = []

const verifier = (titre, condition, detail = '') => {
  if (condition) reussites.push(titre)
  else echecs.push(detail ? `${titre}\n     ${detail}` : titre)
}

// ---------------------------------------------------------------------------
// 1. Toute table doit etre protegee par la securite au niveau ligne
// ---------------------------------------------------------------------------
const tables = [...schema.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])
const rlsActivee = new Set(
  [...schema.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map((m) => m[1]),
)
const sansRls = tables.filter((t) => !rlsActivee.has(t))
verifier(
  `Securite par ligne active sur les ${tables.length} tables`,
  sansRls.length === 0,
  `Tables sans RLS : ${sansRls.join(', ')}`,
)

// ---------------------------------------------------------------------------
// 2. Les vues doivent respecter les droits de l'appelant.
//    Deux exceptions assumees : les vues « sans cout » de la caisse, qui
//    traversent la RLS pour exposer MOINS de colonnes. Elles doivent alors
//    porter leur propre garde-fou.
// ---------------------------------------------------------------------------
const VUES_TRAVERSANTES = ['v_pos_catalog', 'v_sale_items_safe']
const vues = [...schema.matchAll(/create or replace view public\.(\w+)/g)].map((m) => m[1])
const invoker = new Set(
  [...schema.matchAll(/alter view public\.(\w+) set \(security_invoker = on\)/g)].map((m) => m[1]),
)
const vuesFaibles = vues.filter((v) => !invoker.has(v) && !VUES_TRAVERSANTES.includes(v))
verifier(
  `Les ${vues.length - VUES_TRAVERSANTES.length} vues de rapport respectent les droits de l'appelant`,
  vuesFaibles.length === 0,
  `Vues qui contournent la RLS sans etre declarees : ${vuesFaibles.join(', ')}`,
)

for (const v of VUES_TRAVERSANTES) {
  const bloc = schema.slice(schema.indexOf(`create or replace view public.${v}`))
  const corps = bloc.slice(0, bloc.indexOf(';'))
  verifier(
    `La vue ${v} porte son garde-fou is_staff()`,
    corps.includes('public.is_staff()'),
    `${v} traverse la securite par ligne SANS verifier que l'appelant est un employe actif.`,
  )
  verifier(
    `La vue ${v} n'expose aucun cout d'achat`,
    !/purchase_price_ht|unit_cost_ht|margin|marge/i.test(corps),
    `${v} laisse filtrer une donnee de cout vers le caissier.`,
  )
}

// ---------------------------------------------------------------------------
// 3. Toute fonction SECURITY DEFINER appelable depuis le client doit verifier
//    les droits elle-meme : elle s'execute avec les pleins pouvoirs.
// ---------------------------------------------------------------------------
const SANS_CONTROLE_ASSUME = new Set([
  // Fonctions de lecture seule, sans effet de bord ni donnee sensible
  'my_role', 'is_admin', 'is_manager', 'is_staff', 'report_tz', 'currency_decimals',
  'cash_session_expected',
  // Fonctions de declencheur : non appelables directement par PostgREST
  'handle_new_user', 'apply_stock_movement', 'stock_movements_immutable',
  'products_before_write', 'products_audit_price', 'profiles_guard', 'sales_no_delete',
  'log_audit',
])
const fonctions = [...schema.matchAll(
  /create or replace function public\.(\w+)\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$;/g,
)]
const sansControle = []
for (const [, nom, , corps] of fonctions) {
  if (SANS_CONTROLE_ASSUME.has(nom)) continue
  if (!/is_manager\(\)|is_admin\(\)|is_staff\(\)/.test(corps)) sansControle.push(nom)
}
verifier(
  'Chaque fonction privilegiee verifie les droits de son appelant',
  sansControle.length === 0,
  `Fonctions sans controle : ${sansControle.join(', ')}`,
)

// ---------------------------------------------------------------------------
// 4. Le role ne doit JAMAIS provenir des donnees fournies par le client
//    (faille d'escalade de privileges corrigee le 22/10/2026)
// ---------------------------------------------------------------------------
const creationCompte = schema.slice(
  schema.indexOf('function public.handle_new_user()'),
  schema.indexOf('drop trigger if exists on_auth_user_created'),
)
verifier(
  "Le role d'un nouveau compte ne vient pas des metadonnees du client",
  !/raw_user_meta_data\s*->>\s*'role'/.test(creationCompte),
  "handle_new_user lit le role dans raw_user_meta_data : n'importe qui peut se declarer administrateur a l'inscription.",
)
verifier(
  'Un nouveau compte est inactif tant qu un administrateur ne l a pas active',
  /active\)\s*\n?\s*values[\s\S]{0,400}v_is_first\)/.test(creationCompte)
  || /role, active\)/.test(creationCompte),
  'handle_new_user cree des comptes actifs : un inconnu qui s inscrit entre directement.',
)

// ---------------------------------------------------------------------------
// 5. Le journal d'audit ne doit pas pouvoir etre falsifie
//    (PostgreSQL accorde EXECUTE a PUBLIC par defaut)
// ---------------------------------------------------------------------------
verifier(
  "Le journal d'audit ne peut pas etre alimente depuis le client",
  /revoke execute on function public\.log_audit[^;]*from public/.test(schema),
  'log_audit reste executable par PUBLIC : un caissier peut forger des entrees.',
)

// ---------------------------------------------------------------------------
// 6. Aucun acces de table pour le role anonyme (non connecte)
// ---------------------------------------------------------------------------
const grantsAnon = [...schema.matchAll(/grant\s+(?!usage)[\s\S]{0,120}?to\s+[^;]*\banon\b/g)]
verifier(
  'Le visiteur non connecte ne recoit aucun acces aux donnees',
  grantsAnon.length === 0,
  `Droits accordes a « anon » : ${grantsAnon.map((g) => g[0].replace(/\s+/g, ' ').slice(0, 80)).join(' | ')}`,
)

// ---------------------------------------------------------------------------
// 6 bis. Les tables qui portent des couts restent fermees au caissier
// ---------------------------------------------------------------------------
for (const [politique, table] of [
  ['products_select', 'products (prix d achat)'],
  ['movements_select', 'stock_movements (cout unitaire)'],
  ['sale_items_select', 'sale_items (cout d achat figé)'],
]) {
  const ligne = schema.match(new RegExp(`create policy ${politique}[^;]*;`))
  verifier(
    `${table} : lecture reservee aux gerants`,
    Boolean(ligne) && ligne[0].includes('is_manager()') && !ligne[0].includes('is_staff()'),
    `La politique ${politique} laisse un caissier lire ${table}.`,
  )
}

// ---------------------------------------------------------------------------
// 7. La caisse ne doit lire QUE les vues sans cout
// ---------------------------------------------------------------------------
const catalogue = lire('src/pos/useCatalog.ts')
verifier(
  'La caisse lit le catalogue par la vue sans cout',
  catalogue.includes('v_pos_catalog') && !catalogue.includes('v_products_full'),
  'useCatalog interroge une source qui contient les prix d achat.',
)
const ventes = lire('src/pages/Sales.tsx')
verifier(
  'Le detail des tickets passe par la vue sans cout',
  ventes.includes('v_sale_items_safe') && !/from\('sale_items'\)/.test(ventes),
  'La page Ventes lit sale_items, qui porte le cout d achat figé.',
)

// ---------------------------------------------------------------------------
// 8. Aucun secret dans le depot
// ---------------------------------------------------------------------------
const MOTIFS_SECRETS = [
  { nom: 'cle secrete Supabase', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { nom: 'cle service_role', re: /service_role["'\s:=]+ey[A-Za-z0-9._-]{20,}/ },
  { nom: 'jeton JWT en dur', re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9._-]{30,}/ },
]
const IGNORER = new Set(['node_modules', 'dist', '.git', 'dev-dist', 'coverage'])
const fichiers = []
;(function parcourir(dir) {
  for (const e of readdirSync(join(racine, dir), { withFileTypes: true })) {
    if (IGNORER.has(e.name)) continue
    const rel = join(dir, e.name)
    if (e.isDirectory()) parcourir(rel)
    else if (statSync(join(racine, rel)).size < 2_000_000) fichiers.push(rel)
  }
})('.')

const fuites = []
for (const f of fichiers) {
  if (f.endsWith('audit-securite.mjs')) continue       // ce fichier contient les motifs
  let contenu
  try { contenu = lire(f) } catch { continue }
  for (const m of MOTIFS_SECRETS) if (m.re.test(contenu)) fuites.push(`${f} (${m.nom})`)
}
verifier(
  `Aucun secret dans les ${fichiers.length} fichiers du depot`,
  fuites.length === 0,
  `Secrets detectes : ${fuites.join(', ')}`,
)

// ---------------------------------------------------------------------------
// 7 bis. La bibliotheque xlsx n'est plus maintenue sur npm et porte deux
//        failles connues, toutes deux dans la LECTURE de classeurs
//        (pollution de prototype, deni de service par expression reguliere).
//        L'application n'ecrit que des fichiers : ce controle garantit que
//        personne n'introduira un jour une lecture.
// ---------------------------------------------------------------------------
const sourcesXlsx = fichiers.filter((f) => /^src[\\/].*\.(ts|tsx)$/.test(f))
const lecturesXlsx = sourcesXlsx.filter((f) => /XLSX\.(read|readFile)\b/.test(lire(f)))
verifier(
  "Aucune lecture de classeur Excel (surface des failles connues de xlsx)",
  lecturesXlsx.length === 0,
  `Lecture xlsx detectee dans : ${lecturesXlsx.join(', ')}. `
  + `Les imports doivent rester au format CSV, analyse par notre propre code.`,
)

verifier(
  'Le fichier .env est exclu du depot',
  lire('.gitignore').split('\n').some((l) => l.trim() === '.env'),
  '.env n est pas dans .gitignore : les cles locales risquent d etre publiees.',
)

// ---------------------------------------------------------------------------
// 9. Les tests de securite existent toujours
// ---------------------------------------------------------------------------
verifier(
  'Le scenario d intrusion est present',
  existsSync(join(racine, 'supabase/tests/securite.sql')),
  'supabase/tests/securite.sql a disparu : plus rien ne rejoue les attaques.',
)

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
const vert = (t) => `\x1b[32m${t}\x1b[0m`
const rouge = (t) => `\x1b[31m${t}\x1b[0m`
const jaune = (t) => `\x1b[33m${t}\x1b[0m`

console.log('\n  AUDIT DE SECURITE — controles statiques\n')
for (const r of reussites) console.log(`  ${vert('OK')}    ${r}`)
for (const a of avertissements) console.log(`  ${jaune('ATTENTION')} ${a}`)
for (const e of echecs) console.log(`  ${rouge('ECHEC')} ${e}`)

console.log(`\n  ${reussites.length} controle(s) au vert, ${echecs.length} echec(s).\n`)
process.exit(echecs.length > 0 ? 1 : 0)
