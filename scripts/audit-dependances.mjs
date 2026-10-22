#!/usr/bin/env node
/**
 * Failles connues dans les bibliotheques LIVREES au navigateur.
 *
 * Echoue des qu'une faille nouvelle apparait. Les failles deja examinees
 * figurent ci-dessous avec leur justification et une DATE DE REEXAMEN :
 * passee cette date, le controle echoue a nouveau pour forcer la relecture.
 * Une exception sans date devient un oubli permanent.
 *
 * Usage :  npm run audit:dependances
 */

import { execSync } from 'node:child_process'

/** Failles examinees, acceptees temporairement, avec leur raison. */
const EXCEPTIONS = [
  {
    paquet: 'xlsx',
    severiteMax: 'high',
    reexamenLe: '2027-04-01',
    raison:
      "Pollution de prototype et deni de service par expression reguliere, tous deux "
      + "dans la LECTURE de classeurs. L'application n'ecrit que des fichiers Excel : "
      + "les imports se font en CSV, analyses par notre propre code. Le controle "
      + "« Aucune lecture de classeur Excel » de npm run audit:securite garantit que "
      + "cette surface ne sera pas ouverte. Le paquet n'est plus publie sur npm par "
      + "SheetJS ; a reexaminer si une alternative maintenue apparait.",
  },
]

const ORDRE = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }
const SEUIL = 'high'   // on bloque a partir de « high » sur le code livre

let rapport
try {
  rapport = JSON.parse(execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
} catch (e) {
  // npm audit sort en code non nul des qu'une faille existe : la sortie reste valide.
  rapport = JSON.parse(e.stdout || '{}')
}

const vulnerabilites = Object.entries(rapport.vulnerabilities ?? {})
  .filter(([, v]) => ORDRE[v.severity] >= ORDRE[SEUIL])

const aujourdHui = new Date().toISOString().slice(0, 10)
const bloquantes = []
const acceptees = []

for (const [nom, v] of vulnerabilites) {
  const exc = EXCEPTIONS.find((e) => e.paquet === nom)
  if (!exc) {
    bloquantes.push(`${nom} [${v.severity}] — faille NON examinee`)
  } else if (ORDRE[v.severity] > ORDRE[exc.severiteMax]) {
    bloquantes.push(`${nom} [${v.severity}] — plus grave que l'exception accordee (${exc.severiteMax})`)
  } else if (aujourdHui > exc.reexamenLe) {
    bloquantes.push(`${nom} [${v.severity}] — exception expiree le ${exc.reexamenLe}, a reexaminer`)
  } else {
    acceptees.push({ nom, severite: v.severity, exc })
  }
}

const vert = (t) => `\x1b[32m${t}\x1b[0m`
const rouge = (t) => `\x1b[31m${t}\x1b[0m`
const jaune = (t) => `\x1b[33m${t}\x1b[0m`

console.log('\n  FAILLES CONNUES — bibliotheques livrees au navigateur\n')
if (!vulnerabilites.length) console.log(`  ${vert('OK')}    Aucune faille de niveau ${SEUIL} ou superieur.`)

for (const a of acceptees) {
  console.log(`  ${jaune('ACCEPTEE')} ${a.nom} [${a.severite}] — reexamen le ${a.exc.reexamenLe}`)
  console.log(`           ${a.exc.raison.replace(/\s+/g, ' ')}`)
}
for (const b of bloquantes) console.log(`  ${rouge('BLOQUANT')} ${b}`)

console.log(
  `\n  ${acceptees.length} faille(s) examinee(s) et acceptee(s), `
  + `${bloquantes.length} a traiter.\n`,
)
process.exit(bloquantes.length > 0 ? 1 : 0)
