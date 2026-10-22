/**
 * Inventaire par scan.
 *
 * Deroulement : on ouvre une session sur un emplacement, on scanne les
 * articles (chaque scan incremente la quantite comptee), puis on valide.
 * A la validation, la base genere un mouvement d'ajustement par ecart
 * (fonction validate_inventory) : le stock theorique rejoint le comptage.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, ClipboardList, Download, Plus, ScanLine, Trash2, X,
} from 'lucide-react'
import {
  Alert, Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select,
  Spinner, Table, Textarea,
} from '@/components/ui'
import BarcodeScanner from '@/components/BarcodeScanner'
import ScanInput from '@/components/ScanInput'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { formatDateTime, formatMoney, formatQty, parseNumber, searchKey } from '@/lib/format'
import { downloadCsv, downloadXlsx, stampedFilename, type ExportColumn } from '@/lib/exports'
import { normalizeScan } from '@/lib/barcode'
import type { InventoryLineFull, InventorySession, ProductFull } from '@/types/database'

export default function Inventory() {
  const { locations } = useSettings()
  const toast = useToast()

  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState<InventorySession | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_sessions').select('*').order('started_at', { ascending: false }).limit(50)
    setSessions((data ?? []) as InventorySession[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (current) {
    return (
      <InventorySessionView
        session={current}
        onBack={() => { setCurrent(null); void load() }}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title="Inventaire"
        subtitle="Comptage par scan et validation des ecarts"
        actions={<Button icon={Plus} onClick={() => setCreateOpen(true)}>Nouvelle session</Button>}
      />

      <div className="card">
        {loading ? <Spinner /> : sessions.length === 0 ? (
          <EmptyState
            title="Aucune session d inventaire"
            description="Creez une session pour commencer un comptage."
            action={<Button icon={Plus} className="mt-3" onClick={() => setCreateOpen(true)}>Nouvelle session</Button>}
          />
        ) : (
          <Table head={['Session', 'Emplacement', 'Ouverte le', 'Statut', '']}>
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="td font-medium">{s.label || `Inventaire ${formatDateTime(s.started_at)}`}</td>
                <td className="td text-sm">{locations.find((l) => l.id === s.location_id)?.name ?? '—'}</td>
                <td className="td text-xs text-slate-600">{formatDateTime(s.started_at)}</td>
                <td className="td">
                  {s.status === 'ouverte' ? <Badge color="amber">en cours</Badge>
                    : s.status === 'validee' ? <Badge color="green">validee</Badge>
                      : <Badge color="slate">annulee</Badge>}
                </td>
                <td className="td">
                  <Button variant="ghost" icon={ClipboardList} onClick={() => setCurrent(s)}>
                    {s.status === 'ouverte' ? 'Continuer' : 'Consulter'}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <CreateSessionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(s) => { setCreateOpen(false); setCurrent(s); toast.success('Session ouverte.') }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
function CreateSessionDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (s: InventorySession) => void }) {
  const { locations } = useSettings()
  const [locationId, setLocationId] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLocationId(locations[0]?.id ?? '')
    setLabel(`Inventaire du ${new Date().toLocaleDateString('fr-FR')}`)
    setError(null)
  }, [open, locations])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { data, error: dbErr } = await supabase
        .from('inventory_sessions')
        .insert({ location_id: locationId, label: label.trim() })
        .select().single()
      if (dbErr) throw dbErr
      onCreated(data as InventorySession)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open} onClose={onClose} size="sm" title="Nouvelle session d inventaire"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button loading={busy} onClick={() => void submit()}>Ouvrir la session</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Emplacement a inventorier" required>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Libelle">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Alert kind="info">
          Le stock theorique de chaque ligne est releve au moment du scan, mais
          l ecart definitif est recalcule a la validation : les ventes realisees
          pendant le comptage sont donc prises en compte.
        </Alert>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Session ouverte : comptage
// ---------------------------------------------------------------------------
function InventorySessionView({ session, onBack }: { session: InventorySession; onBack: () => void }) {
  const { locations, currency } = useSettings()
  const toast = useToast()

  const [lines, setLines] = useState<InventoryLineFull[]>([])
  const [products, setProducts] = useState<ProductFull[]>([])
  const [loading, setLoading] = useState(true)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [validateOpen, setValidateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readOnly = session.status !== 'ouverte'
  const locationName = locations.find((l) => l.id === session.location_id)?.name ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    const [l, p] = await Promise.all([
      supabase.from('v_inventory_lines_full').select('*').eq('session_id', session.id).order('product_name'),
      supabase.from('v_products_full').select('*').eq('active', true).order('name'),
    ])
    setLines((l.data ?? []) as InventoryLineFull[])
    setProducts((p.data ?? []) as ProductFull[])
    setLoading(false)
  }, [session.id])

  useEffect(() => { void load() }, [load])

  /** Un scan incremente la quantite comptee du produit (fonction inventory_scan). */
  const scan = useCallback(async (code: string, qty = 1) => {
    const normalized = normalizeScan(code)
    const product = products.find(
      (p) => p.barcode === normalized || (p.internal_code ?? '').toUpperCase() === normalized.toUpperCase(),
    ) ?? products.find((p) => searchKey(p.name).includes(searchKey(normalized)))

    if (!product) { toast.warning(`Code « ${normalized} » inconnu.`); return }

    const { error: rpcErr } = await supabase.rpc('inventory_scan', {
      p_session_id: session.id, p_product_id: product.id, p_qty: qty,
    })
    if (rpcErr) { toast.error(describeError(rpcErr)); return }

    toast.success(`${product.name} : +${qty}`)
    setSearch('')
    await load()
  }, [products, session.id, toast, load])

  async function setCounted(line: InventoryLineFull, value: number) {
    const { error: dbErr } = await supabase
      .from('inventory_lines')
      .update({ counted_qty: value, updated_at: new Date().toISOString() })
      .eq('id', line.id)
    if (dbErr) { toast.error(describeError(dbErr)); return }
    setLines((ls) => ls.map((l) => (l.id === line.id ? { ...l, counted_qty: value, gap: value - l.theoretical_qty } : l)))
  }

  async function setReason(line: InventoryLineFull, reason: string) {
    await supabase.from('inventory_lines').update({ reason }).eq('id', line.id)
    setLines((ls) => ls.map((l) => (l.id === line.id ? { ...l, reason } : l)))
  }

  async function removeLine(line: InventoryLineFull) {
    await supabase.from('inventory_lines').delete().eq('id', line.id)
    setLines((ls) => ls.filter((l) => l.id !== line.id))
  }

  async function validate() {
    setBusy(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('validate_inventory', { p_session_id: session.id })
      if (rpcErr) throw rpcErr
      toast.success(`${data} ajustement(s) applique(s) au stock.`)
      setValidateOpen(false)
      onBack()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    const gaps = lines.filter((l) => Number(l.gap) !== 0)
    return {
      comptees: lines.length,
      ecarts: gaps.length,
      valeur: gaps.reduce((s, l) => s + Number(l.gap_value_ht), 0),
      manquants: gaps.filter((l) => Number(l.gap) < 0).length,
      excedents: gaps.filter((l) => Number(l.gap) > 0).length,
    }
  }, [lines])

  const exportColumns: ExportColumn<InventoryLineFull>[] = [
    { header: 'Produit', value: (l) => l.product_name },
    { header: 'Code', value: (l) => l.barcode || l.internal_code || '' },
    { header: 'Theorique', value: (l) => l.theoretical_qty },
    { header: 'Compte', value: (l) => l.counted_qty },
    { header: 'Ecart', value: (l) => l.gap },
    { header: 'Valeur ecart HT', value: (l) => l.gap_value_ht },
    { header: 'Motif', value: (l) => l.reason },
  ]

  return (
    <div>
      <PageHeader
        title={session.label || 'Inventaire'}
        subtitle={`${locationName} · ouvert le ${formatDateTime(session.started_at)}${readOnly ? ' · session cloturee' : ''}`}
        actions={
          <>
            <Button variant="secondary" icon={X} onClick={onBack}>Retour</Button>
            <Button
              variant="secondary" icon={Download} disabled={!lines.length}
              onClick={() => downloadXlsx(lines, exportColumns, stampedFilename('inventaire', 'xlsx'), 'Inventaire')}
            >
              Excel
            </Button>
            <Button
              variant="secondary" icon={Download} disabled={!lines.length}
              onClick={() => downloadCsv(lines, exportColumns, stampedFilename('inventaire', 'csv'))}
            >
              CSV
            </Button>
            {!readOnly && (
              <Button icon={CheckCircle2} disabled={!lines.length} onClick={() => setValidateOpen(true)}>
                Valider l inventaire
              </Button>
            )}
          </>
        }
      />

      {!readOnly && (
        <div className="card mb-3 space-y-2 p-3">
          <ScanInput
            onScan={(code) => void scan(code)}
            onTextChange={setSearch}
            value={search}
            keepFocus
            placeholder="Scanner un article (chaque scan ajoute 1) ou chercher par nom..."
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Button variant="secondary" icon={ScanLine} onClick={() => setCameraOpen(true)}>
              Scan continu (camera)
            </Button>
            La camera reste ouverte entre deux lectures : pratique pour compter un rayon entier.
          </div>
        </div>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        <div className="card p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">Lignes comptees</p>
          <p className="tabular text-xl font-bold">{stats.comptees}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ecarts</p>
          <p className="tabular text-xl font-bold text-amber-700">{stats.ecarts}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">Manquants / excedents</p>
          <p className="tabular text-xl font-bold">{stats.manquants} / {stats.excedents}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">Valeur des ecarts</p>
          <p className={`tabular text-xl font-bold ${stats.valeur < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatMoney(stats.valeur, currency)}
          </p>
        </div>
      </div>

      <div className="card">
        {loading ? <Spinner /> : lines.length === 0 ? (
          <EmptyState title="Aucun article compte" description="Scannez un premier article pour demarrer le comptage." />
        ) : (
          <Table head={['Produit', 'Theorique', 'Compte', 'Ecart', 'Valeur', 'Motif de l ecart', '']}>
            {lines.map((l) => {
              const gap = Number(l.gap)
              return (
                <tr key={l.id} className={gap !== 0 ? 'bg-amber-50/40' : ''}>
                  <td className="td">
                    <p className="font-medium text-slate-900">{l.product_name}</p>
                    <p className="font-mono text-xs text-slate-500">{l.barcode || l.internal_code}</p>
                  </td>
                  <td className="td tabular text-slate-500">{formatQty(l.theoretical_qty)}</td>
                  <td className="td">
                    {readOnly ? (
                      <span className="tabular font-semibold">{formatQty(l.counted_qty)}</span>
                    ) : (
                      <Input
                        value={String(l.counted_qty)}
                        inputMode="decimal"
                        className="tabular w-24 text-right"
                        onChange={(e) => void setCounted(l, parseNumber(e.target.value) ?? 0)}
                      />
                    )}
                  </td>
                  <td className={`td tabular font-semibold ${gap < 0 ? 'text-red-600' : gap > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {gap > 0 ? '+' : ''}{formatQty(gap)}
                  </td>
                  <td className="td tabular text-xs text-slate-600">{formatMoney(l.gap_value_ht, currency)}</td>
                  <td className="td">
                    {readOnly ? (
                      <span className="text-xs text-slate-600">{l.reason}</span>
                    ) : (
                      <Input
                        value={l.reason ?? ''}
                        placeholder={gap !== 0 ? 'Motif obligatoire' : ''}
                        onChange={(e) => void setReason(l, e.target.value)}
                      />
                    )}
                  </td>
                  <td className="td">
                    {!readOnly && (
                      <button
                        onClick={() => void removeLine(l)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Retirer la ligne"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
      </div>

      <BarcodeScanner
        open={cameraOpen}
        continuous
        title="Comptage par scan continu"
        onClose={() => setCameraOpen(false)}
        onDetected={(code) => void scan(code)}
      />

      <Modal
        open={validateOpen} onClose={() => setValidateOpen(false)} size="sm" title="Valider l inventaire"
        footer={
          <>
            <Button variant="secondary" onClick={() => setValidateOpen(false)}>Annuler</Button>
            <Button icon={CheckCircle2} loading={busy} onClick={() => void validate()}>
              Appliquer les ecarts
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {error && <Alert kind="error">{error}</Alert>}
          <p>
            {stats.ecarts} ligne(s) presentent un ecart, pour une valeur de{' '}
            <b>{formatMoney(stats.valeur, currency)}</b> au prix d achat.
          </p>
          <Alert kind="warning">
            Un mouvement d ajustement sera cree pour chaque ecart, avec son motif.
            L operation est enregistree au journal d audit et ne peut pas etre defaite
            (il faudra creer un nouveau mouvement correctif).
          </Alert>
          {lines.some((l) => Number(l.gap) !== 0 && !l.reason?.trim()) && (
            <Alert kind="info">
              Certains ecarts n ont pas de motif : la mention « Ecart d inventaire »
              sera utilisee par defaut.
            </Alert>
          )}
          <Textarea
            readOnly rows={3} className="bg-slate-50 text-xs"
            value={lines.filter((l) => Number(l.gap) !== 0)
              .map((l) => `${l.product_name} : ${Number(l.gap) > 0 ? '+' : ''}${l.gap}`)
              .join('\n') || 'Aucun ecart.'}
          />
        </div>
      </Modal>
    </div>
  )
}
