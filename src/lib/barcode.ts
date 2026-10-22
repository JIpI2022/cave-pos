/**
 * Codes-barres et codes produit.
 *
 *  - On utilise EN PRIORITE le code-barres du fabricant (EAN-13 / EAN-8 / UPC-A).
 *  - A defaut, l'application genere un code interne (prefixe parametrable,
 *    ex. CAV000123) imprimable en Code 128.
 */

export type BarcodeKind = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'INTERNE' | 'AUTRE'

/** Ne garde que les chiffres (les douchettes ajoutent parfois des caracteres parasites). */
export function digitsOnly(value: string): string {
  return (value ?? '').replace(/\D/g, '')
}

/**
 * Cle de controle EAN-13 : somme ponderee 1,3,1,3... des 12 premiers chiffres,
 * complement a la dizaine superieure.
 */
export function ean13CheckDigit(first12: string): number {
  const d = digitsOnly(first12).slice(0, 12).padStart(12, '0')
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

/** Verifie un EAN-13 complet (13 chiffres, cle incluse). */
export function isValidEan13(code: string): boolean {
  const d = digitsOnly(code)
  if (d.length !== 13) return false
  return ean13CheckDigit(d.slice(0, 12)) === Number(d[12])
}

/** Cle de controle EAN-8 (ponderation 3,1,3,1...). */
export function ean8CheckDigit(first7: string): number {
  const d = digitsOnly(first7).slice(0, 7).padStart(7, '0')
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(d[i]) * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}

export function isValidEan8(code: string): boolean {
  const d = digitsOnly(code)
  if (d.length !== 8) return false
  return ean8CheckDigit(d.slice(0, 7)) === Number(d[7])
}

/** UPC-A (12 chiffres) : equivalent a un EAN-13 prefixe par 0. */
export function isValidUpcA(code: string): boolean {
  const d = digitsOnly(code)
  if (d.length !== 12) return false
  return isValidEan13('0' + d)
}

/** Convertit un UPC-A en EAN-13 (ajout du 0 de tete). */
export function upcToEan13(code: string): string {
  const d = digitsOnly(code)
  return d.length === 12 ? '0' + d : d
}

/** Identifie la nature d'un code saisi ou scanne. */
export function detectBarcodeKind(code: string): BarcodeKind {
  const raw = (code ?? '').trim()
  if (/^[A-Za-z]{1,6}\d{3,}$/.test(raw)) return 'INTERNE'
  if (isValidEan13(raw)) return 'EAN-13'
  if (isValidUpcA(raw)) return 'UPC-A'
  if (isValidEan8(raw)) return 'EAN-8'
  return 'AUTRE'
}

/**
 * Normalise un code scanne :
 *  - supprime les espaces et retours chariot de la douchette,
 *  - passe les codes internes en majuscules,
 *  - complete un UPC-A en EAN-13 pour que la recherche soit homogene.
 */
export function normalizeScan(raw: string): string {
  const value = (raw ?? '').trim().replace(/[\r\n\t]/g, '')
  if (!value) return ''
  const kind = detectBarcodeKind(value)
  if (kind === 'INTERNE') return value.toUpperCase()
  if (kind === 'UPC-A') return upcToEan13(value)
  return value
}

/** Construit un code interne : prefixe + numero complete de zeros. */
export function buildInternalCode(prefix: string, counter: number, padding = 6): string {
  const safePrefix = (prefix || 'CAV').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return `${safePrefix}${String(Math.max(0, Math.floor(counter))).padStart(padding, '0')}`
}

/** Genere un EAN-13 interne valide a partir d'un compteur (prefixe 200-299 = usage interne). */
export function buildInternalEan13(counter: number, prefix = '200'): string {
  const base = (prefix + String(Math.max(0, Math.floor(counter))).padStart(9, '0')).slice(0, 12)
  return base + String(ean13CheckDigit(base))
}

/**
 * Une douchette USB/Bluetooth se comporte comme un clavier : elle « tape »
 * le code puis valide avec Entree. Cette fonction detecte une saisie rapide
 * (moins de `maxDelayMs` entre deux caracteres) typique d'un scan,
 * par opposition a une frappe humaine.
 */
export function looksLikeScannerInput(timestamps: number[], maxDelayMs = 50): boolean {
  if (timestamps.length < 4) return false
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i - 1] > maxDelayMs) return false
  }
  return true
}
