/**
 * Parametres communs des graphiques (Recharts).
 *
 * Palette categorielle validee pour le daltonisme (ecart CVD Delta E >= 8,
 * ecart en vision normale >= 15 sur l ensemble des paires) : les teintes sont
 * attribuees dans un ordre FIXE, jamais recyclees.
 * La teinte « aqua » passant sous 3:1 de contraste sur fond clair, chaque
 * valeur est accompagnee d une etiquette lisible : l identite n est jamais
 * portee par la couleur seule.
 *
 * Recharts recoit des couleurs sous forme d attributs SVG, ou `var(--jeton)`
 * n est pas resolu : les teintes du theme sont donc fournies en dur par
 * `useChartTheme()`, qui renvoie le jeu clair ou sombre selon le theme actif.
 */

import { useMemo } from 'react'
import { useTheme } from '@/hooks/useTheme'

/** Teintes categorielles, dans l ordre d attribution (fond clair). */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const

/** Memes teintes eclaircies : sur fond sombre, les versions saturees s eteignent. */
export const CATEGORICAL_DARK = ['#6ba5e7', '#f59364', '#4ecfa0', '#f0bd4d', '#f2a3c0', '#5cc45c'] as const

/** Abrege un montant pour l axe des ordonnees (1 234 -> 1,2 k). */
export function compactAmount(value: number, symbol = ''): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M${symbol}`
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k${symbol}`
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}${symbol ? ` ${symbol}` : ''}`
}

export type ChartTheme = {
  /** Teinte unique des series de magnitude (chiffre d affaires, quantites). */
  SERIES_MAIN: string
  /** Seconde serie (marge brute). */
  SERIES_SECOND: string
  /** Encres : jamais la couleur de serie pour du texte. */
  INK: { primary: string; secondary: string; muted: string }
  /** Lignes de la grille. */
  GRID: string
  /** Fond des cartes : contour des points et des infobulles. */
  SURFACE: string
  /** Palette categorielle adaptee au fond. */
  CATEGORICAL: readonly string[]
  /** Style des graduations d axe. */
  axisTick: { fontSize: number; fill: string }
  /** Voile de survol d une barre. */
  CURSOR: string
}

// Contrastes mesures sur le fond correspondant (voir src/index.css) :
// clair  — ambre-700 #8a4f15 sur carte blanche : 6,5:1 ; encre secondaire 7,0:1
// sombre — ambre-400 #daa03e sur carte #292524 : 7,2:1 ; encre secondaire 6,1:1
const CLAIR: Omit<ChartTheme, 'axisTick'> = {
  SERIES_MAIN: '#8a4f15',
  SERIES_SECOND: '#1baf7a',
  INK: { primary: '#1c1917', secondary: '#57534e', muted: '#a8a29e' },
  GRID: '#e7e5e4',
  SURFACE: '#ffffff',
  CATEGORICAL,
  CURSOR: 'rgba(28, 25, 23, 0.05)',
}

const SOMBRE: Omit<ChartTheme, 'axisTick'> = {
  SERIES_MAIN: '#daa03e',
  SERIES_SECOND: '#4ecfa0',
  INK: { primary: '#f5f5f4', secondary: '#c7c2bd', muted: '#8a8580' },
  GRID: '#44403c',
  SURFACE: '#292524',
  CATEGORICAL: CATEGORICAL_DARK,
  CURSOR: 'rgba(255, 255, 255, 0.07)',
}

/** Jeu de couleurs des graphiques correspondant au theme actif. */
export function useChartTheme(): ChartTheme {
  const { sombre } = useTheme()
  return useMemo(() => {
    const base = sombre ? SOMBRE : CLAIR
    return { ...base, axisTick: { fontSize: 11, fill: base.INK.secondary } }
  }, [sombre])
}
