/**
 * Parametres communs des graphiques (Recharts).
 *
 * Palette categorielle validee pour le daltonisme (ecart CVD Delta E >= 8,
 * ecart en vision normale >= 15 sur l ensemble des paires) : les teintes sont
 * attribuees dans un ordre FIXE, jamais recyclees.
 * La teinte « aqua » passant sous 3:1 de contraste sur fond clair, chaque
 * valeur est accompagnee d une etiquette lisible : l identite n est jamais
 * portee par la couleur seule.
 */

/** Teintes categorielles, dans l ordre d attribution. */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const

/** Teinte unique des series de magnitude (chiffre d affaires, quantites). */
export const SERIES_MAIN = '#9c1f45'   // wine-700 : couleur de marque
export const SERIES_SECOND = '#1baf7a' // marge brute

/** Encres et traits (jamais la couleur de serie pour du texte). */
export const INK = { primary: '#0f172a', secondary: '#52514e', muted: '#94a3b8' }
export const GRID = '#e2e8f0'

export const axisTick = { fontSize: 11, fill: INK.secondary }

/** Abrege un montant pour l axe des ordonnees (1 234 -> 1,2 k). */
export function compactAmount(value: number, symbol = ''): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M${symbol}`
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k${symbol}`
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}${symbol ? ` ${symbol}` : ''}`
}
