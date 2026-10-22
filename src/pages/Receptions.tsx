/**
 * Bons de reception fournisseur.
 *
 * Un bon est d'abord un BROUILLON (modifiable), puis il est VALIDE :
 * la fonction SQL validate_reception cree alors les mouvements d'entree
 * en stock et met a jour le prix d'achat des produits concernes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Save, Trash2, Truck } from 'lucide-react'
import {
  Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Modal, PageHeader,
  Select, Spinner, Table, Textarea,
} from '@/components/ui'
import ScanInput from '@/components/ScanInput'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { formatDate, formatMoney, formatQty, parseNumber, searchKey, toIsoDate } from '@/lib/format'
import { normalizeScan } from '@/lib/barcode'
import { round2 } from '@/lib/calc'
import type { ProductFull, Reception, ReceptionLine, Supplier } from '@/types/database'

interface DraftLine {
  key: string
  productId: string
  label: string
  quantity: string
  packSize: string
  priceHt: string
  updatePrice: boolean
}

export default function Receptions() {
  const { locations, currency } = useSettings()
  const toast = useToast()

  const [rows, setRows] = useState<Reception[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, s] = await Promise.all([
      supabase.from('receptions').select('*').order('received_on', { ascending: false }).limit(200),
      supabase.from('suppliers').select('*').eq('active', true).order('name'),
    ])
    setRows((r.data ?? []) as Reception[])
    setSuppliers((s.data ?? []) as Supplier[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function validateReception(id: string) {
    if (!window.confirm('Valider ce bon de reception ? Le stock et les prix d achat seront mis a jour.')) return
    const { error } = await supabase.rpc('validate_reception', { p_reception_id: id })
    if (error) toast.error(describeError(error))
    else { toast.success('Reception validee : stock mis a jour.'); void load() }
  }

  async function removeReception(r: Reception) {
    if (r.status === 'validee') { toast.error('Un bon valide ne peut pas etre supprime.'); return }
    if (!window.confirm(`Supprimer le brouillon ${r.number} ?`)) return
    const { error } = await supabase.from('receptions').delete().eq('id', r.id)
    if (error) toast.error(describeError(error))
    else { toast.success('Brouillon supprime.'); void load() }
  }

  return (
    <div>
      <PageHeader
        title="Receptions fournisseur"
        subtitle={`${rows.length} bon(s) de reception`}
        actions={
          <Button icon={Plus} onClick={() => { setEditingId(null); setEditorOpen(true) }}>
            Nouveau bon de reception
          </Button>
        }
      />

      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState
            title="Aucune reception"
            description="Saisissez un bon de reception pour alimenter le stock et mettre a jour les prix d achat."
            action={<Button icon={Plus} className="mt-3" onClick={() => setEditorOpen(true)}>Nouveau bon</Button>}
          />
        ) : (
          <Table head={['N°', 'Date', 'Fournisseur', 'Emplacement', 'Total HT', 'Statut', '']}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td font-mono font-semibold">{r.number}</td>
                <td className="td text-sm">{formatDate(r.received_on)}</td>
                <td className="td text-sm">{suppliers.find((s) => s.id === r.supplier_id)?.name ?? '—'}</td>
                <td className="td text-sm">{locations.find((l) => l.id === r.location_id)?.name ?? '—'}</td>
                <td className="td tabular">{formatMoney(r.total_ht, currency)}</td>
                <td className="td">
                  {r.status === 'validee'
                    ? <Badge color="green">validee</Badge>
                    : <Badge color="amber">brouillon</Badge>}
                </td>
                <td className="td">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost" icon={Truck}
                      onClick={() => { setEditingId(r.id); setEditorOpen(true) }}
                    >
                      <span className="hidden sm:inline">{r.status === 'validee' ? 'Consulter' : 'Modifier'}</span>
                    </Button>
                    {r.status === 'brouillon' && (
                      <>
                        <Button variant="ghost" icon={CheckCircle2} onClick={() => void validateReception(r.id)}>
                          <span className="hidden sm:inline">Valider</span>
                        </Button>
                        <Button variant="ghost" icon={Trash2} onClick={() => void removeReception(r)} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <ReceptionEditor
        open={editorOpen}
        receptionId={editingId}
        suppliers={suppliers}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); void load() }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
function ReceptionEditor({
  open, receptionId, suppliers, onClose, onSaved,
}: {
  open: boolean
  receptionId: string | null
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
}) {
  const { locations, currency } = useSettings()
  const toast = useToast()

  const [products, setProducts] = useState<ProductFull[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [receivedOn, setReceivedOn] = useState(toIsoDate(new Date()))
  const [invoiceRef, setInvoiceRef] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [status, setStatus] = useState<'brouillon' | 'validee'>('brouillon')
  const [number, setNumber] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readOnly = status === 'validee'

  useEffect(() => {
    if (!open) return
    setError(null)
    setSearch('')

    void (async () => {
      const { data: prods } = await supabase
        .from('v_products_full').select('*').eq('active', true).order('name')
      setProducts((prods ?? []) as ProductFull[])

      if (!receptionId) {
        setSupplierId(suppliers[0]?.id ?? '')
        setLocationId(locations.find((l) => !l.is_sales_point)?.id ?? locations[0]?.id ?? '')
        setReceivedOn(toIsoDate(new Date()))
        setInvoiceRef('')
        setNotes('')
        setLines([])
        setStatus('brouillon')
        setNumber('')
        return
      }

      const [{ data: rec }, { data: recLines }] = await Promise.all([
        supabase.from('receptions').select('*').eq('id', receptionId).maybeSingle(),
        supabase.from('reception_lines').select('*').eq('reception_id', receptionId),
      ])
      if (rec) {
        const r = rec as Reception
        setSupplierId(r.supplier_id ?? '')
        setLocationId(r.location_id)
        setReceivedOn(r.received_on)
        setInvoiceRef(r.invoice_ref ?? '')
        setNotes(r.notes ?? '')
        setStatus(r.status)
        setNumber(r.number)
      }
      const list = ((recLines ?? []) as ReceptionLine[]).map((l) => ({
        key: l.id,
        productId: l.product_id,
        label: (prods ?? []).find((p) => p.id === l.product_id)?.name ?? 'Produit',
        quantity: String(l.quantity),
        packSize: String(l.pack_size),
        priceHt: String(l.purchase_price_ht),
        updatePrice: l.update_product_price,
      }))
      setLines(list)
    })()
  }, [open, receptionId, suppliers, locations])

  function addProduct(product: ProductFull) {
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === product.id)
      if (existing) {
        return ls.map((l) =>
          l.key === existing.key
            ? { ...l, quantity: String((parseNumber(l.quantity) ?? 0) + 1) }
            : l)
      }
      return [...ls, {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: product.id,
        label: product.name,
        quantity: '1',
        packSize: String(product.pack_size || 1),
        priceHt: String(product.purchase_price_ht ?? 0),
        updatePrice: true,
      }]
    })
    setSearch('')
  }

  function handleScan(code: string) {
    const normalized = normalizeScan(code)
    const found = products.find(
      (p) => p.barcode === normalized || (p.internal_code ?? '').toUpperCase() === normalized.toUpperCase(),
    )
    if (found) { addProduct(found); return }
    const matches = products.filter((p) => searchKey(p.name).includes(searchKey(code)))
    if (matches.length === 1) { addProduct(matches[0]); return }
    toast.warning(`Code « ${normalized} » inconnu. Creez d abord le produit dans le catalogue.`)
  }

  const suggestions = useMemo(() => {
    const key = searchKey(search)
    if (!key) return []
    return products.filter((p) =>
      searchKey(p.name).includes(key) || (p.barcode ?? '').includes(key)).slice(0, 8)
  }, [products, search])

  const total = useMemo(
    () => round2(lines.reduce((s, l) =>
      s + (parseNumber(l.quantity) ?? 0) * (parseNumber(l.packSize) ?? 1) * (parseNumber(l.priceHt) ?? 0), 0)),
    [lines],
  )
  const totalBottles = useMemo(
    () => lines.reduce((s, l) => s + (parseNumber(l.quantity) ?? 0) * (parseNumber(l.packSize) ?? 1), 0),
    [lines],
  )

  /** Enregistre l'en-tete et les lignes ; renvoie l'identifiant du bon. */
  async function save(): Promise<string | null> {
    if (!lines.length) { setError('Ajoutez au moins une ligne.'); return null }
    setBusy(true)
    setError(null)
    try {
      const header = {
        supplier_id: supplierId || null,
        location_id: locationId,
        received_on: receivedOn,
        invoice_ref: invoiceRef.trim(),
        notes: notes.trim(),
      }

      let id = receptionId
      if (id) {
        const { error: upErr } = await supabase.from('receptions').update(header).eq('id', id)
        if (upErr) throw upErr
        const { error: delErr } = await supabase.from('reception_lines').delete().eq('reception_id', id)
        if (delErr) throw delErr
      } else {
        const { data, error: insErr } = await supabase.from('receptions').insert(header).select('id').single()
        if (insErr) throw insErr
        id = data.id
      }

      const payload = lines.map((l) => ({
        reception_id: id,
        product_id: l.productId,
        quantity: parseNumber(l.quantity) ?? 0,
        pack_size: Math.max(1, Math.round(parseNumber(l.packSize) ?? 1)),
        purchase_price_ht: parseNumber(l.priceHt) ?? 0,
        update_product_price: l.updatePrice,
      })).filter((l) => l.quantity > 0)

      const { error: linesErr } = await supabase.from('reception_lines').insert(payload)
      if (linesErr) throw linesErr

      return id
    } catch (err) {
      setError(describeError(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function saveDraft() {
    const id = await save()
    if (id) { toast.success('Brouillon enregistre.'); onSaved() }
  }

  async function saveAndValidate() {
    const id = await save()
    if (!id) return
    setBusy(true)
    try {
      const { error: rpcErr } = await supabase.rpc('validate_reception', { p_reception_id: id })
      if (rpcErr) throw rpcErr
      toast.success('Reception validee : stock et prix d achat mis a jour.')
      onSaved()
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
      size="xl"
      title={number ? `Bon de reception ${number}` : 'Nouveau bon de reception'}
      footer={
        readOnly ? <Button onClick={onClose}>Fermer</Button> : (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button variant="secondary" icon={Save} loading={busy} onClick={() => void saveDraft()}>
              Enregistrer le brouillon
            </Button>
            <Button icon={CheckCircle2} loading={busy} onClick={() => void saveAndValidate()}>
              Valider et entrer en stock
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        {readOnly && <Alert kind="success">Bon valide : le stock a ete mis a jour. Il n est plus modifiable.</Alert>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Fournisseur">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={readOnly}>
              <option value="">— Non renseigne —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Emplacement de reception" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={readOnly}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Date de reception">
            <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Reference facture">
            <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} disabled={readOnly} />
          </Field>
        </div>

        {!readOnly && (
          <div className="space-y-2">
            <ScanInput
              onScan={handleScan} onTextChange={setSearch} value={search} autoFocus={false}
              placeholder="Scanner un produit recu, ou chercher par nom..."
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((p) => (
                  <button
                    key={p.id} onClick={() => addProduct(p)}
                    className="btn-secondary px-3 py-1.5 text-sm"
                  >
                    + {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {lines.length === 0 ? (
          <EmptyState title="Aucune ligne" description="Scannez ou cherchez les produits recus." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table head={['Produit', 'Colis', 'Bouteilles/colis', 'Total bouteilles', 'Prix achat HT', 'Total HT', 'MAJ prix', '']}>
              {lines.map((l) => {
                const qty = parseNumber(l.quantity) ?? 0
                const pack = parseNumber(l.packSize) ?? 1
                const price = parseNumber(l.priceHt) ?? 0
                return (
                  <tr key={l.key}>
                    <td className="td font-medium">{l.label}</td>
                    <td className="td">
                      <Input
                        value={l.quantity} inputMode="decimal" disabled={readOnly} className="w-20 text-right"
                        onChange={(e) => setLines((ls) => ls.map((x) =>
                          x.key === l.key ? { ...x, quantity: e.target.value } : x))}
                      />
                    </td>
                    <td className="td">
                      <Input
                        value={l.packSize} inputMode="numeric" disabled={readOnly} className="w-20 text-right"
                        onChange={(e) => setLines((ls) => ls.map((x) =>
                          x.key === l.key ? { ...x, packSize: e.target.value } : x))}
                      />
                    </td>
                    <td className="td tabular font-semibold">{formatQty(qty * pack)}</td>
                    <td className="td">
                      <Input
                        value={l.priceHt} inputMode="decimal" disabled={readOnly} className="w-24 text-right"
                        onChange={(e) => setLines((ls) => ls.map((x) =>
                          x.key === l.key ? { ...x, priceHt: e.target.value } : x))}
                      />
                    </td>
                    <td className="td tabular">{formatMoney(qty * pack * price, currency)}</td>
                    <td className="td">
                      <Checkbox
                        label="" checked={l.updatePrice} disabled={readOnly}
                        onChange={(e) => setLines((ls) => ls.map((x) =>
                          x.key === l.key ? { ...x, updatePrice: e.target.checked } : x))}
                      />
                    </td>
                    <td className="td">
                      {!readOnly && (
                        <button
                          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                          className="text-slate-400 hover:text-red-600" aria-label="Retirer la ligne"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
          <span className="text-sm text-slate-600">
            {formatQty(totalBottles)} bouteille(s) sur {lines.length} ligne(s)
          </span>
          <span className="tabular text-lg font-bold">Total HT : {formatMoney(total, currency)}</span>
        </div>

        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </Field>

        {!readOnly && (
          <Alert kind="info">
            « MAJ prix » coche met a jour le prix d achat du produit au moment de la validation.
            La quantite est multipliee par le nombre de bouteilles par colis pour l entree en stock.
          </Alert>
        )}
      </div>
    </Modal>
  )
}
