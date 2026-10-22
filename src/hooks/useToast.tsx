/** Notifications ephemeres (coin bas de l'ecran). */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info' | 'warning'
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastApi {
  success: (m: string) => void
  error: (m: string) => void
  info: (m: string) => void
  warning: (m: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
    warning: (m) => push('warning', m),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => {
          const style = {
            success: 'bg-emerald-600', error: 'bg-red-600',
            info: 'bg-stone-800', warning: 'bg-ambre-600',
          }[t.kind]
          const Icon = { success: CheckCircle2, error: XCircle, info: Info, warning: TriangleAlert }[t.kind]
          return (
            <div key={t.id} className={`pointer-events-auto flex max-w-lg items-start gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${style}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-line">{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit etre utilise a l interieur de ToastProvider')
  return ctx
}
