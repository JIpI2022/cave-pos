/**
 * Panier de la caisse (etat global).
 *
 * Le panier est conserve dans le stockage local du navigateur : un
 * rafraichissement accidentel de la page ne fait pas perdre la vente en cours.
 * Seul le panier « en cours » y est stocke ; les ventes validees partent
 * dans la file de synchronisation (IndexedDB) puis dans Supabase.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DiscountType, ProductFull } from '@/types/database'
import { computeSale, type SaleTotals } from '@/lib/calc'

export interface CartLine {
  /** Cle locale de la ligne (permet d avoir deux fois le meme produit avec des remises differentes). */
  key: string
  productId: string | null
  label: string
  /** Prix unitaire TTC de l unite vendue (bouteille ou carton). */
  unitPriceTtc: number
  vatRate: number
  quantity: number
  /** Bouteilles contenues dans l unite vendue. */
  packSize: number
  unit: string
  discountType: DiscountType
  discountValue: number
  /** Prix d achat HT figé (calcul de marge). */
  purchasePriceHt: number
  /** Stock connu au moment de l ajout (alerte visuelle de stock insuffisant). */
  knownStock: number
}

interface CartState {
  lines: CartLine[]
  ticketDiscountType: DiscountType
  ticketDiscountValue: number
  customerId: string | null
  note: string

  addProduct: (product: ProductFull, options?: { asPack?: boolean; quantity?: number }) => void
  addFreeLine: (label: string, unitPriceTtc: number, vatRate: number) => void
  changeQuantity: (key: string, delta: number) => void
  setQuantity: (key: string, quantity: number) => void
  setLineDiscount: (key: string, type: DiscountType, value: number) => void
  setLinePrice: (key: string, price: number) => void
  removeLine: (key: string) => void
  setTicketDiscount: (type: DiscountType, value: number) => void
  setCustomer: (customerId: string | null) => void
  setNote: (note: string) => void
  clear: () => void
}

function newKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      ticketDiscountType: 'aucune',
      ticketDiscountValue: 0,
      customerId: null,
      note: '',

      addProduct: (product, options) => set((state) => {
        const asPack = options?.asPack ?? false
        const packSize = asPack ? Math.max(1, product.pack_size) : 1
        const quantity = options?.quantity ?? 1
        const unitPriceTtc = Number(product.sale_price_ttc) * packSize

        // Si la meme ligne existe deja (meme produit, meme conditionnement,
        // sans remise specifique), on incremente simplement la quantite.
        const existing = state.lines.find(
          (l) => l.productId === product.id && l.packSize === packSize && l.discountType === 'aucune',
        )
        if (existing) {
          return {
            lines: state.lines.map((l) =>
              l.key === existing.key ? { ...l, quantity: l.quantity + quantity } : l),
          }
        }

        const line: CartLine = {
          key: newKey(),
          productId: product.id,
          label: product.name,
          unitPriceTtc,
          vatRate: Number(product.vat_rate),
          quantity,
          packSize,
          unit: asPack ? `carton de ${packSize}` : 'bouteille',
          discountType: 'aucune',
          discountValue: 0,
          purchasePriceHt: Number(product.purchase_price_ht),
          knownStock: Number(product.total_stock ?? 0),
        }
        return { lines: [...state.lines, line] }
      }),

      addFreeLine: (label, unitPriceTtc, vatRate) => set((state) => ({
        lines: [...state.lines, {
          key: newKey(), productId: null, label, unitPriceTtc, vatRate,
          quantity: 1, packSize: 1, unit: 'unite',
          discountType: 'aucune', discountValue: 0, purchasePriceHt: 0, knownStock: 0,
        }],
      })),

      changeQuantity: (key, delta) => set((state) => ({
        lines: state.lines
          .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
          .filter((l) => l.quantity > 0),
      })),

      setQuantity: (key, quantity) => set((state) => ({
        lines: quantity <= 0
          ? state.lines.filter((l) => l.key !== key)
          : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
      })),

      setLineDiscount: (key, type, value) => set((state) => ({
        lines: state.lines.map((l) =>
          l.key === key ? { ...l, discountType: type, discountValue: value } : l),
      })),

      setLinePrice: (key, price) => set((state) => ({
        lines: state.lines.map((l) => (l.key === key ? { ...l, unitPriceTtc: price } : l)),
      })),

      removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),

      setTicketDiscount: (type, value) => set({ ticketDiscountType: type, ticketDiscountValue: value }),
      setCustomer: (customerId) => set({ customerId }),
      setNote: (note) => set({ note }),

      clear: () => set({
        lines: [], ticketDiscountType: 'aucune', ticketDiscountValue: 0, customerId: null, note: '',
      }),
    }),
    {
      name: 'cave-pos-panier',
      storage: createJSONStorage(() => localStorage),
      // On ne persiste que les donnees, pas les fonctions.
      partialize: (s) => ({
        lines: s.lines,
        ticketDiscountType: s.ticketDiscountType,
        ticketDiscountValue: s.ticketDiscountValue,
        customerId: s.customerId,
        note: s.note,
      }),
    },
  ),
)

/** Totaux du panier, calcules exactement comme le serveur. */
export function cartTotals(state: Pick<CartState, 'lines' | 'ticketDiscountType' | 'ticketDiscountValue'>): SaleTotals {
  return computeSale(
    state.lines.map((l) => ({
      quantity: l.quantity,
      packSize: l.packSize,
      unitPriceTtc: l.unitPriceTtc,
      vatRate: l.vatRate,
      discountType: l.discountType,
      discountValue: l.discountValue,
    })),
    state.ticketDiscountType,
    state.ticketDiscountValue,
  )
}
