/**
 * Authentification Supabase et gestion des roles.
 *
 * Roles (voir supabase/schema.sql) :
 *  - admin    : tout, y compris les parametres et les utilisateurs
 *  - gerant   : stock, rapports, annulations, inventaire, receptions
 *  - caissier : caisse uniquement
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, describeError } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types/database'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** Erreur de chargement du profil (compte desactive, RLS...). */
  profileError: string | null
  role: UserRole | null
  isAdmin: boolean
  isManager: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  /** La session a ete resolue (depuis le stockage local ou le serveur). */
  const [authReady, setAuthReady] = useState(false)
  /** Le profil correspondant a la session a ete charge (ou a echoue). */
  const [profileReady, setProfileReady] = useState(false)
  /** Incremente pour forcer un rechargement du profil. */
  const [profileReload, setProfileReload] = useState(0)

  // ---------------------------------------------------------------------
  // 1. Suivi de la session
  //
  // ATTENTION : le rappel de `onAuthStateChange` est volontairement
  // SYNCHRONE et n appelle AUCUNE autre fonction Supabase. Supabase execute
  // ce rappel en detenant son verrou d authentification ; toute requete
  // (`supabase.from(...)`) a besoin du meme verrou pour lire le jeton, ce qui
  // provoquerait un INTERBLOCAGE : l application resterait bloquee sur
  // l ecran de chargement pour tout utilisateur deja connecte.
  // Le profil est donc charge dans un second effet, en dehors du rappel.
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setAuthReady(true)
    })

    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [])

  // ---------------------------------------------------------------------
  // 2. Chargement du profil (role, nom, compte actif) hors du rappel d auth
  // ---------------------------------------------------------------------
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfileError(null)
      setProfileReady(true)
      return
    }

    let cancelled = false
    setProfileReady(false)

    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setProfile(null)
        setProfileError(describeError(error))
      } else if (!data) {
        setProfile(null)
        setProfileError(
          "Votre compte n'a pas de profil. Demandez a un administrateur de verifier la table « profiles ».",
        )
      } else if (!data.active) {
        setProfile(null)
        setProfileError(
          "Votre compte n'est pas encore actif. Par securite, tout nouveau compte "
          + "doit etre active par un administrateur (Parametres > Utilisateurs et roles), "
          + "qui vous attribuera en meme temps votre role.",
        )
      } else {
        setProfile(data as Profile)
        setProfileError(null)
      }
      setProfileReady(true)
    })()

    return () => { cancelled = true }
  }, [userId, profileReload])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(describeError(error))
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })
    if (error) throw new Error(describeError(error))
    // Si la confirmation d e-mail est active, aucune session n est ouverte.
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + window.location.pathname,
    })
    if (error) throw new Error(describeError(error))
  }, [])

  const refreshProfile = useCallback(async () => {
    setProfileReload((n) => n + 1)
  }, [])

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    loading: !authReady || !profileReady,
    profileError,
    role: profile?.role ?? null,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'admin' || profile?.role === 'gerant',
    signIn, signUp, signOut, resetPassword, refreshProfile,
  }), [session, profile, authReady, profileReady, profileError,
       signIn, signUp, signOut, resetPassword, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit etre utilise a l interieur de AuthProvider')
  return ctx
}
