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
import type { ProductFull } from '@/types/database'

export interface CatalogState {
  products: ProductFull[]
  loading: boolean
  /** Vrai si les donnees affichees viennent du cache local. */
  fromCache: boolean
  cachedAt: string | null
  reload: () => Promise<void>
  findByCode: (code: string) => ProductFull | null
  search: (text: string, limit?: number) => ProductFull[]
}

export function useCatalog(): CatalogState {
  const [products, setProducts] = useState<ProductFull[]>([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('v_products_full')
      .select('*')
      .eq('active', true)
      .order('name')

    if (!error && data) {
      setProducts(data as ProductFull[])
      setFromCache(false)
      setCachedAt(new Date().toISOString())
      await cacheSet('catalogue', data)
    } else {
      const cached = await cacheGet<ProductFull[]>('catalogue')
      if (cached) {
        setProducts(cached.data)
        setFromCache(true)
        setCachedAt(cached.updatedAt)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const findByCode = useCallback((code: string): ProductFull | null => {
    const normalized = normalizeScan(code)
    if (!normalized) return null
    const upper = normalized.toUpperCase()
    return products.find(
      (p) => p.barcode === normalized || (p.internal_code ?? '').toUpperCase() === upper,
    ) ?? null
  }, [products])

  const search = useCallback((text: string, limit = 60): ProductFull[] => {
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
