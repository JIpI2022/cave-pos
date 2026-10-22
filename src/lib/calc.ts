/**
 * Calculs metier critiques de la caisse et du stock.
 *
 * Ce module est le MIROIR EXACT de la fonction PostgreSQL `pos_create_sale`
 * (supabase/schema.sql). Le serveur reste la source de verite : l'interface
 * utilise ces fonctions pour afficher en temps reel exactement les memes
 * montants que ceux qui seront enregistres.
 *
 * Regles d'arrondi :
 *  - tous les montants intermediaires sont arrondis au centime (2 decimales)
 *    avec un arrondi « commercial » (0,005 -> 0,01) ;
 *  - le HT est deduit du TTC : HT = arrondi(TTC / (1 + taux/100)),
 *    puis TVA = TTC - HT. La somme des lignes est donc toujours exacte.
 */

import type { DiscountType } from '@/types/database'

/** Arrondi commercial a 2 decimales (evite les artefacts binaires : 1.005 -> 1.01). */
export function round2(value: number): number {
  return roundTo(value, 2)
}

/** Arrondi commercial a `decimals` decimales. */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** decimals
  // Le petit epsilon corrige les represenations binaires du type 2.675 -> 2.67499999
  const shifted = value * factor
  const corrected = Math.abs(shifted) < 1e12 ? shifted + (shifted >= 0 ? 1e-9 : -1e-9) : shifted
  return Math.round(corrected) / factor
}

/** Conversion colis -> unites de base (bouteilles). */
export function toBaseUnits(quantity: number, packSize: number): number {
  return round2(quantity * Math.max(1, packSize || 1))
}

/** Conversion unites de base -> colis entiers + reste. */
export function toPacks(baseUnits: number, packSize: number): { packs: number; rest: number } {
  const size = Math.max(1, packSize || 1)
  const packs = Math.floor(baseUnits / size)
  return { packs, rest: round2(baseUnits - packs * size) }
}

// ---------------------------------------------------------------------------
// Remises
// ---------------------------------------------------------------------------

/** Montant d'une remise appliquee a une base (jamais negative, jamais superieure a la base). */
export function discountAmount(base: number, type: DiscountType, value: number): number {
  const v = Number.isFinite(value) ? value : 0
  let amount = 0
  if (type === 'pourcentage') amount = round2((base * v) / 100)
  else if (type === 'montant') amount = Math.min(v, base)
  return Math.max(0, Math.min(amount, Math.max(0, base)))
}

// ---------------------------------------------------------------------------
// Calcul d'un ticket
// ---------------------------------------------------------------------------

export interface SaleLineInput {
  /** Quantite vendue, exprimee dans l'unite de vente (bouteille ou carton). */
  quantity: number
  /** Nombre de bouteilles contenues dans l'unite vendue (1 pour une bouteille). */
  packSize?: number
  /** Prix unitaire TTC de l'unite vendue. */
  unitPriceTtc: number
  /** Taux de TVA en pourcentage (ex. 20 pour 20 %). */
  vatRate: number
  discountType?: DiscountType
  discountValue?: number
}

export interface SaleLineResult {
  /** Quantite x prix unitaire, avant remise. */
  gross: number
  /** Remise propre a la ligne. */
  ownDiscount: number
  /** Part de la remise « ticket » imputee a la ligne (prorata). */
  allocatedDiscount: number
  /** Remise totale de la ligne (propre + prorata). */
  totalDiscount: number
  /** Net a payer de la ligne, TTC. */
  ttc: number
  ht: number
  vat: number
  vatRate: number
  /** Quantite en unites de base (bouteilles), pour le stock. */
  baseUnits: number
}

export interface VatBucket {
  rate: number
  base: number
  vat: number
  ttc: number
}

export interface SaleTotals {
  lines: SaleLineResult[]
  /** Somme des lignes avant toute remise. */
  grossTotal: number
  /** Somme des remises de ligne. */
  lineDiscountTotal: number
  /** Remise appliquee sur l'ensemble du ticket. */
  ticketDiscount: number
  /** Remises cumulees (lignes + ticket). */
  discountTotal: number
  totalTtc: number
  totalHt: number
  totalVat: number
  /** Ventilation de la TVA par taux (pour le ticket et la comptabilite). */
  vatBreakdown: VatBucket[]
  /** Nombre total de bouteilles vendues. */
  totalBaseUnits: number
}

/**
 * Calcule un ticket complet.
 *
 * Etapes (identiques a la fonction SQL) :
 *  1. net de chaque ligne = brut - remise de ligne
 *  2. remise ticket calculee sur la somme des nets
 *  3. remise ticket repartie au PRORATA des nets ; le reliquat d'arrondi est
 *     impute a la derniere ligne pour que la somme reste exacte au centime
 *  4. HT = arrondi(TTC / (1 + taux/100)) ; TVA = TTC - HT
 */
export function computeSale(
  inputs: SaleLineInput[],
  ticketDiscountType: DiscountType = 'aucune',
  ticketDiscountValue = 0,
): SaleTotals {
  const n = inputs.length

  // --- 1. nets de ligne --------------------------------------------------
  const gross: number[] = []
  const ownDiscounts: number[] = []
  const nets: number[] = []
  let sumNet = 0
  let grossTotal = 0
  let lineDiscountTotal = 0

  for (const line of inputs) {
    const g = round2((line.quantity || 0) * (line.unitPriceTtc || 0))
    const d = discountAmount(g, line.discountType ?? 'aucune', line.discountValue ?? 0)
    gross.push(g)
    ownDiscounts.push(d)
    nets.push(round2(g - d))
    sumNet = round2(sumNet + (g - d))
    grossTotal = round2(grossTotal + g)
    lineDiscountTotal = round2(lineDiscountTotal + d)
  }

  // --- 2. remise ticket --------------------------------------------------
  const ticketDiscount = discountAmount(sumNet, ticketDiscountType, ticketDiscountValue)

  // --- 3 & 4. repartition au prorata, puis HT/TVA ------------------------
  const lines: SaleLineResult[] = []
  let running = 0
  let totalTtc = 0
  let totalHt = 0
  let totalBaseUnits = 0

  for (let i = 0; i < n; i++) {
    let allocated = 0
    if (ticketDiscount > 0 && sumNet > 0) {
      if (i < n - 1) {
        allocated = round2((ticketDiscount * nets[i]) / sumNet)
        running = round2(running + allocated)
      } else {
        allocated = round2(ticketDiscount - running)
      }
    }

    const ttc = round2(nets[i] - allocated)
    const rate = inputs[i].vatRate || 0
    const ht = round2(ttc / (1 + rate / 100))
    const baseUnits = toBaseUnits(inputs[i].quantity || 0, inputs[i].packSize ?? 1)

    lines.push({
      gross: gross[i],
      ownDiscount: ownDiscounts[i],
      allocatedDiscount: allocated,
      totalDiscount: round2(ownDiscounts[i] + allocated),
      ttc,
      ht,
      vat: round2(ttc - ht),
      vatRate: rate,
      baseUnits,
    })

    totalTtc = round2(totalTtc + ttc)
    totalHt = round2(totalHt + ht)
    totalBaseUnits = round2(totalBaseUnits + baseUnits)
  }

  // Ventilation de la TVA par taux
  const buckets = new Map<number, VatBucket>()
  for (const l of lines) {
    const b = buckets.get(l.vatRate) ?? { rate: l.vatRate, base: 0, vat: 0, ttc: 0 }
    b.base = round2(b.base + l.ht)
    b.vat = round2(b.vat + l.vat)
    b.ttc = round2(b.ttc + l.ttc)
    buckets.set(l.vatRate, b)
  }

  return {
    lines,
    grossTotal,
    lineDiscountTotal,
    ticketDiscount,
    discountTotal: round2(lineDiscountTotal + ticketDiscount),
    totalTtc,
    totalHt,
    totalVat: round2(totalTtc - totalHt),
    vatBreakdown: [...buckets.values()].sort((a, b) => b.rate - a.rate),
    totalBaseUnits,
  }
}

// ---------------------------------------------------------------------------
// TVA : conversions ponctuelles
// ---------------------------------------------------------------------------

/** Prix HT a partir d'un prix TTC. */
export function htFromTtc(ttc: number, vatRate: number): number {
  return round2(ttc / (1 + (vatRate || 0) / 100))
}

/** Prix TTC a partir d'un prix HT. */
export function ttcFromHt(ht: number, vatRate: number): number {
  return round2(ht * (1 + (vatRate || 0) / 100))
}

/** Marge brute unitaire HT (prix de vente HT - prix d'achat HT). */
export function unitMarginHt(salePriceTtc: number, vatRate: number, purchasePriceHt: number): number {
  return round2(htFromTtc(salePriceTtc, vatRate) - purchasePriceHt)
}

/** Taux de marge en % du prix de vente HT (0 si prix de vente nul). */
export function marginRate(salePriceTtc: number, vatRate: number, purchasePriceHt: number): number {
  const ht = htFromTtc(salePriceTtc, vatRate)
  if (ht <= 0) return 0
  return round2((unitMarginHt(salePriceTtc, vatRate, purchasePriceHt) / ht) * 100)
}

// ---------------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------------

export interface PaymentLine {
  method: 'especes' | 'carte' | 'mobile_money'
  amount: number
}

/**
 * Rendu monnaie : montant remis - montant du. Jamais negatif.
 * `decimals` permet de gerer une devise sans centimes (FCFA : decimals = 0).
 */
export function computeChange(totalDue: number, tendered: number, decimals = 2): number {
  const change = roundTo((tendered || 0) - (totalDue || 0), decimals)
  return change > 0 ? change : 0
}

/** Reste a payer sur un ticket (paiement mixte). Jamais negatif. */
export function remainingToPay(totalDue: number, payments: PaymentLine[], decimals = 2): number {
  const paid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const rest = roundTo(totalDue - paid, decimals)
  return rest > 0 ? rest : 0
}

/** Un ticket est soldé lorsque la somme des paiements couvre le total. */
export function isFullyPaid(totalDue: number, payments: PaymentLine[], decimals = 2): boolean {
  const paid = roundTo(payments.reduce((s, p) => s + (p.amount || 0), 0), decimals)
  const tolerance = decimals === 0 ? 1 : 0.005
  return paid + tolerance >= roundTo(totalDue, decimals)
}

// ---------------------------------------------------------------------------
// Caisse : fond, comptage, cloture
// ---------------------------------------------------------------------------

/** Coupures et pieces proposees au comptage (EUR par defaut). */
export const EUR_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]
/** Coupures et pieces de la zone CFA. */
export const XOF_DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5]

/** Total d'un comptage d'especes : { valeurDeLaCoupure: nombre }. */
export function countCash(counts: Record<string, number>, decimals = 2): number {
  let total = 0
  for (const [denom, qty] of Object.entries(counts)) {
    const d = Number(denom)
    const q = Number(qty)
    if (Number.isFinite(d) && Number.isFinite(q) && q > 0) total += d * q
  }
  return roundTo(total, decimals)
}

/**
 * Especes theoriques en caisse (identique a la fonction SQL cash_session_expected) :
 * fond de caisse + encaissements en especes des ventes validees - remboursements.
 */
export function expectedCash(openingFloat: number, cashReceived: number, refunds = 0, decimals = 2): number {
  return roundTo((openingFloat || 0) + (cashReceived || 0) - (refunds || 0), decimals)
}

/** Ecart de caisse : comptage reel - theorique (positif = excedent). */
export function cashGap(countedCash: number, expected: number, decimals = 2): number {
  return roundTo((countedCash || 0) - (expected || 0), decimals)
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/** Applique un delta a un stock et renvoie le nouveau niveau. */
export function applyDelta(current: number, delta: number): number {
  return round2((current || 0) + (delta || 0))
}

/** Signe applique a un mouvement selon son type (miroir de record_movement). */
export function movementDelta(type: string, quantity: number): number {
  const q = Math.abs(quantity || 0)
  switch (type) {
    case 'entree':
    case 'retour':
      return q
    case 'sortie':
    case 'casse':
      return -q
    default:
      // ajustement / transfert : le signe est porte par la quantite fournie
      return round2(quantity || 0)
  }
}

/** Ecart d'inventaire : compte - theorique. */
export function inventoryGap(counted: number, theoretical: number): number {
  return round2((counted || 0) - (theoretical || 0))
}

/** Valeur d'un stock au prix d'achat HT. */
export function stockValueHt(quantity: number, purchasePriceHt: number): number {
  return round2((quantity || 0) * (purchasePriceHt || 0))
}
