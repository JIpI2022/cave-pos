/**
 * Tableau de bord : chiffre d'affaires du jour / de la semaine / du mois,
 * marge brute, valeur du stock, produits sous le seuil d'alerte,
 * meilleures ventes et repartition par moyen de paiement.
 *
 * Toutes les donnees proviennent des vues de reporting PostgreSQL :
 * aucun calcul n'est duplique dans l'interface.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, Cell, CartesianGrid, LabelList, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, BarChart3, Boxes, Euro, Percent, Receipt, RefreshCw, TrendingUp,
} from 'lucide-react'
import {
  Alert, Badge, Button, EmptyState, PageHeader, Spinner, StatCard, Table,
} from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import {
  addDays, formatDate, formatMoney, formatPercent, formatQty, startOfDay, startOfMonth,
  startOfWeek, toIsoDate, PAYMENT_LABELS,
} from '@/lib/format'
import { axisTick, CATEGORICAL, compactAmount, GRID, INK, SERIES_MAIN } from '@/lib/chart'
import type { LowStockRow, PaymentBreakdown, SalesDaily, StockValueRow, TopProduct } from '@/types/database'

export default function Dashboard() {
  const { currency } = useSettings()
  const [daily, setDaily] = useState<SalesDaily[]>([])
  const [top, setTop] = useState<TopProduct[]>([])
  const [payments, setPayments] = useState<PaymentBreakdown[]>([])
  const [stockValue, setStockValue] = useState<StockValueRow | null>(null)
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const monthStart = toIsoDate(startOfMonth())
    const since = toIsoDate(addDays(new Date(), -29))

    const [d, t, p, sv, ls] = await Promise.all([
      supabase.from('v_sales_daily').select('*').gte('sale_date', since).order('sale_date'),
      supabase.from('v_top_products').select('*').order('ca_ttc', { ascending: false }).limit(8),
      supabase.from('v_payments_breakdown').select('*').gte('sale_date', monthStart),
      supabase.from('v_stock_value').select('*').maybeSingle(),
      supabase.from('v_low_stock').select('*').order('missing_qty', { ascending: false }).limit(20),
    ])

    const firstError = d.error ?? t.error ?? p.error ?? sv.error ?? ls.error
    if (firstError) setError(describeError(firstError))
    else setError(null)

    setDaily((d.data ?? []) as SalesDaily[])
    setTop((t.data ?? []) as TopProduct[])
    setPayments((p.data ?? []) as PaymentBreakdown[])
    setStockValue((sv.data ?? null) as StockValueRow | null)
    setLowStock((ls.data ?? []) as LowStockRow[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // ---- Agregats par periode -------------------------------------------
  const periods = useMemo(() => {
    const today = toIsoDate(startOfDay())
    const weekStart = toIsoDate(startOfWeek())
    const monthStart = toIsoDate(startOfMonth())

    const sum = (rows: SalesDaily[], field: keyof SalesDaily) =>
      rows.reduce((s, r) => s + Number(r[field] ?? 0), 0)

    const jour = daily.filter((r) => r.sale_date === today)
    const semaine = daily.filter((r) => r.sale_date >= weekStart)
    const mois = daily.filter((r) => r.sale_date >= monthStart)

    return {
      jour: { ca: sum(jour, 'ca_ttc'), tickets: sum(jour, 'nb_tickets'), marge: sum(jour, 'marge_ht') },
      semaine: { ca: sum(semaine, 'ca_ttc'), tickets: sum(semaine, 'nb_tickets'), marge: sum(semaine, 'marge_ht') },
      mois: {
        ca: sum(mois, 'ca_ttc'), tickets: sum(mois, 'nb_tickets'),
        marge: sum(mois, 'marge_ht'), ht: sum(mois, 'ca_ht'),
      },
    }
  }, [daily])

  const panierMoyen = periods.mois.tickets > 0 ? periods.mois.ca / periods.mois.tickets : 0
  const tauxMarge = periods.mois.ht > 0 ? (periods.mois.marge / periods.mois.ht) * 100 : 0

  // ---- Series des graphiques ------------------------------------------
  const last14 = useMemo(() => {
    const byDate = new Map(daily.map((r) => [r.sale_date, r]))
    const out: { jour: string; label: string; ca: number; marge: number; tickets: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = addDays(startOfDay(), -i)
      const iso = toIsoDate(d)
      const row = byDate.get(iso)
      out.push({
        jour: iso,
        label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(d),
        ca: Number(row?.ca_ttc ?? 0),
        marge: Number(row?.marge_ht ?? 0),
        tickets: Number(row?.nb_tickets ?? 0),
      })
    }
    return out
  }, [daily])

  const paymentMix = useMemo(() => {
    const totals = new Map<string, number>()
    for (const p of payments) {
      totals.set(p.method, (totals.get(p.method) ?? 0) + Number(p.total))
    }
    // Ordre d attribution des couleurs FIXE : especes, carte, mobile money.
    return (['especes', 'carte', 'mobile_money'] as const).map((m, i) => ({
      methode: PAYMENT_LABELS[m],
      total: totals.get(m) ?? 0,
      couleur: CATEGORICAL[i],
    }))
  }, [payments])

  const totalPayments = paymentMix.reduce((s, p) => s + p.total, 0)

  if (loading) return <Spinner label="Chargement du tableau de bord..." />

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle={`Mois en cours depuis le ${formatDate(startOfMonth())}`}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => void load()}>Actualiser</Button>}
      />

      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      {/* ---- Indicateurs ---- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CA du jour" value={formatMoney(periods.jour.ca, currency)}
          sub={`${formatQty(periods.jour.tickets)} ticket(s)`} icon={Euro} tone="wine"
        />
        <StatCard
          label="CA de la semaine" value={formatMoney(periods.semaine.ca, currency)}
          sub={`${formatQty(periods.semaine.tickets)} ticket(s)`} icon={TrendingUp} tone="blue"
        />
        <StatCard
          label="CA du mois" value={formatMoney(periods.mois.ca, currency)}
          sub={`panier moyen ${formatMoney(panierMoyen, currency)}`} icon={BarChart3} tone="slate"
        />
        <StatCard
          label="Marge brute du mois" value={formatMoney(periods.mois.marge, currency)}
          sub={`${formatPercent(tauxMarge, 1)} du CA HT`} icon={Percent} tone="green"
        />
        <StatCard
          label="Stock au prix d achat HT"
          value={formatMoney(stockValue?.value_purchase_ht ?? 0, currency)}
          sub={`${formatQty(stockValue?.total_units ?? 0)} unite(s) · ${stockValue?.nb_products ?? 0} reference(s)`}
          icon={Boxes} tone="blue"
        />
        <StatCard
          label="Stock au prix de vente TTC"
          value={formatMoney(stockValue?.value_sale_ttc ?? 0, currency)}
          sub="potentiel de chiffre d affaires" icon={Euro} tone="slate"
        />
        <StatCard
          label="Produits sous le seuil" value={String(lowStock.length)}
          sub="a reapprovisionner" icon={AlertTriangle} tone="amber"
        />
        <StatCard
          label="Tickets du mois" value={formatQty(periods.mois.tickets)}
          sub={`remises ${formatMoney(daily.reduce((s, r) => s + Number(r.total_remises), 0), currency)}`}
          icon={Receipt} tone="slate"
        />
      </div>

      {/* ---- Graphiques ---- */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-1 font-semibold text-slate-900">Chiffre d affaires des 14 derniers jours</h2>
          <p className="mb-3 text-xs text-slate-500">Ventes validees, toutes taxes comprises.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={last14} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
              <YAxis
                tick={axisTick} axisLine={false} tickLine={false} width={56}
                tickFormatter={(v: number) => compactAmount(v, currency.symbol)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold text-slate-900">{label}</p>
                      <p className="text-slate-600">CA : <b>{formatMoney(Number(payload[0].value), currency)}</b></p>
                      <p className="text-slate-600">
                        Marge : {formatMoney(Number(payload[0].payload.marge), currency)}
                      </p>
                      <p className="text-slate-600">{formatQty(payload[0].payload.tickets)} ticket(s)</p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="ca" fill={SERIES_MAIN} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h2 className="mb-1 font-semibold text-slate-900">Repartition par moyen de paiement</h2>
          <p className="mb-3 text-xs text-slate-500">
            Mois en cours · total encaisse {formatMoney(totalPayments, currency)}
          </p>
          {totalPayments === 0 ? (
            <EmptyState title="Aucun encaissement ce mois-ci" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={paymentMix} layout="vertical" barCategoryGap={8}
                margin={{ top: 4, right: 128, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis
                  type="number" tick={axisTick} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => compactAmount(v, currency.symbol)}
                />
                <YAxis
                  type="category" dataKey="methode" tick={axisTick}
                  axisLine={false} tickLine={false} width={124}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-slate-900">{payload[0].payload.methode}</p>
                        <p className="text-slate-600">{formatMoney(Number(payload[0].value), currency)}</p>
                        <p className="text-slate-500">
                          {formatPercent((Number(payload[0].value) / totalPayments) * 100, 1)} des encaissements
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={26}>
                  {paymentMix.map((p) => <Cell key={p.methode} fill={p.couleur} />)}
                  {/* Etiquette directe : l identite ne repose jamais sur la couleur seule. */}
                  <LabelList
                    dataKey="total" position="right" offset={8}
                    fill={INK.secondary} fontSize={11}
                    formatter={(v: number) => formatMoney(v, currency)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ---- Meilleures ventes ---- */}
        <div className="card p-4">
          <h2 className="mb-1 font-semibold text-slate-900">Meilleures ventes</h2>
          <p className="mb-3 text-xs text-slate-500">Depuis l origine, par chiffre d affaires TTC.</p>
          {top.length === 0 ? (
            <EmptyState title="Aucune vente enregistree" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, top.length * 34)}>
                <BarChart
                  data={top} layout="vertical" barCategoryGap={4}
                  margin={{ top: 4, right: 90, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis
                    type="number" tick={axisTick} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => compactAmount(v, currency.symbol)}
                  />
                  <YAxis
                    type="category" dataKey="product_name" tick={axisTick}
                    axisLine={false} tickLine={false} width={150}
                    tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-slate-900">{payload[0].payload.product_name}</p>
                          <p className="text-slate-600">CA : <b>{formatMoney(Number(payload[0].value), currency)}</b></p>
                          <p className="text-slate-600">
                            Marge : {formatMoney(Number(payload[0].payload.marge_ht), currency)}
                          </p>
                          <p className="text-slate-600">
                            {formatQty(payload[0].payload.qty_sold)} unite(s) vendue(s)
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="ca_ttc" fill={SERIES_MAIN} radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList
                      dataKey="ca_ttc" position="right" offset={8}
                      fill={INK.secondary} fontSize={11}
                      formatter={(v: number) => formatMoney(v, currency)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-slate-400">
                Le detail chiffre est disponible dans Rapports (export CSV / Excel).
              </p>
            </>
          )}
        </div>

        {/* ---- Alertes de stock ---- */}
        <div className="card">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Produits sous le seuil d alerte</h2>
            <p className="text-xs text-slate-500">A commander en priorite.</p>
          </div>
          {lowStock.length === 0 ? (
            <EmptyState title="Aucune alerte" description="Tous les stocks sont au-dessus de leur seuil." />
          ) : (
            <Table head={['Produit', 'Stock', 'Seuil', 'Manque', 'Fournisseur']}>
              {lowStock.map((p) => (
                <tr key={p.id}>
                  <td className="td">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.category_label ?? ''}</p>
                  </td>
                  <td className="td tabular">
                    <Badge color={Number(p.total_stock) <= 0 ? 'red' : 'amber'}>{formatQty(p.total_stock)}</Badge>
                  </td>
                  <td className="td tabular text-slate-500">{formatQty(p.stock_alert_threshold)}</td>
                  <td className="td tabular font-semibold text-amber-700">
                    {Number(p.missing_qty) > 0 ? `+${formatQty(p.missing_qty)}` : '—'}
                  </td>
                  <td className="td text-xs text-slate-600">{p.supplier_name ?? '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
