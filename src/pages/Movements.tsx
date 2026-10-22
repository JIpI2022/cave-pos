/**
 * Journal des mouvements de stock : tout est trace (date, utilisateur,
 * quantite, motif, reference). L'historique est immuable cote base.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import {
  Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Select, Spinner, Table,
} from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import {
  addDays, formatDateTime, formatMoney, formatQty, searchKey, startOfMonth, toIsoDate,
  MOVEMENT_LABELS,
} from '@/lib/format'
import { downloadCsv, downloadXlsx, stampedFilename, type ExportColumn } from '@/lib/exports'
import type { MovementFull, MovementType } from '@/types/database'

const TYPE_COLORS: Record<MovementType, string> = {
  entree: 'green', sortie: 'blue', transfert: 'slate',
  casse: 'red', ajustement: 'amber', retour: 'wine',
}

export default function Movements() {
  const { locations, currency } = useSettings()

  const [rows, setRows] = useState<MovementFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [from, setFrom] = useState(toIsoDate(startOfMonth()))
  const [to, setTo] = useState(toIsoDate(new Date()))
  const [type, setType] = useState('')
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('v_movements_full')
      .select('*')
      .gte('created_at', `${from}T00:00:00`)
      // On borne a la fin de la journee choisie (minuit du lendemain exclu).
      .lt('created_at', `${toIsoDate(addDays(new Date(`${to}T12:00:00`), 1))}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (type) query = query.eq('type', type)
    if (locationId) query = query.eq('location_id', locationId)

    const { data, error: dbErr } = await query
    if (dbErr) setError(describeError(dbErr))
    else { setError(null); setRows((data ?? []) as MovementFull[]) }
    setLoading(false)
  }, [from, to, type, locationId])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const key = searchKey(search)
    if (!key) return rows
    return rows.filter((m) =>
      searchKey(m.product_name).includes(key) ||
      (m.barcode ?? '').includes(key) ||
      searchKey(m.internal_code).includes(key) ||
      searchKey(m.reason).includes(key) ||
      searchKey(m.reference).includes(key))
  }, [rows, search])

  const totals = useMemo(() => ({
    entrees: filtered.filter((m) => m.quantity_delta > 0).reduce((s, m) => s + Number(m.quantity_delta), 0),
    sorties: filtered.filter((m) => m.quantity_delta < 0).reduce((s, m) => s + Number(m.quantity_delta), 0),
  }), [filtered])

  const exportColumns: ExportColumn<MovementFull>[] = [
    { header: 'Date', value: (m) => formatDateTime(m.created_at) },
    { header: 'Type', value: (m) => MOVEMENT_LABELS[m.type] ?? m.type },
    { header: 'Produit', value: (m) => m.product_name },
    { header: 'Code', value: (m) => m.barcode || m.internal_code || '' },
    { header: 'Emplacement', value: (m) => m.location_name },
    { header: 'Quantite', value: (m) => m.quantity_delta },
    { header: 'Cout unitaire HT', value: (m) => m.unit_cost_ht ?? '' },
    { header: 'Motif', value: (m) => m.reason },
    { header: 'Reference', value: (m) => m.reference },
    { header: 'Utilisateur', value: (m) => m.user_email ?? '' },
  ]

  return (
    <div>
      <PageHeader
        title="Mouvements de stock"
        subtitle={`${filtered.length} mouvement(s) · entrees ${formatQty(totals.entrees)} / sorties ${formatQty(totals.sorties)}`}
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void load()}>Actualiser</Button>
            <Button variant="secondary" icon={Download}
              onClick={() => downloadCsv(filtered, exportColumns, stampedFilename('mouvements_stock', 'csv'))}>CSV</Button>
            <Button variant="secondary" icon={FileSpreadsheet}
              onClick={() => downloadXlsx(filtered, exportColumns, stampedFilename('mouvements_stock', 'xlsx'), 'Mouvements')}>Excel</Button>
          </>
        }
      />

      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      <div className="card mb-3 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Du"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Au"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les types</option>
            {Object.entries(MOVEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Emplacement">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Tous</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Recherche">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Produit, motif, ticket..." />
        </Field>
      </div>

      <div className="card">
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title="Aucun mouvement" description="Elargissez la periode ou changez les filtres." />
        ) : (
          <Table head={['Date', 'Type', 'Produit', 'Emplacement', 'Quantite', 'Motif', 'Reference', 'Utilisateur']}>
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-raised">
                <td className="td whitespace-nowrap text-xs text-ink-2">{formatDateTime(m.created_at)}</td>
                <td className="td"><Badge color={TYPE_COLORS[m.type]}>{MOVEMENT_LABELS[m.type] ?? m.type}</Badge></td>
                <td className="td">
                  <p className="font-medium text-ink">{m.product_name}</p>
                  <p className="font-mono text-xs text-ink-3">{m.barcode || m.internal_code}</p>
                </td>
                <td className="td text-sm">{m.location_name}</td>
                <td className={`td tabular font-semibold ${m.quantity_delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {m.quantity_delta > 0 ? '+' : ''}{formatQty(m.quantity_delta)}
                  {m.unit_cost_ht ? (
                    <p className="font-normal text-xs text-ink-3">
                      {formatMoney(Number(m.unit_cost_ht) * Math.abs(Number(m.quantity_delta)), currency)}
                    </p>
                  ) : null}
                </td>
                <td className="td text-sm text-ink-2">{m.reason}</td>
                <td className="td font-mono text-xs text-ink-3">{m.reference}</td>
                <td className="td text-xs text-ink-3">{m.user_email ?? '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  )
}
