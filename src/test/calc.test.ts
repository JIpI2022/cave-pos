/**
 * Tests des calculs critiques : TVA, remises, totaux, rendu monnaie,
 * cloture de caisse, stock.
 *
 * Les valeurs attendues du bloc « parite avec PostgreSQL » ont ete relevees
 * sur une vraie base PostgreSQL en executant supabase/tests/smoke.sql :
 * l'interface et le serveur doivent afficher les memes montants au centime.
 */

import { describe, expect, it } from 'vitest'
import {
  applyDelta, cashGap, computeChange, computeSale, countCash, discountAmount,
  expectedCash, htFromTtc, inventoryGap, isFullyPaid, marginRate, movementDelta,
  remainingToPay, round2, roundTo, stockValueHt, toBaseUnits, toPacks, ttcFromHt,
  unitMarginHt, EUR_DENOMINATIONS, XOF_DENOMINATIONS,
} from '@/lib/calc'

describe('arrondis', () => {
  it('arrondit au centime en mode commercial', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)   // piege classique du binaire (2.67499999)
    expect(round2(0.125)).toBe(0.13)
    expect(round2(10)).toBe(10)
  })

  it('arrondit loin de zero pour les montants negatifs (comme PostgreSQL)', () => {
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(-0.005)).toBe(-0.01)
  })

  it('gere les devises sans decimale (FCFA)', () => {
    expect(roundTo(1250.6, 0)).toBe(1251)
    expect(roundTo(1250.4, 0)).toBe(1250)
    expect(roundTo(0.5, 0)).toBe(1)
  })

  it('renvoie 0 pour une valeur non numerique', () => {
    expect(round2(Number.NaN)).toBe(0)
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('conversions carton / bouteille', () => {
  it('convertit les colis en bouteilles', () => {
    expect(toBaseUnits(3, 6)).toBe(18)
    expect(toBaseUnits(2, 12)).toBe(24)
    expect(toBaseUnits(5, 1)).toBe(5)
    expect(toBaseUnits(5, 0)).toBe(5)   // pack_size invalide -> 1
  })

  it('convertit les bouteilles en colis entiers + reste', () => {
    expect(toPacks(25, 6)).toEqual({ packs: 4, rest: 1 })
    expect(toPacks(24, 6)).toEqual({ packs: 4, rest: 0 })
    expect(toPacks(5, 12)).toEqual({ packs: 0, rest: 5 })
  })
})

describe('remises', () => {
  it('calcule une remise en pourcentage', () => {
    expect(discountAmount(100, 'pourcentage', 10)).toBe(10)
    expect(discountAmount(55, 'pourcentage', 10)).toBe(5.5)
    expect(discountAmount(27.5, 'pourcentage', 15)).toBe(4.13) // 4.125 -> 4.13
  })

  it('calcule une remise en montant et la plafonne a la base', () => {
    expect(discountAmount(100, 'montant', 15)).toBe(15)
    expect(discountAmount(10, 'montant', 15)).toBe(10)
  })

  it('ignore les remises negatives ou absentes', () => {
    expect(discountAmount(100, 'aucune', 50)).toBe(0)
    expect(discountAmount(100, 'pourcentage', -10)).toBe(0)
    expect(discountAmount(100, 'montant', -5)).toBe(0)
  })
})

describe('TVA', () => {
  it('deduit le HT du TTC', () => {
    expect(htFromTtc(120, 20)).toBe(100)
    expect(htFromTtc(27.5, 20)).toBe(22.92)
    expect(htFromTtc(31, 20)).toBe(25.83)
    expect(htFromTtc(10.55, 5.5)).toBe(10)
  })

  it('calcule le TTC depuis le HT', () => {
    expect(ttcFromHt(100, 20)).toBe(120)
    expect(ttcFromHt(10, 5.5)).toBe(10.55)
  })

  it('calcule la marge unitaire et le taux de marge', () => {
    // Vente 27,50 TTC a 20 % => 22,92 HT ; achat 14,50 HT => marge 8,42
    expect(unitMarginHt(27.5, 20, 14.5)).toBe(8.42)
    expect(marginRate(27.5, 20, 14.5)).toBe(36.74)
    expect(marginRate(0, 20, 5)).toBe(0)
  })
})

describe('computeSale : ticket complet', () => {
  it('calcule un ticket simple a un seul article', () => {
    const t = computeSale([{ quantity: 3, unitPriceTtc: 9.9, vatRate: 20 }])
    expect(t.totalTtc).toBe(29.7)
    expect(t.totalHt).toBe(24.75)
    expect(t.totalVat).toBe(4.95)
    expect(t.discountTotal).toBe(0)
    expect(t.totalBaseUnits).toBe(3)
  })

  it('applique une remise de ligne', () => {
    const t = computeSale([
      { quantity: 2, unitPriceTtc: 27.5, vatRate: 20, discountType: 'pourcentage', discountValue: 10 },
    ])
    expect(t.grossTotal).toBe(55)
    expect(t.lineDiscountTotal).toBe(5.5)
    expect(t.totalTtc).toBe(49.5)
  })

  /**
   * PARITE AVEC POSTGRESQL (supabase/tests/smoke.sql, etape 3)
   * 2 x 27,50 remise 10 % + 1 x 31,00, remise ticket 5,00 EUR.
   * Resultat PostgreSQL : total 75,50 / HT 62,92 / TVA 12,58 / remises 10,50
   * Lignes : 46,43 (HT 38,69 - TVA 7,74) et 29,07 (HT 24,23 - TVA 4,84)
   */
  it('reproduit exactement le calcul du serveur (remise ligne + remise ticket)', () => {
    const t = computeSale(
      [
        { quantity: 2, unitPriceTtc: 27.5, vatRate: 20, discountType: 'pourcentage', discountValue: 10 },
        { quantity: 1, unitPriceTtc: 31, vatRate: 20 },
      ],
      'montant',
      5,
    )

    expect(t.totalTtc).toBe(75.5)
    expect(t.totalHt).toBe(62.92)
    expect(t.totalVat).toBe(12.58)
    expect(t.discountTotal).toBe(10.5)
    expect(t.ticketDiscount).toBe(5)

    expect(t.lines[0].ttc).toBe(46.43)
    expect(t.lines[0].ht).toBe(38.69)
    expect(t.lines[0].vat).toBe(7.74)
    expect(t.lines[0].totalDiscount).toBe(8.57)

    expect(t.lines[1].ttc).toBe(29.07)
    expect(t.lines[1].ht).toBe(24.23)
    expect(t.lines[1].vat).toBe(4.84)
    expect(t.lines[1].totalDiscount).toBe(1.93)
  })

  it('garantit que la somme des lignes egale le total (reliquat d arrondi)', () => {
    // 3 lignes identiques et une remise de 10 : 10/3 = 3,333... par ligne
    const t = computeSale(
      [
        { quantity: 1, unitPriceTtc: 10, vatRate: 20 },
        { quantity: 1, unitPriceTtc: 10, vatRate: 20 },
        { quantity: 1, unitPriceTtc: 10, vatRate: 20 },
      ],
      'montant',
      10,
    )
    const sumLines = round2(t.lines.reduce((s, l) => s + l.ttc, 0))
    const sumAllocated = round2(t.lines.reduce((s, l) => s + l.allocatedDiscount, 0))

    expect(sumLines).toBe(t.totalTtc)
    expect(sumLines).toBe(20)
    expect(sumAllocated).toBe(10)                      // aucun centime perdu
    expect(t.lines.map((l) => l.allocatedDiscount)).toEqual([3.33, 3.33, 3.34])
  })

  it('applique une remise ticket en pourcentage', () => {
    const t = computeSale(
      [{ quantity: 1, unitPriceTtc: 100, vatRate: 20 }, { quantity: 1, unitPriceTtc: 50, vatRate: 20 }],
      'pourcentage',
      10,
    )
    expect(t.ticketDiscount).toBe(15)
    expect(t.totalTtc).toBe(135)
    expect(t.lines[0].allocatedDiscount).toBe(10)
    expect(t.lines[1].allocatedDiscount).toBe(5)
  })

  it('plafonne la remise ticket au montant du panier', () => {
    const t = computeSale([{ quantity: 1, unitPriceTtc: 20, vatRate: 20 }], 'montant', 100)
    expect(t.ticketDiscount).toBe(20)
    expect(t.totalTtc).toBe(0)
  })

  it('ventile la TVA par taux', () => {
    const t = computeSale([
      { quantity: 1, unitPriceTtc: 120, vatRate: 20 },   // HT 100, TVA 20
      { quantity: 2, unitPriceTtc: 10.55, vatRate: 5.5 }, // 21,10 TTC -> HT 20, TVA 1,10
    ])
    expect(t.vatBreakdown).toHaveLength(2)
    expect(t.vatBreakdown[0]).toEqual({ rate: 20, base: 100, vat: 20, ttc: 120 })
    expect(t.vatBreakdown[1]).toEqual({ rate: 5.5, base: 20, vat: 1.1, ttc: 21.1 })
    expect(t.totalVat).toBe(21.1)
  })

  it('compte les bouteilles vendues a travers les cartons', () => {
    const t = computeSale([
      { quantity: 2, packSize: 6, unitPriceTtc: 15, vatRate: 20 },  // 12 bouteilles
      { quantity: 3, unitPriceTtc: 9.9, vatRate: 20 },              // 3 bouteilles
    ])
    expect(t.lines[0].baseUnits).toBe(12)
    expect(t.totalBaseUnits).toBe(15)
    expect(t.totalTtc).toBe(59.7)
  })

  it('renvoie des totaux a zero pour un panier vide', () => {
    const t = computeSale([])
    expect(t.totalTtc).toBe(0)
    expect(t.totalHt).toBe(0)
    expect(t.lines).toHaveLength(0)
  })
})

describe('rendu monnaie', () => {
  it('calcule le rendu', () => {
    expect(computeChange(75.5, 100)).toBe(24.5)
    expect(computeChange(29.7, 30)).toBe(0.3)
    expect(computeChange(12.34, 12.34)).toBe(0)
  })

  it('ne rend jamais un montant negatif', () => {
    expect(computeChange(50, 20)).toBe(0)
  })

  it('arrondit a l unite pour une devise sans centimes (FCFA)', () => {
    expect(computeChange(12500, 20000, 0)).toBe(7500)
    expect(computeChange(12500.4, 20000, 0)).toBe(7500)
  })
})

describe('paiement mixte', () => {
  const total = 62

  it('calcule le reste a payer', () => {
    expect(remainingToPay(total, [{ method: 'carte', amount: 40 }])).toBe(22)
    expect(remainingToPay(total, [{ method: 'carte', amount: 40 }, { method: 'especes', amount: 22 }])).toBe(0)
  })

  it('ne renvoie pas de reste negatif en cas de trop-percu', () => {
    expect(remainingToPay(total, [{ method: 'especes', amount: 100 }])).toBe(0)
  })

  it('detecte un ticket solde', () => {
    expect(isFullyPaid(total, [{ method: 'carte', amount: 62 }])).toBe(true)
    expect(isFullyPaid(total, [{ method: 'carte', amount: 61.99 }])).toBe(false)
    expect(isFullyPaid(total, [
      { method: 'carte', amount: 40 },
      { method: 'mobile_money', amount: 22 },
    ])).toBe(true)
  })

  it('tolere l unite sur une devise sans centimes', () => {
    expect(isFullyPaid(1250, [{ method: 'especes', amount: 1249 }], 0)).toBe(true)
    expect(isFullyPaid(1250, [{ method: 'especes', amount: 1200 }], 0)).toBe(false)
  })
})

describe('cloture de caisse', () => {
  it('totalise un comptage d especes', () => {
    // 2 billets de 50 + 3 de 20 + 1 de 10 + 4 pieces de 2 + 5 de 0,50
    expect(countCash({ '50': 2, '20': 3, '10': 1, '2': 4, '0.5': 5 })).toBe(100 + 60 + 10 + 8 + 2.5)
  })

  it('ignore les quantites vides ou invalides', () => {
    expect(countCash({ '50': 0, '20': Number.NaN as unknown as number, '10': 1 })).toBe(10)
  })

  it('propose les coupures EUR et FCFA', () => {
    expect(EUR_DENOMINATIONS[0]).toBe(500)
    expect(EUR_DENOMINATIONS.at(-1)).toBe(0.01)
    expect(XOF_DENOMINATIONS[0]).toBe(10000)
  })

  /**
   * PARITE AVEC POSTGRESQL (smoke.sql, etape 12)
   * fond 100 + 22 encaisses en especes - 31 rembourses = 91 theoriques.
   * Comptage 95 => ecart +4.
   */
  it('calcule les especes theoriques et l ecart comme le serveur', () => {
    const expected = expectedCash(100, 22, 31)
    expect(expected).toBe(91)
    expect(cashGap(95, expected)).toBe(4)
    expect(cashGap(85, expected)).toBe(-6)
    expect(cashGap(91, expected)).toBe(0)
  })

  it('gere un fond de caisse sans mouvement', () => {
    expect(expectedCash(150, 0, 0)).toBe(150)
    expect(cashGap(150, 150)).toBe(0)
  })
})

describe('stock', () => {
  it('applique un delta', () => {
    expect(applyDelta(12, -2)).toBe(10)
    expect(applyDelta(0, 24)).toBe(24)
    expect(applyDelta(10, -12)).toBe(-2) // stock negatif autorise (signale dans l interface)
  })

  it('donne le signe du mouvement selon son type', () => {
    expect(movementDelta('entree', 6)).toBe(6)
    expect(movementDelta('entree', -6)).toBe(6)     // une entree est toujours positive
    expect(movementDelta('sortie', 3)).toBe(-3)
    expect(movementDelta('casse', 2)).toBe(-2)
    expect(movementDelta('retour', 1)).toBe(1)
    expect(movementDelta('ajustement', -5)).toBe(-5) // signe libre
    expect(movementDelta('ajustement', 5)).toBe(5)
  })

  it('calcule un ecart d inventaire', () => {
    expect(inventoryGap(15, 18)).toBe(-3)
    expect(inventoryGap(20, 18)).toBe(2)
    expect(inventoryGap(18, 18)).toBe(0)
  })

  it('valorise un stock au prix d achat', () => {
    expect(stockValueHt(24, 14.5)).toBe(348)
    expect(stockValueHt(0, 14.5)).toBe(0)
  })
})
