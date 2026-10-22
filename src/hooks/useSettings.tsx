/**
 * Parametres de l'application et referentiels (categories, emplacements).
 * Les donnees sont mises en cache dans IndexedDB pour rester disponibles
 * hors ligne (indispensable pour la caisse).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { cacheGet, cacheSet } from '@/lib/offline'
import { currencyFromSettings, type CurrencyConfig } from '@/lib/format'
import type { AppSettings, Category, Location } from '@/types/database'
import { useAuth } from './useAuth'

interface SettingsState {
  settings: AppSettings | null
  categories: Category[]
  locations: Location[]
  currency: CurrencyConfig
  /** Emplacement par defaut de la caisse (is_sales_point). */
  salesLocation: Location | null
  loading: boolean
  reload: () => Promise<void>
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>
}

const SettingsContext = createContext<SettingsState | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  // On se cale sur l identifiant de l utilisateur, PAS sur l objet session :
  // Supabase en recree un a chaque rafraichissement de jeton, ce qui
  // relancerait le chargement des parametres en boucle.
  const userId = session?.user?.id ?? null
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)

    const [s, c, l] = await Promise.all([
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('locations').select('*').eq('active', true).order('code'),
    ])

    if (s.data) { setSettings(s.data as AppSettings); await cacheSet('settings', s.data) }
    else { const cached = await cacheGet<AppSettings>('settings'); if (cached) setSettings(cached.data) }

    if (c.data) { setCategories(c.data as Category[]); await cacheSet('categories', c.data) }
    else { const cached = await cacheGet<Category[]>('categories'); if (cached) setCategories(cached.data) }

    if (l.data) { setLocations(l.data as Location[]); await cacheSet('locations', l.data) }
    else { const cached = await cacheGet<Location[]>('locations'); if (cached) setLocations(cached.data) }

    setLoading(false)
  }, [userId])

  useEffect(() => { void reload() }, [reload])

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const { data, error } = await supabase
      .from('app_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .maybeSingle()
    if (error) throw error
    if (data) { setSettings(data as AppSettings); await cacheSet('settings', data) }
  }, [])

  const value = useMemo<SettingsState>(() => ({
    settings,
    categories,
    locations,
    currency: currencyFromSettings(settings),
    salesLocation: locations.find((l) => l.is_sales_point) ?? locations[0] ?? null,
    loading,
    reload,
    saveSettings,
  }), [settings, categories, locations, loading, reload, saveSettings])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings doit etre utilise a l interieur de SettingsProvider')
  return ctx
}
