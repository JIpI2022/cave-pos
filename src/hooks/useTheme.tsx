/**
 * Theme clair / sombre.
 *
 * Trois etats : « systeme » (par defaut, suit le reglage du telephone ou du
 * PC), « clair » et « sombre ». Le choix explicite est conserve dans
 * localStorage — c'est une preference d'affichage propre a l'appareil, pas
 * une donnee metier, donc elle n'a rien a faire en base.
 *
 * Tout le theme tient dans la classe `dark` posee sur <html> : les jetons
 * de couleur (src/index.css) basculent alors d'un bloc a l'autre.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'systeme' | 'clair' | 'sombre'

const CLE = 'cave-pos-theme'

function themeEnregistre(): Theme {
  try {
    const v = localStorage.getItem(CLE)
    if (v === 'clair' || v === 'sombre' || v === 'systeme') return v
  } catch { /* stockage indisponible (navigation privee) */ }
  return 'systeme'
}

function prefereSombre(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

type Contexte = { theme: Theme; setTheme: (t: Theme) => void; sombre: boolean }

const Ctx = createContext<Contexte | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeBrut] = useState<Theme>(themeEnregistre)
  const [systemeSombre, setSystemeSombre] = useState(prefereSombre)

  // Suit le reglage de l'appareil tant que l'utilisateur n'a pas tranche
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setSystemeSombre(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const sombre = theme === 'sombre' || (theme === 'systeme' && systemeSombre)

  useEffect(() => {
    const racine = document.documentElement
    racine.classList.toggle('dark', sombre)
    // Aligne les elements natifs (barres de defilement, champs de date)
    racine.style.colorScheme = sombre ? 'dark' : 'light'
    // Couleur de la barre d'adresse sur mobile
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', sombre ? '#1c1917' : '#8a4f15')
  }, [sombre])

  const setTheme = useCallback((t: Theme) => {
    setThemeBrut(t)
    try {
      if (t === 'systeme') localStorage.removeItem(CLE)
      else localStorage.setItem(CLE, t)
    } catch { /* stockage indisponible */ }
  }, [])

  const valeur = useMemo(() => ({ theme, setTheme, sombre }), [theme, setTheme, sombre])
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}

export function useTheme(): Contexte {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme doit etre utilise dans ThemeProvider')
  return ctx
}
