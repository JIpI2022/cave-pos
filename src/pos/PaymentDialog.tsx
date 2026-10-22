/**
 * Encaissement : especes (avec calcul du rendu monnaie), carte,
 * mobile money, ou paiement mixte (plusieurs moyens sur un meme ticket).
 */

import { useEffect, useMemo, useState } from 'react'
import { Banknote, Check, CreditCard, Delete, Smartphone, Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input, Modal } from '@/components/ui'
import { computeChange, isFullyPaid, remainingToPay, roundTo } from '@/lib/calc'
import { formatMoney, PAYMENT_LABELS, type CurrencyConfig } from '@/lib/format'
import type { PaymentMethod, SalePayloadPayment } from '@/types/database'

const METHODS: { value: PaymentMethod; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'especes', icon: Banknote },
  { value: 'carte', icon: CreditCard },
  { value: 'mobile_money', icon: Smartphone },
]

/** Montant pret a etre saisi : « 58,50 » plutot que « 58.5 ». */
function formatInput(value: number, decimals: number): string {
  return roundTo(value, decimals).toFixed(decimals).replace('.', ',')
}

/** Coupures proposees pour accelerer la saisie du montant remis. */
function quickCashAmounts(due: number, decimals: number): number[] {
  const steps = decimals === 0 ? [500, 1000, 2000, 5000, 10000] : [5, 10, 20, 50, 100]
  const list = new Set<number>()
  list.add(roundTo(due, decimals))
  for (const s of steps) {
    const up = Math.ceil(due / s) * s
    if (up >= due) list.add(up)
  }
  return [...list].sort((a, b) => a - b).slice(0, 6)
}

export default function PaymentDialog({
  open, totalDue, currency, busy, onClose, onConfirm,
}: {
  open: boolean
  totalDue: number
  currency: CurrencyConfig
  busy?: boolean
  onClose: () => void
  onConfirm: (payments: SalePayloadPayment[]) => void
}) {
  const [payments, setPayments] = useState<SalePayloadPayment[]>([])
  const [method, setMethod] = useState<PaymentMethod>('especes')
  const [amountText, setAmountText] = useState('')
  const [tenderedText, setTenderedText] = useState('')
  const [reference, setReference] = useState('')

  const remaining = useMemo(
    () => remainingToPay(totalDue, payments.map((p) => ({ method: p.method, amount: p.amount })), currency.decimals),
    [totalDue, payments, currency.decimals],
  )

  useEffect(() => {
    if (!open) return
    setPayments([])
    setMethod('especes')
    setReference('')
    setTenderedText('')
    setAmountText(formatInput(totalDue, currency.decimals))
  }, [open, totalDue, currency.decimals])

  // Le montant propose suit toujours le reste a payer.
  useEffect(() => {
    setAmountText(remaining > 0 ? formatInput(remaining, currency.decimals) : '0')
    setTenderedText('')
  }, [remaining, currency.decimals])

  const amount = Number(amountText.replace(',', '.')) || 0
  const tendered = Number(tenderedText.replace(',', '.')) || 0
  const change = method === 'especes' && tendered > 0 ? computeChange(amount, tendered, currency.decimals) : 0
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  const fullyPaid = isFullyPaid(totalDue, payments.map((p) => ({ method: p.method, amount: p.amount })), currency.decimals)

  function keypad(key: string) {
    const target = method === 'especes' && tenderedText !== '' ? 'tendered' : 'amount'
    const current = target === 'tendered' ? tenderedText : amountText
    let next = current
    if (key === 'C') next = ''
    else if (key === '<') next = current.slice(0, -1)
    else if (key === ',') next = current.includes(',') || current.includes('.') ? current : `${current || '0'},`
    else next = current === '0' ? key : current + key
    if (target === 'tendered') setTenderedText(next); else setAmountText(next)
  }

  function addPayment() {
    if (amount <= 0) return
    const capped = Math.min(amount, remaining > 0 ? remaining : amount)
    setPayments((list) => [...list, {
      method,
      amount: roundTo(capped, currency.decimals),
      tendered: method === 'especes' && tendered > 0 ? roundTo(tendered, currency.decimals) : null,
      change_given: method === 'especes' && tendered > 0
        ? computeChange(capped, tendered, currency.decimals) : 0,
      reference: reference.trim(),
    }])
    setReference('')
    setTenderedText('')
  }

  /** Raccourci : un seul moyen de paiement couvre tout le ticket. */
  function payAll() {
    const single: SalePayloadPayment = {
      method,
      amount: roundTo(remaining, currency.decimals),
      tendered: method === 'especes' && tendered > 0 ? roundTo(tendered, currency.decimals) : null,
      change_given: method === 'especes' && tendered > 0
        ? computeChange(remaining, tendered, currency.decimals) : 0,
      reference: reference.trim(),
    }
    onConfirm([...payments, single])
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Encaissement"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Annuler</Button>
          {remaining > 0 && payments.length > 0 && (
            <Button variant="secondary" onClick={addPayment} disabled={busy || amount <= 0}>
              Ajouter ce paiement
            </Button>
          )}
          {remaining > 0 && payments.length === 0 && (
            <Button variant="secondary" onClick={addPayment} disabled={busy || amount <= 0 || amount >= remaining}>
              Paiement partiel (mixte)
            </Button>
          )}
          <Button
            icon={Check} size="lg" loading={busy}
            disabled={!fullyPaid && amount <= 0}
            onClick={() => (fullyPaid ? onConfirm(payments) : payAll())}
          >
            Valider l encaissement
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Colonne gauche : montants ---- */}
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total a payer</p>
            <p className="tabular text-3xl font-bold">{formatMoney(totalDue, currency)}</p>
            {payments.length > 0 && (
              <p className="tabular mt-1 text-sm text-slate-300">
                Deja encaisse {formatMoney(paid, currency)} · reste{' '}
                <b className="text-white">{formatMoney(remaining, currency)}</b>
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => { setMethod(m.value); setTenderedText('') }}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-semibold transition ${
                  method === m.value
                    ? 'border-wine-700 bg-wine-50 text-wine-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <m.icon className="h-5 w-5" />
                {PAYMENT_LABELS[m.value]}
              </button>
            ))}
          </div>

          <Field label={`Montant impute (${currency.symbol})`}>
            <Input
              value={amountText} onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal" className="tabular text-right text-xl font-bold"
            />
          </Field>

          {method === 'especes' ? (
            <>
              <Field label={`Montant remis par le client (${currency.symbol})`}>
                <Input
                  value={tenderedText} onChange={(e) => setTenderedText(e.target.value)}
                  inputMode="decimal" placeholder="Facultatif"
                  className="tabular text-right text-xl font-bold"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {quickCashAmounts(amount || remaining, currency.decimals).map((v) => (
                  <button
                    key={v} onClick={() => setTenderedText(formatInput(v, currency.decimals))}
                    className="btn-secondary px-3 py-1.5 text-sm"
                  >
                    {formatMoney(v, currency)}
                  </button>
                ))}
              </div>
              {tendered > 0 && (
                <div className={`rounded-lg p-3 text-center ${
                  tendered + (currency.decimals === 0 ? 1 : 0.005) >= amount
                    ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide">Rendu monnaie</p>
                  <p className="tabular text-2xl font-bold">{formatMoney(change, currency)}</p>
                  {tendered < amount && <p className="text-xs">Montant remis insuffisant.</p>}
                </div>
              )}
            </>
          ) : (
            <Field
              label="Reference de transaction"
              hint={method === 'carte' ? 'N° de ticket du terminal (facultatif).' : 'N° de transaction mobile money (facultatif).'}
            >
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}
        </div>

        {/* ---- Colonne droite : pave numerique + paiements enregistres ---- */}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '<'].map((k) => (
              <button
                key={k} onClick={() => keypad(k)}
                className="rounded-lg border border-slate-200 bg-white py-4 text-xl font-semibold text-slate-800 active:bg-slate-100"
              >
                {k === '<' ? <Delete className="mx-auto h-5 w-5" /> : k}
              </button>
            ))}
            <button
              onClick={() => keypad('C')}
              className="col-span-3 rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-600"
            >
              Effacer
            </button>
          </div>

          {payments.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <p className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Paiements enregistres
              </p>
              <ul className="divide-y divide-slate-100">
                {payments.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {PAYMENT_LABELS[p.method]}
                      {p.change_given ? ` · rendu ${formatMoney(p.change_given, currency)}` : ''}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <b className="tabular">{formatMoney(p.amount, currency)}</b>
                      <button
                        onClick={() => setPayments((l) => l.filter((_, j) => j !== i))}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Retirer ce paiement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fullyPaid && (
            <Alert kind="success">
              Ticket solde. Validez pour enregistrer la vente et imprimer le ticket.
            </Alert>
          )}
        </div>
      </div>
    </Modal>
  )
}
