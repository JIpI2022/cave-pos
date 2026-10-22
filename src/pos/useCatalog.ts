/**
 * Catalogue produits pour la caisse, avec repli hors ligne.
 *
 * A chaque chargement reussi, le catalogue est copie dans IndexedDB.
 * Si le reseau est absent, on repart de cette copie : la caisse reste
 * utilisable (scan, panier, encaissement) meme sans connexion.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cacheGet, cacheSet } from '@/lib/offline'
import { normalizeScan } from '@/lib/barcode'
import { searchKey } from '@/lib/format'
import type { PosProduct } from '@/types/database'

export interface CatalogState {
  products: PosProduct[]
  loading: boolean
  /** Vrai si les donnees affichees viennent du cache local. */
  fromCache: boolean
  cachedAt: string | null
  reload: () => Promise<void>
  findByCode: (code: string) => PosProduct | null
  search: (text: string, limit?: number) => PosProduct[]
}

export function useCatalog(): CatalogState {
  const [products, setProducts] = useState<PosProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    // v_pos_catalog n'expose NI prix d'achat NI marge : meme en interrogeant
    // l'API directement, un caissier ne peut pas lire les couts.
    const { data, error } = await supabase
      .from('v_pos_catalog')
      .select('*')
      .order('name')

    if (!error && data) {
      setProducts(data as PosProduct[])
      setFromCache(false)
      setCachedAt(new Date().toISOString())
      await cacheSet('catalogue', data)
    } else {
      const cached = await cacheGet<PosProduct[]>('catalogue')
      if (cached) {
        setProducts(cached.data)
        setFromCache(true)
        setCachedAt(cached.updatedAt)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const findByCode = useCallback((code: string): PosProduct | null => {
    const normalized = normalizeScan(code)
    if (!normalized) return null
    const upper = normalized.toUpperCase()
    return products.find(
      (p) => p.barcode === normalized || (p.internal_code ?? '').toUpperCase() === upper,
    ) ?? null
  }, [products])

  const search = useCallback((text: string, limit = 60): PosProduct[] => {
    const key = searchKey(text)
    if (!key) return products.slice(0, limit)
    return products
      .filter((p) =>
        searchKey(p.name).includes(key) ||
        searchKey(p.appellation).includes(key) ||
        searchKey(p.category_label).includes(key) ||
        (p.barcode ?? '').includes(key) ||
        searchKey(p.internal_code).includes(key))
      .slice(0, limit)
  }, [products])

  return { products, loading, fromCache, cachedAt, reload, findByCode, search }
}
