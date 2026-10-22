/**
 * Ouverture et cloture de caisse.
 *
 * La cloture produit le RAPPORT Z : especes theoriques (fond de caisse +
 * encaissements en especes - remboursements), especes comptees, ecart,
 * repartition par moyen de paiement. Tout est calcule par la base
 * (fonctions cash_session_expected / close_cash_session).
 */

import { useEffect, useMemo, useState } from 'react'
import { Download, LockKeyhole, Unlock } from 'lucide-react'
import { Alert, Button, Field, Input, Modal, Table, Textarea } from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { cashGap, countCash, EUR_DENOMINATIONS, XOF_DENOMINATIONS, parseSafe } from './helpers'
import { formatDateTime, formatMoney, parseNumber } from '@/lib/format'
import { buildZReportPdf } from '@/lib/pdf'
import { stampedFilename } from '@/lib/exports'
import type { CashSession, CashSessionReport } from '@/types/database'

// ---------------------------------------------------------------- Ouverture
export function OpenCashDialog({
  open, locationId, onClose, onOpened,
}: {
  open: boolean
  locationId: string | null
  onClose: () => void
  onOpened: (session: CashSession) => void
}) {
  const { currency, locations } = useSettings()
  const toast = useToast()
  const [float, setFloat] = useState('0')
  const [notes, setNotes] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(locationId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFloat('0')
    setNotes('')
    setSelectedLocation(locationId ?? locations[0]?.id ?? '')
    setError(null)
  }, [open, locationId, locations])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('open_cash_session', {
        p_location_id: selectedLocation,
        p_opening_float: parseNumber(float) ?? 0,
        p_notes: notes.trim(),
      })
      if (rpcErr) throw rpcErr
      toast.success('Caisse ouverte.')
      onOpened(data as CashSession)
      onClose()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open} onClose={onClose} title="Ouvrir la caisse" size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button icon={Unlock} loading={busy} onClick={() => void submit()}>Ouvrir la caisse</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}

        <Field label="Point de vente" required>
          <select
            className="input" value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>

        <Field label={`Fond de caisse (${currency.symbol})`} hint="Especes presentes dans le tiroir avant la premiere vente.">
          <Input
            value={float} onChange={(e) => setFloat(e.target.value)}
            inputMode="decimal" className="tabular text-right text-xl font-bold"
          />
        </Field>

        <Field label="Observations">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Alert kind="info">
          Une seule caisse peut etre ouverte a la fois par point de vente.
        </Alert>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Cloture
export function CloseCashDialog({
  open, session, onClose, onClosed,
}: {
  open: boolean
  session: CashSession | null
  onClose: () => void
  onClosed: () => void
}) {
  const { currency, settings } = useSettings()
  const toast = useToast()
  const [report, setReport] = useState<CashSessionReport | null>(null)
  const [expected, setExpected] = useState<number | null>(null)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [manualTotal, setManualTotal] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState<CashSessionReport | null>(null)

  const denominations = currency.decimals === 0 ? XOF_DENOMINATIONS : EUR_DENOMINATIONS

  useEffect(() => {
    if (!open || !session) return
    setCounts({})
    setManualTotal('')
    setNotes('')
    setError(null)
    setClosed(null)

    void (async () => {
      const [rep, exp] = await Promise.all([
        supabase.from('v_cash_session_report').select('*').eq('id', session.id).maybeSingle(),
        supabase.rpc('cash_session_expected', { p_session_id: session.id }),
      ])
      if (rep.data) setReport(rep.data as CashSessionReport)
      if (exp.data !== null && exp.data !== undefined) setExpected(Number(exp.data))
    })()
  }, [open, session])

  const countedFromGrid = useMemo(
    () => countCash(Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, parseSafe(v)]),
    ), currency.decimals),
    [counts, currency.decimals],
  )

  const counted = manualTotal.trim() !== '' ? (parseNumber(manualTotal) ?? 0) : countedFromGrid
  const gap = expected === null ? 0 : cashGap(counted, expected, currency.decimals)

  async function submit() {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('close_cash_session', {
        p_session_id: session.id,
        p_counted_cash: counted,
        p_notes: notes.trim(),
      })
      if (rpcErr) throw rpcErr

      const { data } = await supabase
        .from('v_cash_session_report').select('*').eq('id', session.id).maybeSingle()
      setClosed((data ?? null) as CashSessionReport | null)
      toast.success('Caisse cloturee.')
      onClosed()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  function downloadZ() {
    const r = closed ?? report
    if (!r || !session) return
    const rows = [
      { label: 'Point de vente', value: r.location_name },
      { label: 'Ouverte le', value: formatDateTime(r.opened_at) },
      { label: 'Cloturee le', value: formatDateTime(r.closed_at ?? new Date().toISOString()) },
      { label: 'Ouverte par', value: r.opened_by_email ?? '—' },
      { label: 'Nombre de tickets', value: String(r.nb_tickets) },
      { label: 'Chiffre d affaires TTC', value: formatMoney(r.ca_ttc, currency), strong: true },
      { label: 'dont HT', value: formatMoney(r.ca_ht, currency) },
      { label: 'dont TVA', value: formatMoney(r.total_tva, currency) },
      { label: 'Remises accordees', value: formatMoney(r.total_remises, currency) },
      { label: 'Especes', value: formatMoney(r.total_especes, currency) },
      { label: 'Carte bancaire', value: formatMoney(r.total_carte, currency) },
      { label: 'Mobile money', value: formatMoney(r.total_mobile_money, currency) },
      { label: 'Retours / remboursements', value: formatMoney(r.total_retours, currency) },
      { label: 'Ventes annulees', value: String(r.nb_annulations) },
      { label: 'Fond de caisse', value: formatMoney(r.opening_float, currency) },
      { label: 'Especes theoriques', value: formatMoney(r.expected_cash ?? expected ?? 0, currency), strong: true },
      { label: 'Especes comptees', value: formatMoney(r.counted_cash ?? counted, currency), strong: true },
      { label: 'Ecart de caisse', value: formatMoney(r.cash_gap ?? gap, currency), strong: true },
    ]
    buildZReportPdf({
      title: `Rapport Z — ${settings?.company_name ?? ''}`,
      subtitle: `Session du ${formatDateTime(r.opened_at)}`,
      rows,
      footer: r.notes || undefined,
    }).save(stampedFilename('rapport_z', 'pdf'))
  }

  const current = closed ?? report

  return (
    <Modal
      open={open} onClose={onClose} size="lg"
      title={closed ? 'Caisse cloturee — rapport Z' : 'Cloture de caisse (rapport Z)'}
      footer={
        closed ? (
          <>
            <Button variant="secondary" icon={Download} onClick={downloadZ}>Telecharger le rapport Z</Button>
            <Button onClick={onClose}>Fermer</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button icon={LockKeyhole} loading={busy} onClick={() => void submit()}>
              Cloturer la caisse
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}

        {current && (
          <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <Line label="Tickets" value={String(current.nb_tickets)} />
            <Line label="CA TTC" value={formatMoney(current.ca_ttc, currency)} strong />
            <Line label="Especes encaissees" value={formatMoney(current.total_especes, currency)} />
            <Line label="Carte bancaire" value={formatMoney(current.total_carte, currency)} />
            <Line label="Mobile money" value={formatMoney(current.total_mobile_money, currency)} />
            <Line label="Retours / remboursements" value={formatMoney(current.total_retours, currency)} />
            <Line label="Fond de caisse" value={formatMoney(current.opening_float, currency)} />
            <Line label="Ventes annulees" value={String(current.nb_annulations)} />
          </div>
        )}

        {!closed && (
          <>
            <div>
              <p className="label">Comptage des especes</p>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                <Table head={['Coupure', 'Nombre', 'Total']}>
                  {denominations.map((d) => {
                    const qty = parseSafe(counts[String(d)] ?? '')
                    return (
                      <tr key={d}>
                        <td className="td tabular font-medium">{formatMoney(d, currency)}</td>
                        <td className="td">
                          <Input
                            value={counts[String(d)] ?? ''} inputMode="numeric"
                            onChange={(e) => setCounts((c) => ({ ...c, [String(d)]: e.target.value }))}
                            className="w-24 text-right"
                          />
                        </td>
                        <td className="td tabular text-slate-600">
                          {qty > 0 ? formatMoney(d * qty, currency) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </Table>
              </div>
            </div>

            <Field
              label={`Total compte (${currency.symbol})`}
              hint="Laissez vide pour utiliser le total du comptage ci-dessus."
            >
              <Input
                value={manualTotal} onChange={(e) => setManualTotal(e.target.value)}
                inputMode="decimal" placeholder={String(countedFromGrid)}
                className="tabular text-right text-xl font-bold"
              />
            </Field>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-100 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Theorique</p>
                <p className="tabular text-lg font-bold">{formatMoney(expected ?? 0, currency)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Compte</p>
                <p className="tabular text-lg font-bold">{formatMoney(counted, currency)}</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${
                gap === 0 ? 'bg-emerald-50 text-emerald-800'
                : gap > 0 ? 'bg-sky-50 text-sky-800' : 'bg-red-50 text-red-800'}`}>
                <p className="text-xs uppercase tracking-wide">Ecart</p>
                <p className="tabular text-lg font-bold">{formatMoney(gap, currency)}</p>
              </div>
            </div>

            <Field label="Observations (justification de l ecart)">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </>
        )}

        {closed && (
          <div className="grid gap-2 rounded-lg bg-slate-900 p-4 text-white sm:grid-cols-3">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-slate-400">Theorique</p>
              <p className="tabular text-xl font-bold">{formatMoney(closed.expected_cash ?? 0, currency)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-slate-400">Compte</p>
              <p className="tabular text-xl font-bold">{formatMoney(closed.counted_cash ?? 0, currency)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-slate-400">Ecart</p>
              <p className={`tabular text-xl font-bold ${
                (closed.cash_gap ?? 0) === 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
                {formatMoney(closed.cash_gap ?? 0, currency)}
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular ${strong ? 'text-base font-bold text-slate-900' : 'font-medium'}`}>{value}</span>
    </div>
  )
}
