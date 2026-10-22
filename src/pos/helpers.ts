/** Petits utilitaires partages par les ecrans de caisse. */

export { cashGap, countCash, EUR_DENOMINATIONS, XOF_DENOMINATIONS } from '@/lib/calc'

/** Convertit une saisie en nombre, 0 si vide ou invalide. */
export function parseSafe(text: string): number {
  const n = Number(String(text ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
