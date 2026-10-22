/**
 * Formatage pour l'interface francaise :
 * dates JJ/MM/AAAA, montants avec devise parametrable, quantites.
 */

import type { AppSettings } from '@/types/database'
import { roundTo } from './calc'

export interface CurrencyConfig {
  symbol: string
  decimals: number
  code: string
}

export const DEFAULT_CURRENCY: CurrencyConfig = { symbol: '€', decimals: 2, code: 'EUR' }

export function currencyFromSettings(settings?: AppSettings | null): CurrencyConfig {
  if (!settings) return DEFAULT_CURRENCY
  return {
    symbol: settings.currency_symbol || settings.currency || '€',
    decimals: settings.currency_decimals ?? 2,
    code: settings.currency || 'EUR',
  }
}

/** Montant formate : « 12 345,67 € » ou « 12 345 FCFA ». */
export function formatMoney(amount: number | null | undefined, currency: CurrencyConfig = DEFAULT_CURRENCY): string {
  const value = roundTo(Number(amount ?? 0), currency.decimals)
  const text = value.toLocaleString('fr-FR', {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  })
  return `${text} ${currency.symbol}`.trim()
}

/** Montant sans symbole (pour les champs de saisie et les exports). */
export function formatAmount(amount: number | null | undefined, decimals = 2): string {
  return roundTo(Number(amount ?? 0), decimals).toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Quantite : entier si possible, sinon 2 decimales. */
export function formatQty(qty: number | null | undefined): string {
  const n = Number(qty ?? 0)
  return Number.isInteger(n) ? String(n) : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

/** Pourcentage : « 20 % ». */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  const n = Number(value ?? 0)
  const text = Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('fr-FR', { maximumFractionDigits: decimals })
  return `${text} %`
}

/** Date au format JJ/MM/AAAA. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

/** Date et heure : « 21/10/2026 18:42 ». */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d).replace(',', '')
}

/** Heure seule : « 18:42 ». */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Date ISO (AAAA-MM-JJ) a partir d'une Date locale (pour les filtres SQL). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Debut de journee locale. */
export function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Debut de semaine (lundi). */
export function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d)
  const day = x.getDay() === 0 ? 7 : x.getDay() // dimanche = 7
  x.setDate(x.getDate() - (day - 1))
  return x
}

/** Debut de mois. */
export function startOfMonth(d = new Date()): Date {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

/** Nombre de jours ajoutes/retires. */
export function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

/**
 * Lecture d'un nombre saisi par l'utilisateur : accepte la virgule
 * decimale francaise et les espaces de milliers. Renvoie `null` si vide.
 */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const cleaned = input.replace(/\s| /g, '').replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Idem, avec valeur par defaut. */
export function parseNumberOr(input: string | number | null | undefined, fallback: number): number {
  const n = parseNumber(input)
  return n === null ? fallback : n
}

/** Libelles lisibles des unites de conditionnement. */
export const UNIT_LABELS: Record<string, string> = {
  bouteille: 'Bouteille',
  carton_6: 'Carton de 6',
  carton_12: 'Carton de 12',
}

/** Nombre de bouteilles par unite de conditionnement. */
export const UNIT_PACK_SIZE: Record<string, number> = {
  bouteille: 1,
  carton_6: 6,
  carton_12: 12,
}

export const MOVEMENT_LABELS: Record<string, string> = {
  entree: 'Entree (reception)',
  sortie: 'Sortie (vente)',
  transfert: 'Transfert',
  casse: 'Casse / perte',
  ajustement: 'Ajustement d inventaire',
  retour: 'Retour / annulation',
}

export const PAYMENT_LABELS: Record<string, string> = {
  especes: 'Especes',
  carte: 'Carte bancaire',
  mobile_money: 'Mobile money',
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  gerant: 'Gerant',
  caissier: 'Caissier',
}

/** Contenance lisible : 750 ml -> « 75 cl », 1000 ml -> « 1 L ». */
export function formatVolume(ml: number | null | undefined): string {
  if (!ml) return ''
  if (ml % 1000 === 0) return `${ml / 1000} L`
  if (ml % 10 === 0) return `${ml / 10} cl`
  return `${ml} ml`
}

/** Retire les accents (recherche insensible aux accents). */
export function deburr(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Normalisation pour la recherche : minuscules sans accents. */
export function searchKey(text: string | null | undefined): string {
  return deburr(String(text ?? '')).toLowerCase().trim()
}
