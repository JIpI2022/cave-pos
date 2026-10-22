/**
 * Petit kit d'interface maison (boutons, champs, fenetres modales, tableaux).
 * Volontairement minimal : aucune dependance de composants externe a maintenir.
 */

import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'

// ---------------------------------------------------------------- Boutons
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({
  variant = 'primary', size, loading, icon: Icon, children, className = '', ...rest
}: {
  variant?: ButtonVariant
  size?: 'lg'
  loading?: boolean
  icon?: React.ComponentType<{ className?: string }>
  children?: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    variant === 'primary' ? 'btn-primary'
    : variant === 'danger' ? 'btn-danger'
    : variant === 'ghost' ? 'btn-ghost'
    : 'btn-secondary'
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`${base} ${size === 'lg' ? 'btn-lg' : ''} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- Champs
export function Field({
  label, hint, error, required, children, className = '',
}: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-brand">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return <input {...rest} className={`input ${className}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props
  return <select {...rest} className={`input ${className}`} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return <textarea {...rest} className={`input ${className}`} />
}

export function Checkbox({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink-2">
      <input
        type="checkbox"
        {...rest}
        className="h-4 w-4 rounded border-line text-brand focus:ring-brand/40"
      />
      {label}
    </label>
  )
}

// ---------------------------------------------------------------- Modale
export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-stone-950/60 p-0 sm:items-center sm:p-4">
      <div
        ref={ref}
        className={`w-full ${width} max-h-[95vh] overflow-y-auto rounded-t-2xl bg-card shadow-xl sm:rounded-2xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-raised hover:text-ink-2" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-raised px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Messages
export function Alert({ kind = 'info', children }: { kind?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  // Les variantes sombres gardent >= 4,5:1 sur le fond de carte sombre.
  const style = {
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200',
  }[kind]
  const Icon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }[kind]
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${style}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Badge({ color = 'slate', children }: { color?: string; children: ReactNode }) {
  const map: Record<string, string> = {
    slate: 'bg-raised text-ink-2',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    wine: 'bg-brand-soft text-brand-soft-ink',
  }
  return <span className={`badge ${map[color] ?? map.slate}`}>{children}</span>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-ink-3">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label ?? 'Chargement...'}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <p className="font-semibold text-ink-2">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-3">{description}</p>}
      {action}
    </div>
  )
}

// ---------------------------------------------------------------- Tableau
export function Table({ head, children, className = '' }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-raised">
          <tr>
            {head.map((h, i) => (
              <Fragment key={i}>{typeof h === 'string' ? <th className="th">{h}</th> : h}</Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-card">{children}</tbody>
      </table>
    </div>
  )
}

/** Tuile de statistique du tableau de bord. */
export function StatCard({
  label, value, sub, icon: Icon, tone = 'wine',
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'wine' | 'green' | 'blue' | 'amber' | 'slate'
}) {
  const tones: Record<string, string> = {
    wine: 'bg-brand-soft text-brand-soft-ink',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    blue: 'bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
    slate: 'bg-raised text-ink-2',
  }
  return (
    <div className="card flex items-center gap-3 p-4">
      {Icon && (
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
        <p className="tabular truncate text-xl font-bold text-ink">{value}</p>
        {sub && <p className="truncate text-xs text-ink-3">{sub}</p>}
      </div>
    </div>
  )
}

/** En-tete de page avec titre et actions. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Boite de dialogue de confirmation avec motif obligatoire facultatif. */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmer', onConfirm, onCancel, danger, loading, children,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink-2">
        <div>{message}</div>
        {children}
      </div>
    </Modal>
  )
}
