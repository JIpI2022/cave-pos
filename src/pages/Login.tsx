/** Ecran de connexion / creation de compte. */

import { useState } from 'react'
import { Activity, Grape, LogIn, UserPlus } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabaseHost, testerConnexion } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'

type Mode = 'connexion' | 'inscription' | 'oubli'

export default function Login() {
  const { signIn, signUp, resetPassword, connectionError } = useAuth()
  const [diagnostic, setDiagnostic] = useState<{ ok: boolean; detail: string } | null>(null)
  const [diagnosticEnCours, setDiagnosticEnCours] = useState(false)
  const [mode, setMode] = useState<Mode>('connexion')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'connexion') {
        await signIn(email, password)
      } else if (mode === 'inscription') {
        if (password.length < 6) throw new Error('Le mot de passe doit comporter au moins 6 caracteres.')
        const { needsConfirmation } = await signUp(email, password, fullName)
        setInfo(
          needsConfirmation
            ? 'Compte cree. Ouvrez le lien de confirmation recu par e-mail, puis connectez-vous.'
            : 'Compte cree. Vous etes connecte.',
        )
        if (needsConfirmation) setMode('connexion')
      } else {
        await resetPassword(email)
        setInfo('Si un compte existe, un lien de reinitialisation vient d etre envoye.')
        setMode('connexion')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-wine-950 to-slate-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-wine-700 shadow-lg">
            <Grape className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Cave &amp; Caisse</h1>
          <p className="text-sm text-slate-300">Gestion de cave, de depot et point de vente</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'connexion' ? 'Connexion' : mode === 'inscription' ? 'Creer un compte' : 'Mot de passe oublie'}
          </h2>

          {connectionError && <Alert kind="warning">{connectionError}</Alert>}
          {error && <Alert kind="error">{error}</Alert>}
          {info && <Alert kind="success">{info}</Alert>}

          {/* Diagnostic propose des qu'une panne de connexion est detectee */}
          {(connectionError || /injoignable/i.test(error ?? '')) && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Button
                type="button" variant="secondary" icon={Activity} className="w-full"
                loading={diagnosticEnCours}
                onClick={async () => {
                  setDiagnosticEnCours(true)
                  setDiagnostic(await testerConnexion())
                  setDiagnosticEnCours(false)
                }}
              >
                Tester la connexion au serveur
              </Button>

              {diagnostic && (
                <Alert kind={diagnostic.ok ? 'success' : 'error'}>{diagnostic.detail}</Alert>
              )}

              <button
                type="button"
                className="w-full text-xs text-slate-500 underline"
                onClick={() => {
                  // Repli en cas de session locale abimee
                  try { localStorage.removeItem('cave-pos-auth') } catch { /* stockage indisponible */ }
                  window.location.reload()
                }}
              >
                Effacer la session enregistree sur cet appareil et recharger
              </button>
            </div>
          )}

          {mode === 'inscription' && (
            <Field label="Nom et prenom" required>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
            </Field>
          )}

          <Field label="Adresse e-mail" required>
            <Input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" inputMode="email" placeholder="vous@exemple.fr"
            />
          </Field>

          {mode !== 'oubli' && (
            <Field label="Mot de passe" required hint={mode === 'inscription' ? '6 caracteres minimum.' : undefined}>
              <Input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={6}
                autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
              />
            </Field>
          )}

          <Button
            type="submit" size="lg" loading={busy} className="w-full"
            icon={mode === 'inscription' ? UserPlus : LogIn}
          >
            {mode === 'connexion' ? 'Se connecter' : mode === 'inscription' ? 'Creer le compte' : 'Envoyer le lien'}
          </Button>

          <div className="flex flex-wrap justify-between gap-2 text-sm">
            {mode !== 'connexion' ? (
              <button type="button" className="text-wine-700 hover:underline" onClick={() => setMode('connexion')}>
                Retour a la connexion
              </button>
            ) : (
              <>
                <button type="button" className="text-wine-700 hover:underline" onClick={() => setMode('inscription')}>
                  Creer un compte
                </button>
                <button type="button" className="text-slate-500 hover:underline" onClick={() => setMode('oubli')}>
                  Mot de passe oublie ?
                </button>
              </>
            )}
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Le premier compte cree devient automatiquement administrateur.
        </p>
        <p className="mt-1 text-center text-[11px] text-slate-500">
          Serveur : <span className="font-mono">{supabaseHost}</span>
          {' · '}
          Version du {formatDateTime(__DATE_COMPILATION__)}
        </p>
      </div>
    </div>
  )
}
