/**
 * Stock par produit et par emplacement.
 * Permet de saisir une entree, une casse/perte, un ajustement ou un transfert.
 * Toute ecriture passe par les fonctions SQL `record_movement` / `transfer_stock`
 * qui tracent le mouvement et mettent a jour les niveaux via un trigger.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight, Boxes, Download, FileSpreadsheet, PackagePlus, TriangleAlert, Wallet,
} from 'lucide-react'
import {
  Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Modal, PageHeader,
  Select, Spinner, StatCard, Table, Textarea,
} from '@/components/ui'
import ScanInput from '@/components/ScanInput'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { formatMoney, formatQty, parseNumber, searchKey, MOVEMENT_LABELS } from '@/lib/format'
import { toBaseUnits } from '@/lib/calc'
import { downloadCsv, downloadXlsx, stampedFilename, type ExportColumn } from '@/lib/exports'
import { normalizeScan } from '@/lib/barcode'
import type { MovementType, StockByLocation } from '@/types/database'

export default function Stock() {
  const { locations, currency } = useSettings()
  const toast = useToast()

  const [rows, setRows] = useState<StockByLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [hideZero, setHideZero] = useState(true)

  const [moveTarget, setMoveTarget] = useState<StockByLocation | null>(null)
  const [transferTarget, setTransferTarget] = useState<StockByLocation | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: dbErr } = await supabase
      .from('v_stock_by_location')
      .select('*')
      .order('product_name')
    if (dbErr) setError(describeError(dbErr))
    else { setError(null); setRows((data ?? []) as StockByLocation[]) }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const key = searchKey(search)
    return rows.filter((r) => {
      if (locationId && r.location_id !== locationId) return false
      if (hideZero && Number(r.quantity) === 0) return false
      if (onlyLow && Number(r.quantity) > Number(r.stock_alert_threshold)) return false
      if (!key) return true
      return (
        searchKey(r.product_name).includes(key) ||
        (r.barcode ?? '').includes(key) ||
        searchKey(r.internal_code).includes(key)
      )
    })
  }, [rows, locationId, search, onlyLow, hideZero])

  const totals = useMemo(() => {
    const units = filtered.reduce((s, r) => s + Number(r.quantity), 0)
    const value = filtered.reduce((s, r) => s + Number(r.value_ht), 0)
    const alerts = filtered.filter((r) => Number(r.quantity) <= Number(r.stock_alert_threshold)).length
    return { units, value, alerts }
  }, [filtered])

  function handleScan(code: string) {
    const normalized = normalizeScan(code)
    const found = rows.find(
      (r) => r.barcode === normalized || r.internal_code?.toUpperCase() === normalized.toUpperCase(),
    )
    if (!found) { toast.warning(`Aucun produit en stock pour le code « ${normalized} ».`); return }
    setSearch(found.product_name)
    setMoveTarget(found)
  }

  const exportColumns: ExportColumn<StockByLocation>[] = [
    { header: 'Produit', value: (r) => r.product_name },
    { header: 'Code', value: (r) => r.barcode || r.internal_code || '' },
    { header: 'Categorie', value: (r) => r.category_label ?? '' },
    { header: 'Emplacement', value: (r) => r.location_name },
    { header: 'Quantite (bouteilles)', value: (r) => r.quantity },
    { header: 'Seuil alerte', value: (r) => r.stock_alert_threshold },
    { header: 'Prix achat HT', value: (r) => r.purchase_price_ht },
    { header: 'Valeur HT', value: (r) => r.value_ht },
    { header: 'Prix vente TTC', value: (r) => r.sale_price_ttc },
  ]

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Quantites exprimees en unites de base (bouteilles)"
        actions={
          <>
            <Button
              variant="secondary" icon={Download}
              onClick={() => downloadCsv(filtered, exportColumns, stampedFilename('etat_du_stock', 'csv'))}
            >CSV</Button>
            <Button
              variant="secondary" icon={FileSpreadsheet}
              onClick={() => downloadXlsx(filtered, exportColumns, stampedFilename('etat_du_stock', 'xlsx'), 'Stock')}
            >Excel</Button>
            <Button icon={PackagePlus} onClick={() => setMoveTarget(rows[0] ?? null)} disabled={!rows.length}>
              Saisir un mouvement
            </Button>
          </>
        }
      />

      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <StatCard label="Unites en stock" value={formatQty(totals.units)} icon={Boxes} tone="blue" />
        <StatCard label="Valeur au prix d achat" value={formatMoney(totals.value, currency)} icon={Wallet} tone="green" />
        <StatCard label="Lignes sous le seuil" value={String(totals.alerts)} icon={TriangleAlert} tone="amber" />
      </div>

      <div className="card mb-3 space-y-3 p-3">
        <ScanInput
          onScan={handleScan} onTextChange={setSearch} value={search} autoFocus={false}
          placeholder="Scanner un code-barres ou chercher un produit..."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-auto">
            <option value="">Tous les emplacements</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Checkbox label="Sous le seuil" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
          <Checkbox label="Masquer les stocks a zero" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          <span className="ml-auto text-sm text-ink-3">{filtered.length} ligne(s)</span>
        </div>
      </div>

      <div className="card">
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title="Aucune ligne de stock" description="Validez un bon de reception pour alimenter le stock." />
        ) : (
          <Table head={['Produit', 'Emplacement', 'Quantite', 'Seuil', 'Valeur HT', 'Actions']}>
            {filtered.map((r) => {
              const low = Number(r.quantity) <= Number(r.stock_alert_threshold)
              const negative = Number(r.quantity) < 0
              return (
                <tr key={`${r.product_id}-${r.location_id}`} className="hover:bg-raised">
                  <td className="td">
                    <p className="font-medium text-ink">{r.product_name}</p>
                    <p className="font-mono text-xs text-ink-3">{r.barcode || r.internal_code}</p>
                  </td>
                  <td className="td text-sm">{r.location_name}</td>
                  <td className={`td tabular font-semibold ${negative ? 'text-red-600' : low ? 'text-amber-700' : ''}`}>
                    {formatQty(r.quantity)}
                    {negative && <Badge color="red">negatif</Badge>}
                  </td>
                  <td className="td tabular text-xs text-ink-3">{formatQty(r.stock_alert_threshold)}</td>
                  <td className="td tabular whitespace-nowrap">{formatMoney(r.value_ht, currency)}</td>
                  <td className="td">
                    <div className="flex gap-1">
                      <Button variant="ghost" icon={PackagePlus} onClick={() => setMoveTarget(r)} title="Mouvement">
                        <span className="hidden sm:inline">Mouvement</span>
                      </Button>
                      <Button variant="ghost" icon={ArrowLeftRight} onClick={() => setTransferTarget(r)} title="Transfert">
                        <span className="hidden sm:inline">Transfert</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
      </div>

      <MovementDialog
        open={Boolean(moveTarget)}
        row={moveTarget}
        onClose={() => setMoveTarget(null)}
        onDone={() => void load()}
      />
      <TransferDialog
        open={Boolean(transferTarget)}
        row={transferTarget}
        onClose={() => setTransferTarget(null)}
        onDone={() => void load()}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Saisie d'un mouvement (entree / casse / ajustement / sortie manuelle)
// ---------------------------------------------------------------------------

const MOTIFS: Record<string, string[]> = {
  entree: ['Reception fournisseur', 'Retour client', 'Production interne'],
  casse: ['Bouteille cassee', 'Peremption', 'Vol / disparition', 'Degustation offerte'],
  ajustement: ['Correction d inventaire', 'Erreur de saisie', 'Regularisation'],
  sortie: ['Consommation interne', 'Cadeau client', 'Echantillon'],
}

function MovementDialog({
  open, row, onClose, onDone,
}: { open: boolean; row: StockByLocation | null; onClose: () => void; onDone: () => void }) {
  const { locations } = useSettings()
  const toast = useToast()
  const [type, setType] = useState<MovementType>('entree')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [packMode, setPackMode] = useState(false)
  const [packSize, setPackSize] = useState('6')
  const [reason, setReason] = useState('Reception fournisseur')
  const [unitCost, setUnitCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !row) return
    setType('entree')
    setLocationId(row.location_id)
    setQuantity('1')
    setPackMode(false)
    setReason('Reception fournisseur')
    setUnitCost(String(row.purchase_price_ht ?? ''))
    setError(null)
  }, [open, row])

  const qty = parseNumber(quantity) ?? 0
  const baseUnits = packMode ? toBaseUnits(qty, parseNumber(packSize) ?? 1) : qty
  const signedPreview = type === 'casse' || type === 'sortie' ? -Math.abs(baseUnits) : baseUnits
  const newLevel = Number(row?.quantity ?? 0) + (type === 'ajustement' ? baseUnits : signedPreview)

  async function submit() {
    if (!row) return
    if (!baseUnits) { setError('Saisissez une quantite differente de zero.'); return }
    if (!reason.trim()) { setError('Le motif est obligatoire.'); return }

    setBusy(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('record_movement', {
        p_product_id: row.product_id,
        p_location_id: locationId,
        p_type: type,
        p_quantity: baseUnits,
        p_reason: reason.trim(),
        p_reference: '',
        p_unit_cost: parseNumber(unitCost),
      })
      if (rpcErr) throw rpcErr
      toast.success('Mouvement enregistre.')
      onDone()
      onClose()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? `Mouvement de stock — ${row.product_name}` : 'Mouvement de stock'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button loading={busy} onClick={() => void submit()}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type de mouvement" required>
            <Select
              value={type}
              onChange={(e) => {
                const t = e.target.value as MovementType
                setType(t)
                setReason(MOTIFS[t]?.[0] ?? '')
              }}
            >
              <option value="entree">{MOVEMENT_LABELS.entree}</option>
              <option value="casse">{MOVEMENT_LABELS.casse}</option>
              <option value="ajustement">{MOVEMENT_LABELS.ajustement}</option>
              <option value="sortie">Sortie manuelle (hors vente)</option>
            </Select>
          </Field>

          <Field label="Emplacement" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>

          <Field
            label="Quantite"
            required
            hint={type === 'ajustement' ? 'Un nombre negatif diminue le stock.' : undefined}
          >
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
          </Field>

          <Field label="Conditionnement">
            <div className="flex items-center gap-2">
              <Checkbox label="Par carton de" checked={packMode} onChange={(e) => setPackMode(e.target.checked)} />
              <Input
                value={packSize} onChange={(e) => setPackSize(e.target.value)}
                disabled={!packMode} inputMode="numeric" className="w-20"
              />
            </div>
          </Field>

          {type === 'entree' && (
            <Field label="Cout unitaire HT (facultatif)" hint="Conserve dans l historique du mouvement.">
              <Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" />
            </Field>
          )}
        </div>

        <Field label="Motif" required>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {(MOTIFS[type] ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="">— Autre motif (a saisir) —</option>
          </Select>
          {!MOTIFS[type]?.includes(reason) && (
            <Textarea
              rows={2} className="mt-2" value={reason} placeholder="Precisez le motif..."
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>

        <Alert kind="info">
          Effet sur le stock : <b className="tabular">{formatQty(row?.quantity ?? 0)}</b>{' '}
          → <b className="tabular">{formatQty(newLevel)}</b> unite(s)
          {packMode && baseUnits ? ` (soit ${formatQty(baseUnits)} bouteille(s))` : ''}
        </Alert>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Transfert entre emplacements
// ---------------------------------------------------------------------------

function TransferDialog({
  open, row, onClose, onDone,
}: { open: boolean; row: StockByLocation | null; onClose: () => void; onDone: () => void }) {
  const { locations } = useSettings()
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [packMode, setPackMode] = useState(false)
  const [packSize, setPackSize] = useState('6')
  const [reason, setReason] = useState('Reassort boutique')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !row) return
    setFrom(row.location_id)
    setTo(locations.find((l) => l.id !== row.location_id)?.id ?? '')
    setQuantity('1')
    setPackMode(false)
    setReason('Reassort boutique')
    setError(null)
  }, [open, row, locations])

  const baseUnits = packMode
    ? toBaseUnits(parseNumber(quantity) ?? 0, parseNumber(packSize) ?? 1)
    : parseNumber(quantity) ?? 0

  async function submit() {
    if (!row) return
    if (from === to) { setError('Choisissez deux emplacements differents.'); return }
    if (baseUnits <= 0) { setError('La quantite doit etre positive.'); return }

    setBusy(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('transfer_stock', {
        p_product_id: row.product_id,
        p_from_location: from,
        p_to_location: to,
        p_quantity: baseUnits,
        p_reason: reason.trim() || 'Transfert',
      })
      if (rpcErr) throw rpcErr
      toast.success('Transfert enregistre.')
      onDone()
      onClose()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? `Transfert — ${row.product_name}` : 'Transfert'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button icon={ArrowLeftRight} loading={busy} onClick={() => void submit()}>Transferer</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Depuis" required>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Vers" required>
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {locations.filter((l) => l.id !== from).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Quantite" required>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Conditionnement">
            <div className="flex items-center gap-2">
              <Checkbox label="Par carton de" checked={packMode} onChange={(e) => setPackMode(e.target.checked)} />
              <Input value={packSize} onChange={(e) => setPackSize(e.target.value)} disabled={!packMode}
                     inputMode="numeric" className="w-20" />
            </div>
          </Field>
        </div>

        <Field label="Motif">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <Alert kind="info">
          {formatQty(baseUnits)} bouteille(s) seront deplacees. Le stock source doit etre suffisant :
          la base refuse le transfert dans le cas contraire.
        </Alert>
      </div>
    </Modal>
  )
}
