/**
 * Mode hors ligne de la caisse.
 *
 * Principe : une vente est TOUJOURS ecrite d'abord dans IndexedDB avec un
 * identifiant `client_uuid` genere sur le poste. On tente ensuite de l'envoyer
 * a Supabase. Si le reseau est absent, la vente reste en file d'attente et sera
 * rejouee automatiquement au retour de la connexion.
 *
 * La fonction SQL `pos_create_sale` est idempotente sur `client_uuid` :
 * rejouer une vente deja enregistree ne la duplique jamais.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { SalePayload } from '@/types/database'

export interface QueuedSale {
  /** client_uuid : cle primaire, identique a celle envoyee au serveur. */
  id: string
  payload: SalePayload
  /** Horodatage de creation locale (ISO). */
  createdAt: string
  /** Nombre de tentatives d'envoi. */
  attempts: number
  /** Derniere erreur rencontree (affichee dans le bandeau de synchro). */
  lastError?: string
  /** 'en_attente' | 'envoyee' | 'erreur' */
  status: 'en_attente' | 'envoyee' | 'erreur'
  /** Reference du ticket renvoyee par le serveur apres synchronisation. */
  ticketRef?: string
}

interface CaveDB extends DBSchema {
  sales_queue: {
    key: string
    value: QueuedSale
    indexes: { 'by-status': string }
  }
  /** Cache du catalogue pour permettre la vente hors ligne. */
  catalog: {
    key: string
    value: { key: string; updatedAt: string; data: unknown }
  }
}

const DB_NAME = 'cave-pos'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<CaveDB>> | null = null

function getDb(): Promise<IDBPDatabase<CaveDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CaveDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sales_queue')) {
          const store = db.createObjectStore('sales_queue', { keyPath: 'id' })
          store.createIndex('by-status', 'status')
        }
        if (!db.objectStoreNames.contains('catalog')) {
          db.createObjectStore('catalog', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

/** Ajoute une vente a la file d'attente locale. */
export async function enqueueSale(payload: SalePayload): Promise<QueuedSale> {
  const db = await getDb()
  const entry: QueuedSale = {
    id: payload.client_uuid,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'en_attente',
  }
  await db.put('sales_queue', entry)
  return entry
}

/** Ventes restant a synchroniser (en attente ou en erreur). */
export async function getPendingSales(): Promise<QueuedSale[]> {
  const db = await getDb()
  const all = await db.getAll('sales_queue')
  return all
    .filter((s) => s.status !== 'envoyee')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Nombre de ventes en attente (pour le bandeau de synchronisation). */
export async function countPendingSales(): Promise<number> {
  return (await getPendingSales()).length
}

/** Marque une vente comme synchronisee puis la purge de la file. */
export async function markSynced(id: string, ticketRef: string): Promise<void> {
  const db = await getDb()
  const entry = await db.get('sales_queue', id)
  if (entry) {
    entry.status = 'envoyee'
    entry.ticketRef = ticketRef
    await db.put('sales_queue', entry)
  }
  // On conserve l'historique 24 h puis on purge (traçabilite locale courte).
  await purgeSyncedOlderThan(24 * 3600 * 1000)
}

/** Enregistre un echec d'envoi (la vente reste en file d'attente). */
export async function markFailed(id: string, message: string): Promise<void> {
  const db = await getDb()
  const entry = await db.get('sales_queue', id)
  if (!entry) return
  entry.attempts += 1
  entry.lastError = message
  entry.status = 'en_attente'
  await db.put('sales_queue', entry)
}

/** Supprime definitivement une vente de la file (abandon volontaire). */
export async function dropQueuedSale(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('sales_queue', id)
}

async function purgeSyncedOlderThan(ageMs: number): Promise<void> {
  const db = await getDb()
  const all = await db.getAll('sales_queue')
  const limit = Date.now() - ageMs
  for (const s of all) {
    if (s.status === 'envoyee' && new Date(s.createdAt).getTime() < limit) {
      await db.delete('sales_queue', s.id)
    }
  }
}

/** Met en cache une liste (catalogue produits, emplacements...) pour l'usage hors ligne. */
export async function cacheSet(key: string, data: unknown): Promise<void> {
  const db = await getDb()
  await db.put('catalog', { key, updatedAt: new Date().toISOString(), data })
}

/** Relit une liste mise en cache. */
export async function cacheGet<T>(key: string): Promise<{ data: T; updatedAt: string } | null> {
  const db = await getDb()
  const row = await db.get('catalog', key)
  return row ? { data: row.data as T, updatedAt: row.updatedAt } : null
}

/** Identifiant de vente local (UUID v4). */
export function newClientUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Repli pour les navigateurs anciens
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
