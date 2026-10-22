/**
 * Rapports et exports.
 *
 * Toutes les donnees viennent des vues de reporting PostgreSQL.
 * Chaque tableau est exportable en CSV et en Excel (.xlsx).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import {
  Alert, Button, EmptyState, Field, Input, PageHeader, Spinner, StatCard, Table,
} from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import {
  addDays, formatDate, formatDateTime, formatMoney, formatPercent, formatQty, startOfMonth,
  toIsoDate, MOVEMENT_LABELS, PAYMENT_LABELS,
} from '@/lib/format'
import { axisTick, compactAmount, GRID, SERIES_MAIN, SERIES_SECOND } from '@/lib/chart'
import { downloadCsv, downloadXlsx, stampedFilename, type ExportColumn } from '@/lib/exports'
import type {
  MovementFull, PaymentBreakdown, SaleItemFull, SalesDaily, StockByLocation, TopProduct,
} from '@/types/database'

type Tab = 'ca' | 'produits' | 'paiements' | 'exports'

export default function Reports() {
  const { currency } = useSettings()
  const [tab, setTab] = useState<Tab>('ca')
  const [from, setFrom] = useState(toIsoDate(startOfMonth()))
  const [to, setTo] = useState(toIsoDate(new Date()))

  const [daily, setDaily] = useState<SalesDaily[]>([])
  const [top, setTop] = useState<TopProduct[]>([])
  const [payments, setPayments] = useState<PaymentBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [d, t, p] = await Promise.all([
      supabase.from('v_sales_daily').select('*').gte('sale_date', from).lte('sale_date', to).order('sale_date'),
      supabase.from('v_top_products').select('*').order('ca_ttc', { ascending: false }).limit(50),
      supabase.from('v_payments_breakdown').select('*').gte('sale_date', from).lte('sale_date', to),
    ])
    const err = d.error ?? t.error ?? p.error
    setError(err ? describeError(err) : null)
    setDaily((d.data ?? []) as SalesDaily[])
    setTop((t.data ?? []) as TopProduct[])
    setPayments((p.data ?? []) as PaymentBreakdown[])
    setLoading(false)
  }, [from, to])

  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => {
    const sum = (f: keyof SalesDaily) => daily.reduce((s, r) => s + Number(r[f] ?? 0), 0)
    const ca = sum('ca_ttc')
    const tickets = sum('nb_tickets')
    const ht = sum('ca_ht')
    const marge = sum('marge_ht')
    return {
      ca, tickets, ht, marge,
      tva: sum('total_tva'),
      remises: sum('total_remises'),
      panier: tickets > 0 ? ca / tickets : 0,
      tauxMarge: ht > 0 ? (marge / ht) * 100 : 0,
    }
  }, [daily])

  const chartData = useMemo(
    () => daily.map((r) => ({
      label: formatDate(r.sale_date).slice(0, 5),
      ca: Number(r.ca_ttc),
      marge: Number(r.marge_ht),
    })),
    [daily],
  )

  const paymentTotals = useMemo(() => {
    const map = new Map<string, { total: number; nb: number }>()
    for (const p of payments) {
      const cur = map.get(p.method) ?? { total: 0, nb: 0 }
      cur.total += Number(p.total); cur.nb += Number(p.nb_paiements)
      map.set(p.method, cur)
    }
    const grand = [...map.values()].reduce((s, v) => s + v.total, 0)
    return (['especes', 'carte', 'mobile_money'] as const).map((m) => ({
      method: m,
      label: PAYMENT_LABELS[m],
      total: map.get(m)?.total ?? 0,
      nb: map.get(m)?.nb ?? 0,
      part: grand > 0 ? ((map.get(m)?.total ?? 0) / grand) * 100 : 0,
    }))
  }, [payments])

  const dailyColumns: ExportColumn<SalesDaily>[] = [
    { header: 'Date', value: (r) => formatDate(r.sale_date) },
    { header: 'Tickets', value: (r) => r.nb_tickets },
    { header: 'CA TTC', value: (r) => r.ca_ttc },
    { header: 'CA HT', value: (r) => r.ca_ht },
    { header: 'TVA', value: (r) => r.total_tva },
    { header: 'Remises', value: (r) => r.total_remises },
    { header: 'Panier moyen', value: (r) => r.panier_moyen },
    { header: 'Marge brute HT', value: (r) => r.marge_ht },
  ]

  const topColumns: ExportColumn<TopProduct>[] = [
    { header: 'Produit', value: (r) => r.product_name },
    { header: 'Categorie', value: (r) => r.category_label ?? '' },
    { header: 'Quantite vendue', value: (r) => r.qty_sold },
    { header: 'CA TTC', value: (r) => r.ca_ttc },
    { header: 'CA HT', value: (r) => r.ca_ht },
    { header: 'Marge HT', value: (r) => r.marge_ht },
    { header: 'Premiere vente', value: (r) => formatDate(r.first_sale) },
    { header: 'Derniere vente', value: (r) => formatDate(r.last_sale) },
  ]

  return (
    <div>
      <PageHeader
        title="Rapports"
        subtitle={`Du ${formatDate(from)} au ${formatDate(to)}`}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => void load()}>Actualiser</Button>}
      />

      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      {/* ---- Periode ---- */}
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3">
        <Field label="Du"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Au"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2 pb-0.5">
          <Button variant="secondary" onClick={() => {
            setFrom(toIsoDate(new Date())); setTo(toIsoDate(new Date()))
          }}>Aujourd hui</Button>
          <Button variant="secondary" onClick={() => {
            setFrom(toIsoDate(addDays(new Date(), -6))); setTo(toIsoDate(new Date()))
          }}>7 jours</Button>
          <Button variant="secondary" onClick={() => {
            setFrom(toIsoDate(startOfMonth())); setTo(toIsoDate(new Date()))
          }}>Mois en cours</Button>
          <Button variant="secondary" onClick={() => {
            setFrom(toIsoDate(addDays(new Date(), -364))); setTo(toIsoDate(new Date()))
          }}>12 mois</Button>
        </div>
      </div>

      {/* ---- Onglets ---- */}
      <div className="mb-3 flex flex-wrap gap-2">
        {([
          ['ca', 'Chiffre d affaires'],
          ['produits', 'Produits'],
          ['paiements', 'Moyens de paiement'],
          ['exports', 'Exports'],
        ] as const).map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === key ? 'bg-wine-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'ca' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="CA TTC" value={formatMoney(totals.ca, currency)} sub={`${formatQty(totals.tickets)} ticket(s)`} />
                <StatCard label="CA HT" value={formatMoney(totals.ht, currency)} sub={`TVA ${formatMoney(totals.tva, currency)}`} />
                <StatCard label="Marge brute HT" value={formatMoney(totals.marge, currency)} sub={`${formatPercent(totals.tauxMarge, 1)} du CA HT`} />
                <StatCard label="Panier moyen" value={formatMoney(totals.panier, currency)} sub={`remises ${formatMoney(totals.remises, currency)}`} />
              </div>

              <div className="card p-4">
                <h2 className="mb-1 font-semibold text-slate-900">Chiffre d affaires et marge</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Deux series a la meme echelle monetaire : CA TTC (barres) et marge brute HT (ligne).
                </p>
                {chartData.length === 0 ? (
                  <EmptyState title="Aucune vente sur la periode" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={axisTick} axisLine={false} tickLine={false} width={60}
                        tickFormatter={(v: number) => compactAmount(v, currency.symbol)}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold text-slate-900">{label}</p>
                              {payload.map((s) => (
                                <p key={String(s.name)} className="text-slate-600">
                                  {s.name} : <b>{formatMoney(Number(s.value), currency)}</b>
                                </p>
                              ))}
                            </div>
                          ) : null
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="ca" name="CA TTC" fill={SERIES_MAIN} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Line
                        type="monotone" dataKey="marge" name="Marge brute HT"
                        stroke={SERIES_SECOND} strokeWidth={2}
                        dot={{ r: 4, fill: SERIES_SECOND, stroke: '#ffffff', strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <h2 className="font-semibold text-slate-900">Detail par jour</h2>
                  <div className="flex gap-2">
                    <Button variant="secondary" icon={Download}
                      onClick={() => downloadCsv(daily, dailyColumns, stampedFilename('ca_par_jour', 'csv'))}>CSV</Button>
                    <Button variant="secondary" icon={FileSpreadsheet}
                      onClick={() => downloadXlsx(daily, dailyColumns, stampedFilename('ca_par_jour', 'xlsx'), 'CA')}>Excel</Button>
                  </div>
                </div>
                {daily.length === 0 ? <EmptyState title="Aucune donnee" /> : (
                  <Table head={['Date', 'Tickets', 'CA TTC', 'CA HT', 'TVA', 'Remises', 'Panier moyen', 'Marge HT']}>
                    {daily.map((r) => (
                      <tr key={r.sale_date}>
                        <td className="td">{formatDate(r.sale_date)}</td>
                        <td className="td tabular">{r.nb_tickets}</td>
                        <td className="td tabular font-semibold">{formatMoney(r.ca_ttc, currency)}</td>
                        <td className="td tabular">{formatMoney(r.ca_ht, currency)}</td>
                        <td className="td tabular text-slate-500">{formatMoney(r.total_tva, currency)}</td>
                        <td className="td tabular text-slate-500">{formatMoney(r.total_remises, currency)}</td>
                        <td className="td tabular">{formatMoney(r.panier_moyen, currency)}</td>
                        <td className="td tabular text-emerald-700">{formatMoney(r.marge_ht, currency)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </div>
            </div>
          )}

          {tab === 'produits' && (
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Ventes par produit</h2>
                  <p className="text-xs text-slate-500">Depuis l origine, 50 premiers par chiffre d affaires.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" icon={Download}
                    onClick={() => downloadCsv(top, topColumns, stampedFilename('ventes_par_produit', 'csv'))}>CSV</Button>
                  <Button variant="secondary" icon={FileSpreadsheet}
                    onClick={() => downloadXlsx(top, topColumns, stampedFilename('ventes_par_produit', 'xlsx'), 'Produits')}>Excel</Button>
                </div>
              </div>
              {top.length === 0 ? <EmptyState title="Aucune vente" /> : (
                <Table head={['Produit', 'Categorie', 'Quantite', 'CA TTC', 'CA HT', 'Marge HT', 'Taux de marge']}>
                  {top.map((r) => {
                    const taux = Number(r.ca_ht) > 0 ? (Number(r.marge_ht) / Number(r.ca_ht)) * 100 : 0
                    return (
                      <tr key={`${r.product_id}-${r.product_name}`}>
                        <td className="td font-medium">{r.product_name}</td>
                        <td className="td text-xs text-slate-600">{r.category_label ?? '—'}</td>
                        <td className="td tabular">{formatQty(r.qty_sold)}</td>
                        <td className="td tabular font-semibold">{formatMoney(r.ca_ttc, currency)}</td>
                        <td className="td tabular">{formatMoney(r.ca_ht, currency)}</td>
                        <td className="td tabular text-emerald-700">{formatMoney(r.marge_ht, currency)}</td>
                        <td className="td tabular">{formatPercent(taux, 1)}</td>
                      </tr>
                    )
                  })}
                </Table>
              )}
            </div>
          )}

          {tab === 'paiements' && (
            <div className="card">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="font-semibold text-slate-900">Encaissements par moyen de paiement</h2>
                <p className="text-xs text-slate-500">Ventes validees de la periode selectionnee.</p>
              </div>
              <Table head={['Moyen de paiement', 'Nombre', 'Total', 'Part']}>
                {paymentTotals.map((p) => (
                  <tr key={p.method}>
                    <td className="td font-medium">{p.label}</td>
                    <td className="td tabular">{p.nb}</td>
                    <td className="td tabular font-semibold">{formatMoney(p.total, currency)}</td>
                    <td className="td tabular">{formatPercent(p.part, 1)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}

          {tab === 'exports' && <ExportCenter from={from} to={to} />}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Centre d'exports (ventes detaillees, mouvements, etat du stock)
// ---------------------------------------------------------------------------
function ExportCenter({ from, to }: { from: string; to: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function run(key: string, task: () => Promise<number>) {
    setBusy(key)
    setMessage(null)
    try {
      const n = await task()
      setMessage(`${n} ligne(s) exportee(s).`)
    } catch (err) {
      setMessage(describeError(err))
    } finally {
      setBusy(null)
    }
  }

  const saleItemColumns: ExportColumn<SaleItemFull>[] = [
    { header: 'Ticket', value: (r) => r.ticket_ref },
    { header: 'Date', value: (r) => formatDateTime(r.created_at) },
    { header: 'Statut', value: (r) => r.status },
    { header: 'Article', value: (r) => r.label },
    { header: 'Categorie', value: (r) => r.category_label ?? '' },
    { header: 'Quantite vendue', value: (r) => r.quantity },
    { header: 'Bouteilles', value: (r) => r.qty_base },
    { header: 'PU TTC', value: (r) => r.unit_price_ttc },
    { header: 'TVA %', value: (r) => r.vat_rate },
    { header: 'Remise ligne', value: (r) => r.line_discount },
    { header: 'Total TTC', value: (r) => r.line_ttc },
    { header: 'Total HT', value: (r) => r.line_ht },
    { header: 'TVA', value: (r) => r.line_vat },
    { header: 'Cout unitaire HT', value: (r) => r.unit_cost_ht },
    { header: 'Marge HT', value: (r) => r.margin_ht },
    { header: 'Caissier', value: (r) => r.user_email ?? '' },
  ]

  const movementColumns: ExportColumn<MovementFull>[] = [
    { header: 'Date', value: (m) => formatDateTime(m.created_at) },
    { header: 'Type', value: (m) => MOVEMENT_LABELS[m.type] ?? m.type },
    { header: 'Produit', value: (m) => m.product_name },
    { header: 'Code', value: (m) => m.barcode || m.internal_code || '' },
    { header: 'Emplacement', value: (m) => m.location_name },
    { header: 'Quantite', value: (m) => m.quantity_delta },
    { header: 'Motif', value: (m) => m.reason },
    { header: 'Reference', value: (m) => m.reference },
    { header: 'Utilisateur', value: (m) => m.user_email ?? '' },
  ]

  const stockColumns: ExportColumn<StockByLocation>[] = [
    { header: 'Produit', value: (r) => r.product_name },
    { header: 'Code', value: (r) => r.barcode || r.internal_code || '' },
    { header: 'Categorie', value: (r) => r.category_label ?? '' },
    { header: 'Emplacement', value: (r) => r.location_name },
    { header: 'Quantite', value: (r) => r.quantity },
    { header: 'Prix achat HT', value: (r) => r.purchase_price_ht },
    { header: 'Valeur HT', value: (r) => r.value_ht },
    { header: 'Prix vente TTC', value: (r) => r.sale_price_ttc },
    { header: 'Seuil alerte', value: (r) => r.stock_alert_threshold },
  ]

  const upperBound = `${toIsoDate(addDays(new Date(`${to}T12:00:00`), 1))}T00:00:00`

  const exports = [
    {
      key: 'lignes',
      title: 'Ventes detaillees (ligne par ligne)',
      description: 'Une ligne par article vendu, avec la marge. Base de la comptabilite et de l analyse.',
      run: async (format: 'csv' | 'xlsx') => {
        const { data, error } = await supabase
          .from('v_sale_items_full').select('*')
          .gte('created_at', `${from}T00:00:00`).lt('created_at', upperBound)
          .order('created_at')
        if (error) throw error
        const rows = (data ?? []) as SaleItemFull[]
        const name = stampedFilename('ventes_detaillees', format)
        if (format === 'csv') downloadCsv(rows, saleItemColumns, name)
        else downloadXlsx(rows, saleItemColumns, name, 'Lignes de vente')
        return rows.length
      },
    },
    {
      key: 'mouvements',
      title: 'Mouvements de stock',
      description: 'Entrees, sorties, transferts, casses et ajustements de la periode.',
      run: async (format: 'csv' | 'xlsx') => {
        const { data, error } = await supabase
          .from('v_movements_full').select('*')
          .gte('created_at', `${from}T00:00:00`).lt('created_at', upperBound)
          .order('created_at')
        if (error) throw error
        const rows = (data ?? []) as MovementFull[]
        const name = stampedFilename('mouvements_stock', format)
        if (format === 'csv') downloadCsv(rows, movementColumns, name)
        else downloadXlsx(rows, movementColumns, name, 'Mouvements')
        return rows.length
      },
    },
    {
      key: 'stock',
      title: 'Etat du stock',
      description: 'Photographie du stock a l instant present, par produit et par emplacement.',
      run: async (format: 'csv' | 'xlsx') => {
        const { data, error } = await supabase
          .from('v_stock_by_location').select('*').order('product_name')
        if (error) throw error
        const rows = (data ?? []) as StockByLocation[]
        const name = stampedFilename('etat_du_stock', format)
        if (format === 'csv') downloadCsv(rows, stockColumns, name)
        else downloadXlsx(rows, stockColumns, name, 'Stock')
        return rows.length
      },
    },
  ]

  return (
    <div className="space-y-3">
      {message && <Alert kind="info">{message}</Alert>}
      {exports.map((e) => (
        <div key={e.key} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">{e.title}</h3>
            <p className="text-sm text-slate-500">{e.description}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary" icon={Download} loading={busy === `${e.key}-csv`}
              onClick={() => void run(`${e.key}-csv`, () => e.run('csv'))}
            >
              CSV
            </Button>
            <Button
              variant="secondary" icon={FileSpreadsheet} loading={busy === `${e.key}-xlsx`}
              onClick={() => void run(`${e.key}-xlsx`, () => e.run('xlsx'))}
            >
              Excel
            </Button>
          </div>
        </div>
      ))}
      <Alert kind="info">
        Les fichiers CSV utilisent le point-virgule et un en-tete UTF-8 : Excel francais
        les ouvre directement, sans assistant d importation.
      </Alert>
    </div>
  )
}
