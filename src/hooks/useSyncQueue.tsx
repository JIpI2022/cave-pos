/**
 * Synchronisation des ventes enregistrees hors ligne.
 *
 * Les ventes sont stockees dans IndexedDB puis rejouees des que le reseau
 * revient. La fonction SQL `pos_create_sale` etant idempotente sur
 * `client_uuid`, un rejeu ne cree jamais de doublon.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase, describeError } from '@/lib/supabase'
import { getPendingSales, markFailed, markSynced, type QueuedSale } from '@/lib/offline'
import type { Sale } from '@/types/database'
import { useOnline } from './useOnline'
import { useAuth } from './useAuth'

interface SyncState {
  pending: QueuedSale[]
  pendingCount: number
  syncing: boolean
  lastSyncAt: Date | null
  online: boolean
  /** Relance la synchronisation ; renvoie le nombre de ventes envoyees. */
  syncNow: () => Promise<number>
  /** A appeler apres avoir ajoute une vente a la file. */
  refresh: () => Promise<void>
}

const SyncContext = createContext<SyncState | null>(null)

/** Envoie une vente a Supabase. Renvoie la vente creee (ou existante). */
export async function pushSale(entry: QueuedSale): Promise<Sale> {
  const { data, error } = await supabase.rpc('pos_create_sale', { p: entry.payload })
  if (error) throw error
  return data as Sale
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const { session } = useAuth()
  const [pending, setPending] = useState<QueuedSale[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const running = useRef(false)

  const refresh = useCallback(async () => {
    setPending(await getPendingSales())
  }, [])

  const syncNow = useCallback(async (): Promise<number> => {
    if (running.current || !navigator.onLine || !session) return 0
    running.current = true
    setSyncing(true)
    let sent = 0

    try {
      const queue = await getPendingSales()
      for (const entry of queue) {
        try {
          const sale = await pushSale(entry)
          await markSynced(entry.id, sale.ticket_ref)
          sent++
        } catch (err) {
          const message = describeError(err)
          await markFailed(entry.id, message)
          // Erreur reseau : inutile d'insister, on reessaiera au prochain cycle.
          if (/injoignable|Failed to fetch|network/i.test(message)) break
        }
      }
      setLastSyncAt(new Date())
      await refresh()
    } finally {
      running.current = false
      setSyncing(false)
    }
    return sent
  }, [session, refresh])

  // Chargement initial + synchro au retour du reseau
  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (online && session) void syncNow()
  }, [online, session, syncNow])

  // Nouvelle tentative toutes les 30 s tant qu'il reste des ventes en attente
  useEffect(() => {
    if (!pending.length) return
    const timer = setInterval(() => { if (navigator.onLine) void syncNow() }, 30_000)
    return () => clearInterval(timer)
  }, [pending.length, syncNow])

  const value = useMemo<SyncState>(() => ({
    pending,
    pendingCount: pending.length,
    syncing,
    lastSyncAt,
    online,
    syncNow,
    refresh,
  }), [pending, syncing, lastSyncAt, online, syncNow, refresh])

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSyncQueue(): SyncState {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncQueue doit etre utilise a l interieur de SyncProvider')
  return ctx
}
