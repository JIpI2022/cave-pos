/**
 * Historique des ventes : consultation, reimpression du ticket,
 * annulation complete et retour d'article (reserves au gerant, toujours traces).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban, Download, FileSpreadsheet, Printer, RefreshCw, RotateCcw, Search,
} from 'lucide-react'
import {
  Alert, Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select,
  Spinner, Table, Textarea,
} from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import {
  addDays, formatDateTime, formatMoney, formatQty, searchKey, startOfDay, toIsoDate,
  PAYMENT_LABELS,
} from '@/lib/format'
import { downloadCsv, downloadXlsx, stampedFilename, ticketFilename, type ExportColumn } from '@/lib/exports'
import { downloadTicketPdf, printTicketPdf, type TicketData } from '@/lib/pdf'
import type { Payment, Sale, SaleItem, SaleReturn } from '@/types/database'

interface SaleRow extends Sale {
  payments: Payment[]
}

export default function Sales() {
  const { isManager, profile } = useAuth()
  const { currency, settings } = useSettings()
  const toast = useToast()

  const [rows, setRows] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(toIsoDate(startOfDay()))
  const [to, setTo] = useState(toIsoDate(new Date()))
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<SaleRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('sales')
      .select('*, payments(*)')
      .gte('created_at', `${from}T00:00:00`)
      .lt('created_at', `${toIsoDate(addDays(new Date(`${to}T12:00:00`), 1))}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (status) query = query.eq('status', status)

    const { data, error: dbErr } = await query
    if (dbErr) setError(describeError(dbErr))
    else { setError(null); setRows((data ?? []) as SaleRow[]) }
    setLoading(false)
  }, [from, to, status])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const key = searchKey(search)
    if (!key) return rows
    return rows.filter((s) => searchKey(s.ticket_ref).includes(key) || String(s.ticket_number).includes(key))
  }, [rows, search])

  const totals = useMemo(() => {
    const valid = filtered.filter((s) => s.status === 'validee')
    return {
      nb: valid.length,
      ttc: valid.reduce((s, x) => s + Number(x.total_ttc), 0),
      annulees: filtered.length - valid.length,
    }
  }, [filtered])

  const exportColumns: ExportColumn<SaleRow>[] = [
    { header: 'Ticket', value: (s) => s.ticket_ref },
    { header: 'Date', value: (s) => formatDateTime(s.created_at) },
    { header: 'Statut', value: (s) => (s.status === 'validee' ? 'validee' : 'annulee') },
    { header: 'Total HT', value: (s) => s.total_ht },
    { header: 'TVA', value: (s) => s.total_vat },
    { header: 'Total TTC', value: (s) => s.total_ttc },
    { header: 'Remises', value: (s) => s.discount_total },
    { header: 'Moyens de paiement', value: (s) =>
        s.payments.map((p) => `${PAYMENT_LABELS[p.method]} ${p.amount}`).join(' + ') },
    { header: 'Motif annulation', value: (s) => s.cancel_reason ?? '' },
  ]

  return (
    <div>
      <PageHeader
        title="Ventes"
        subtitle={`${totals.nb} ticket(s) valide(s) · ${formatMoney(totals.ttc, currency)}${
          totals.annulees ? ` · ${totals.annulees} annulee(s)` : ''}`}
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void load()}>Actualiser</Button>
            <Button variant="secondary" icon={Download}
              onClick={() => downloadCsv(filtered, exportColumns, stampedFilename('ventes', 'csv'))}>CSV</Button>
            <Button variant="secondary" icon={FileSpreadsheet}
              onClick={() => downloadXlsx(filtered, exportColumns, stampedFilename('ventes', 'xlsx'), 'Ventes')}>Excel</Button>
          </>
        }
      />

      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      <div className="card mb-3 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Du"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Au"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Statut">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Toutes</option>
            <option value="validee">Validees</option>
            <option value="annulee">Annulees</option>
          </Select>
        </Field>
        <Field label="N° de ticket">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="T000042" />
        </Field>
      </div>

      <div className="card">
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title="Aucune vente sur la periode" description="Changez les dates pour elargir la recherche." />
        ) : (
          <Table head={['Ticket', 'Date', 'Total TTC', 'Paiement', 'Statut', '']}>
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="td font-mono font-semibold">{s.ticket_ref}</td>
                <td className="td whitespace-nowrap text-xs text-slate-600">{formatDateTime(s.created_at)}</td>
                <td className="td tabular font-semibold">{formatMoney(s.total_ttc, currency)}</td>
                <td className="td text-xs text-slate-600">
                  {s.payments.map((p) => PAYMENT_LABELS[p.method]).join(' + ') || '—'}
                </td>
                <td className="td">
                  {s.status === 'validee'
                    ? <Badge color="green">validee</Badge>
                    : <Badge color="red">annulee</Badge>}
                </td>
                <td className="td">
                  <Button variant="ghost" icon={Search} onClick={() => setDetail(s)}>
                    <span className="hidden sm:inline">Detail</span>
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <SaleDetail
        sale={detail}
        canManage={isManager}
        cashierName={profile?.full_name || profile?.email}
        onClose={() => setDetail(null)}
        onChanged={() => { void load(); setDetail(null) }}
        onToast={toast}
        settings={settings}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail d'un ticket
// ---------------------------------------------------------------------------
function SaleDetail({
  sale, canManage, cashierName, onClose, onChanged, onToast, settings,
}: {
  sale: SaleRow | null
  canManage: boolean
  cashierName?: string
  onClose: () => void
  onChanged: () => void
  onToast: { success: (m: string) => void; error: (m: string) => void }
  settings: Parameters<typeof downloadTicketPdf>[1]
}) {
  const { currency } = useSettings()
  const [items, setItems] = useState<SaleItem[]>([])
  const [returns, setReturns] = useState<SaleReturn[]>([])
  const [loading, setLoading] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [returnItem, setReturnItem] = useState<SaleItem | null>(null)
  const [returnQty, setReturnQty] = useState('1')
  const [returnReason, setReturnReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sale) return
    setLoading(true)
    setError(null)
    void Promise.all([
      supabase.from('sale_items').select('*').eq('sale_id', sale.id).order('position'),
      supabase.from('sale_returns').select('*').eq('sale_id', sale.id).order('created_at'),
    ]).then(([it, rt]) => {
      setItems((it.data ?? []) as SaleItem[])
      setReturns((rt.data ?? []) as SaleReturn[])
      setLoading(false)
    })
  }, [sale])

  const ticketData = useMemo<TicketData | null>(() => {
    if (!sale) return null
    const buckets = new Map<number, { rate: number; base: number; vat: number; ttc: number }>()
    for (const it of items) {
      const b = buckets.get(Number(it.vat_rate)) ?? { rate: Number(it.vat_rate), base: 0, vat: 0, ttc: 0 }
      b.base += Number(it.line_ht); b.vat += Number(it.line_vat); b.ttc += Number(it.line_ttc)
      buckets.set(Number(it.vat_rate), b)
    }
    return {
      sale: {
        ticket_ref: sale.ticket_ref,
        created_at: sale.created_at,
        total_ht: Number(sale.total_ht),
        total_vat: Number(sale.total_vat),
        total_ttc: Number(sale.total_ttc),
        discount_total: Number(sale.discount_total),
        status: sale.status,
      },
      items,
      payments: sale.payments,
      vatBreakdown: [...buckets.values()],
      cashierName,
    }
  }, [sale, items, cashierName])

  async function cancel() {
    if (!sale) return
    setBusy(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('cancel_sale', {
        p_sale_id: sale.id, p_reason: cancelReason.trim(),
      })
      if (rpcErr) throw rpcErr
      onToast.success('Vente annulee et stock remis a jour.')
      setCancelOpen(false)
      onChanged()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function doReturn() {
    if (!returnItem) return
    setBusy(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('return_sale_item', {
        p_sale_item_id: returnItem.id,
        p_quantity: Number(returnQty.replace(',', '.')),
        p_reason: returnReason.trim(),
      })
      if (rpcErr) throw rpcErr
      onToast.success('Retour enregistre et stock remis a jour.')
      setReturnItem(null)
      onChanged()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!sale) return null

  const returnedByItem = new Map<string, number>()
  for (const r of returns) {
    if (r.sale_item_id) {
      returnedByItem.set(r.sale_item_id, (returnedByItem.get(r.sale_item_id) ?? 0) + Number(r.quantity))
    }
  }

  return (
    <>
      <Modal
        open={Boolean(sale)}
        onClose={onClose}
        size="lg"
        title={`Ticket ${sale.ticket_ref}`}
        footer={
          <>
            {canManage && sale.status === 'validee' && (
              <Button variant="danger" icon={Ban} onClick={() => setCancelOpen(true)} className="mr-auto">
                Annuler la vente
              </Button>
            )}
            <Button
              variant="secondary" icon={Download}
              disabled={!ticketData}
              onClick={() => ticketData && downloadTicketPdf(ticketData, settings, ticketFilename(sale.ticket_ref, sale.created_at))}
            >
              PDF
            </Button>
            <Button
              variant="secondary" icon={Printer} disabled={!ticketData}
              onClick={() => ticketData && printTicketPdf(ticketData, settings)}
            >
              Reimprimer
            </Button>
            <Button onClick={onClose}>Fermer</Button>
          </>
        }
      >
        {loading ? <Spinner /> : (
          <div className="space-y-4">
            {error && <Alert kind="error">{error}</Alert>}

            {sale.status === 'annulee' && (
              <Alert kind="error">
                Vente annulee le {formatDateTime(sale.cancelled_at)} — motif : {sale.cancel_reason}
              </Alert>
            )}

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-slate-500">Date :</span> {formatDateTime(sale.created_at)}</p>
              <p><span className="text-slate-500">Total :</span> <b>{formatMoney(sale.total_ttc, currency)}</b></p>
              <p><span className="text-slate-500">HT :</span> {formatMoney(sale.total_ht, currency)}</p>
              <p><span className="text-slate-500">TVA :</span> {formatMoney(sale.total_vat, currency)}</p>
              {Number(sale.discount_total) > 0 && (
                <p><span className="text-slate-500">Remises :</span> {formatMoney(sale.discount_total, currency)}</p>
              )}
              {sale.note && <p className="sm:col-span-2"><span className="text-slate-500">Note :</span> {sale.note}</p>}
            </div>

            <Table head={['Article', 'Qte', 'PU TTC', 'Remise', 'Total', '']}>
              {items.map((it) => {
                const already = returnedByItem.get(it.id) ?? 0
                const left = Number(it.quantity) - already
                return (
                  <tr key={it.id}>
                    <td className="td">
                      <p className="font-medium">{it.label}</p>
                      {it.pack_size > 1 && <p className="text-xs text-slate-500">carton de {it.pack_size}</p>}
                      {already > 0 && <p className="text-xs text-amber-700">{formatQty(already)} retournee(s)</p>}
                    </td>
                    <td className="td tabular">{formatQty(it.quantity)}</td>
                    <td className="td tabular">{formatMoney(it.unit_price_ttc, currency)}</td>
                    <td className="td tabular text-slate-500">
                      {Number(it.line_discount) > 0 ? `- ${formatMoney(it.line_discount, currency)}` : '—'}
                    </td>
                    <td className="td tabular font-semibold">{formatMoney(it.line_ttc, currency)}</td>
                    <td className="td">
                      {canManage && sale.status === 'validee' && left > 0 && (
                        <Button
                          variant="ghost" icon={RotateCcw}
                          onClick={() => {
                            setReturnItem(it); setReturnQty(String(Math.min(1, left))); setReturnReason('')
                          }}
                        >
                          <span className="hidden sm:inline">Retour</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>

            <div>
              <p className="label">Paiements</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {sale.payments.map((p) => (
                  <li key={p.id} className="flex justify-between px-3 py-2 text-sm">
                    <span>
                      {PAYMENT_LABELS[p.method]}
                      {p.tendered ? ` · remis ${formatMoney(p.tendered, currency)}` : ''}
                      {p.change_given ? ` · rendu ${formatMoney(p.change_given, currency)}` : ''}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                    <b className="tabular">{formatMoney(p.amount, currency)}</b>
                  </li>
                ))}
              </ul>
            </div>

            {returns.length > 0 && (
              <div>
                <p className="label">Retours enregistres</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {returns.map((r) => (
                    <li key={r.id} className="flex justify-between px-3 py-2 text-sm">
                      <span>{formatDateTime(r.created_at)} · {formatQty(r.quantity)} · {r.reason}</span>
                      <b className="tabular">{formatMoney(r.amount_ttc, currency)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ---- Annulation ---- */}
      <Modal
        open={cancelOpen} onClose={() => setCancelOpen(false)} size="sm" title="Annuler la vente"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Retour</Button>
            <Button
              variant="danger" loading={busy} disabled={!cancelReason.trim()}
              onClick={() => void cancel()}
            >
              Confirmer l annulation
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <Alert kind="warning">
            L annulation remet tous les articles en stock et inscrit l operation
            au journal d audit. Elle est definitive.
          </Alert>
          <Field label="Motif de l annulation" required>
            <Textarea
              rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Erreur de saisie, client parti sans payer, double encaissement..."
            />
          </Field>
        </div>
      </Modal>

      {/* ---- Retour d'article ---- */}
      <Modal
        open={Boolean(returnItem)} onClose={() => setReturnItem(null)} size="sm"
        title={returnItem ? `Retour — ${returnItem.label}` : 'Retour'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnItem(null)}>Retour</Button>
            <Button
              loading={busy} disabled={!returnReason.trim()}
              onClick={() => void doReturn()}
            >
              Enregistrer le retour
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Quantite retournee" required>
            <Input value={returnQty} onChange={(e) => setReturnQty(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Motif" required>
            <Textarea
              rows={2} value={returnReason} onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Bouteille bouchonnee, erreur de reference..."
            />
          </Field>
          <Alert kind="info">
            Le montant rembourse est calcule au prorata de la ligne (remises incluses)
            et vient en deduction des especes theoriques de la session de caisse.
          </Alert>
        </div>
      </Modal>
    </>
  )
}
