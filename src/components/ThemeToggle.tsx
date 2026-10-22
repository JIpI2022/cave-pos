/** Bascule clair / sombre / systeme. */

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/hooks/useTheme'

const SUITE: Theme[] = ['systeme', 'clair', 'sombre']
const LIBELLE: Record<Theme, string> = { systeme: 'Theme automatique', clair: 'Theme clair', sombre: 'Theme sombre' }
const ICONE = { systeme: Monitor, clair: Sun, sombre: Moon }

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const Icone = ICONE[theme]
  const suivant = SUITE[(SUITE.indexOf(theme) + 1) % SUITE.length]

  return (
    <button
      type="button"
      onClick={() => setTheme(suivant)}
      title={`${LIBELLE[theme]} — cliquez pour : ${LIBELLE[suivant].toLowerCase()}`}
      aria-label={`${LIBELLE[theme]}. Basculer vers : ${LIBELLE[suivant].toLowerCase()}`}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-current opacity-80 transition hover:bg-white/10 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ambre-400 ${className}`}
    >
      <Icone className="h-[18px] w-[18px]" />
    </button>
  )
}
