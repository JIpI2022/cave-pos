/**
 * Client Supabase unique pour toute l'application.
 *
 * Les cles sont injectees a la compilation par Vite depuis les variables
 * d'environnement (secrets GitHub en production, fichier .env en local).
 * La cle « anon » est publique par nature : la securite repose sur les
 * politiques RLS definies dans supabase/schema.sql.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Permet d'afficher un ecran d'aide plutot qu'une page blanche si la config manque. */
export const hasSupabaseConfig = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // HashRouter : on gere la navigation nous-memes
      storageKey: 'cave-pos-auth',
    },
    global: {
      headers: { 'x-application-name': 'cave-pos' },
    },
  },
)

/** Traduit les erreurs techniques de Supabase en messages comprehensibles. */
export function describeError(error: unknown): string {
  if (!error) return 'Erreur inconnue.'
  const e = error as { message?: string; code?: string; details?: string; hint?: string }
  const msg = e.message ?? String(error)

  if (/Invalid login credentials/i.test(msg)) return 'Adresse e-mail ou mot de passe incorrect.'
  if (/Email not confirmed/i.test(msg)) return 'Adresse e-mail non confirmee : verifiez votre boite de reception.'
  if (/User already registered/i.test(msg)) return 'Un compte existe deja avec cette adresse e-mail.'
  if (/Password should be at least/i.test(msg)) return 'Le mot de passe doit comporter au moins 6 caracteres.'
  if (/duplicate key value.*barcode/i.test(msg)) return 'Ce code-barres est deja utilise par un autre produit.'
  if (/duplicate key value.*internal_code/i.test(msg)) return 'Ce code interne est deja utilise.'
  if (/duplicate key value.*client_uuid/i.test(msg)) return 'Cette vente a deja ete enregistree.'
  if (/duplicate key value/i.test(msg)) return 'Cet enregistrement existe deja.'
  if (/row-level security|violates row-level/i.test(msg)) return 'Droits insuffisants pour cette operation.'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Serveur injoignable : verifiez votre connexion.'
  if (/JWT expired/i.test(msg)) return 'Session expiree : reconnectez-vous.'

  return [msg, e.details, e.hint].filter(Boolean).join(' - ')
}
