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

/**
 * Adresse du serveur contactee, affichee en cas de panne de connexion.
 * Ce n'est pas un secret : elle circule dans chaque requete du navigateur.
 * L'afficher permet de reperer tout de suite une adresse mal renseignee
 * (par exemple celle du tableau de bord au lieu de celle du projet).
 */
export const supabaseHost = (() => {
  if (!url) return '(non configure)'
  try { return new URL(url).host } catch { return `${url} (adresse invalide)` }
})()

/**
 * Teste si le serveur repond. N'importe quelle reponse HTTP suffit :
 * une erreur d'authentification prouve deja que le serveur est joignable.
 */
export async function testerConnexion(): Promise<{ ok: boolean; detail: string }> {
  if (!url) return { ok: false, detail: "Aucune adresse de serveur n'est configuree." }
  try {
    const reponse = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: anonKey ?? '' },
      signal: AbortSignal.timeout(10_000),
    })
    return {
      ok: true,
      detail: `Le serveur ${supabaseHost} repond (code ${reponse.status}).`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/abort|timeout/i.test(message)) {
      return { ok: false, detail: `${supabaseHost} n'a pas repondu en 10 secondes.` }
    }
    return {
      ok: false,
      detail: `${supabaseHost} est injoignable depuis cet appareil (${message}).`,
    }
  }
}

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
  // Chaque navigateur a sa propre formulation pour « la requete n'est jamais
  // partie » : Chrome dit « Failed to fetch », Safari/iOS « Load failed »,
  // Firefox « NetworkError ». Sans cela, l'utilisateur lit de l'anglais brut.
  if (/Failed to fetch|Load failed|NetworkError|network ?error|connection was lost|appears to be offline|ERR_[A-Z_]+|network/i.test(msg)) {
    return `Serveur ${supabaseHost} injoignable. Verifiez la connexion de cet appareil ; `
      + `si le probleme persiste sur plusieurs appareils, c'est le serveur qui ne repond pas.`
  }
  if (/JWT expired/i.test(msg)) return 'Session expiree : reconnectez-vous.'

  return [msg, e.details, e.hint].filter(Boolean).join(' - ')
}
