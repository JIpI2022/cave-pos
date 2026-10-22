/**
 * Catalogue produits : recherche, filtres, fiche produit, import/export CSV,
 * impression d'etiquettes. Reserve aux gerants et administrateurs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Plus, Tag, Upload } from 'lucide-react'
import {
  Alert, Badge, Button, Checkbox, EmptyState, Modal, PageHeader, Select, Spinner, Table,
} from '@/components/ui'
import ProductForm from '@/components/ProductForm'
import LabelsDialog from '@/components/LabelsDialog'
import ScanInput from '@/components/ScanInput'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import {
  formatMoney, formatQty, formatVolume, parseNumber, searchKey, UNIT_LABELS,
} from '@/lib/format'
import {
  csvToObjects, downloadCsv, downloadXlsx, readFileAsText, stampedFilename,
  type ExportColumn,
} from '@/lib/exports'
import { normalizeScan } from '@/lib/barcode'
import type { ProductFull } from '@/types/database'

export default function Products() {
  const { categories, currency, settings } = useSettings()
  const toast = useToast()

  const [rows, setRows] = useState<ProductFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [onlyInactive, setOnlyInactive] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductFull | null>(null)
  const [prefillBarcode, setPrefillBarcode] = useState<string>('')
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: dbErr } = await supabase
      .from('v_products_full')
      .select('*')
      .order('name')
    if (dbErr) setError(describeError(dbErr))
    else { setError(null); setRows((data ?? []) as ProductFull[]) }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // --- Filtrage ---------------------------------------------------------
  const filtered = useMemo(() => {
    const key = searchKey(search)
    return rows.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false
      if (onlyLow && !p.is_low_stock) return false
      if (onlyInactive ? p.active : !p.active) return false
      if (!key) return true
      return (
        searchKey(p.name).includes(key) ||
        searchKey(p.appellation).includes(key) ||
        searchKey(p.supplier_name).includes(key) ||
        (p.barcode ?? '').includes(key) ||
        searchKey(p.internal_code).includes(key)
      )
    })
  }, [rows, search, categoryId, onlyLow, onlyInactive])

  const selectedProducts = useMemo(
    () => rows.filter((p) => selected.has(p.id)),
    [rows, selected],
  )

  /** Scan dans le catalogue : ouvre la fiche, ou propose la creation. */
  function handleScan(code: string) {
    const normalized = normalizeScan(code)
    const found = rows.find(
      (p) => p.barcode === normalized || p.internal_code?.toUpperCase() === normalized.toUpperCase(),
    )
    if (found) {
      setEditing(found)
      setPrefillBarcode('')
      setFormOpen(true)
    } else {
      // Code inconnu : on propose immediatement la creation du produit.
      setEditing(null)
      setPrefillBarcode(/^\d{8,14}$/.test(normalized) ? normalized : '')
      setFormOpen(true)
      toast.info(`Code « ${normalized} » inconnu : creez le produit.`)
    }
  }

  // --- Export -----------------------------------------------------------
  const exportColumns: ExportColumn<ProductFull>[] = [
    { header: 'Nom', value: (p) => p.name },
    { header: 'Categorie', value: (p) => p.category_label ?? '' },
    { header: 'Appellation', value: (p) => p.appellation },
    { header: 'Millesime', value: (p) => p.vintage ?? '' },
    { header: 'Contenance (ml)', value: (p) => p.volume_ml ?? '' },
    { header: 'Fournisseur', value: (p) => p.supplier_name ?? '' },
    { header: 'Code-barres', value: (p) => p.barcode ?? '' },
    { header: 'Code interne', value: (p) => p.internal_code ?? '' },
    { header: 'Conditionnement', value: (p) => UNIT_LABELS[p.unit] ?? p.unit },
    { header: 'Bouteilles par colis', value: (p) => p.pack_size },
    { header: 'Prix achat HT', value: (p) => p.purchase_price_ht },
    { header: 'Prix vente TTC', value: (p) => p.sale_price_ttc },
    { header: 'TVA %', value: (p) => p.vat_rate },
    { header: 'Marge unitaire HT', value: (p) => p.unit_margin_ht },
    { header: 'Stock total', value: (p) => p.total_stock },
    { header: 'Seuil alerte', value: (p) => p.stock_alert_threshold },
    { header: 'Valeur stock HT', value: (p) => p.stock_value_ht },
    { header: 'Actif', value: (p) => (p.active ? 'oui' : 'non') },
  ]

  return (
    <div>
      <PageHeader
        title="Produits"
        subtitle={`${rows.length} reference(s) au catalogue`}
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>Importer</Button>
            <Button
              variant="secondary" icon={Download}
              onClick={() => downloadCsv(filtered, exportColumns, stampedFilename('produits', 'csv'))}
            >
              CSV
            </Button>
            <Button
              variant="secondary" icon={FileSpreadsheet}
              onClick={() => downloadXlsx(filtered, exportColumns, stampedFilename('produits', 'xlsx'), 'Produits')}
            >
              Excel
            </Button>
            <Button
              variant="secondary" icon={Tag}
              disabled={!selectedProducts.length}
              onClick={() => setLabelsOpen(true)}
            >
              Etiquettes ({selectedProducts.length})
            </Button>
            <Button icon={Plus} onClick={() => { setEditing(null); setPrefillBarcode(''); setFormOpen(true) }}>
              Nouveau produit
            </Button>
          </>
        }
      />

      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      {/* --- Barre de recherche et filtres --- */}
      <div className="card mb-3 space-y-3 p-3">
        <ScanInput
          onScan={handleScan}
          onTextChange={setSearch}
          value={search}
          autoFocus={false}
          placeholder="Scanner un code-barres, ou chercher par nom / appellation / fournisseur..."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-auto">
            <option value="">Toutes les categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <Checkbox label="Sous le seuil d alerte" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
          <Checkbox label="Produits desactives" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} />
          <span className="ml-auto text-sm text-slate-500">{filtered.length} resultat(s)</span>
        </div>
      </div>

      {/* --- Tableau --- */}
      <div className="card">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Aucun produit"
            description="Modifiez vos filtres, ou creez votre premiere reference."
            action={<Button icon={Plus} className="mt-3" onClick={() => { setEditing(null); setFormOpen(true) }}>Nouveau produit</Button>}
          />
        ) : (
          <Table
            head={[
              <th key="c" className="th w-10">
                <input
                  type="checkbox"
                  aria-label="Tout selectionner"
                  className="h-4 w-4 rounded border-slate-300 text-wine-700"
                  checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                  onChange={(e) => {
                    const next = new Set(selected)
                    filtered.forEach((p) => (e.target.checked ? next.add(p.id) : next.delete(p.id)))
                    setSelected(next)
                  }}
                />
              </th>,
              'Produit', 'Code', 'Categorie', 'Achat HT', 'Vente TTC', 'Marge HT', 'Stock', '',
            ]}
          >
            {filtered.map((p) => (
              <tr key={p.id} className={`hover:bg-slate-50 ${!p.active ? 'opacity-60' : ''}`}>
                <td className="td">
                  <input
                    type="checkbox"
                    aria-label={`Selectionner ${p.name}`}
                    className="h-4 w-4 rounded border-slate-300 text-wine-700"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selected)
                      if (e.target.checked) next.add(p.id); else next.delete(p.id)
                      setSelected(next)
                    }}
                  />
                </td>
                <td className="td">
                  <button
                    className="text-left font-medium text-slate-900 hover:text-wine-700"
                    onClick={() => { setEditing(p); setPrefillBarcode(''); setFormOpen(true) }}
                  >
                    {p.name}
                  </button>
                  <p className="text-xs text-slate-500">
                    {[p.appellation, p.vintage, formatVolume(p.volume_ml), UNIT_LABELS[p.unit]]
                      .filter(Boolean).join(' · ')}
                  </p>
                </td>
                <td className="td font-mono text-xs text-slate-600">
                  {p.barcode || p.internal_code}
                  {!p.barcode && <Badge color="blue">interne</Badge>}
                </td>
                <td className="td text-xs text-slate-600">{p.category_label ?? '—'}</td>
                <td className="td tabular whitespace-nowrap">{formatMoney(p.purchase_price_ht, currency)}</td>
                <td className="td tabular whitespace-nowrap font-semibold">{formatMoney(p.sale_price_ttc, currency)}</td>
                <td className={`td tabular whitespace-nowrap ${p.unit_margin_ht < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatMoney(p.unit_margin_ht, currency)}
                </td>
                <td className="td tabular whitespace-nowrap">
                  {p.is_low_stock ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {formatQty(p.total_stock)}
                    </span>
                  ) : formatQty(p.total_stock)}
                  <span className="ml-1 text-xs text-slate-400">/ {formatQty(p.stock_alert_threshold)}</span>
                </td>
                <td className="td">
                  {!p.active && <Badge color="slate">inactif</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <ProductForm
        open={formOpen}
        product={editing}
        prefillBarcode={prefillBarcode}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />

      <LabelsDialog open={labelsOpen} products={selectedProducts} onClose={() => setLabelsOpen(false)} />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void load()}
        defaultVat={settings?.default_vat_rate ?? 20}
        defaultThreshold={settings?.low_stock_default ?? 6}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Import CSV
// ---------------------------------------------------------------------------

interface ImportRow {
  nom: string
  categorie?: string
  appellation?: string
  millesime?: string
  contenance?: string
  fournisseur?: string
  code_barres?: string
  prix_achat_ht?: string
  prix_vente_ttc?: string
  tva?: string
  seuil_alerte?: string
  bouteilles_par_colis?: string
}

const MODELE_CSV =
  'nom;categorie;appellation;millesime;contenance;fournisseur;code_barres;prix_achat_ht;prix_vente_ttc;tva;seuil_alerte;bouteilles_par_colis\r\n'
  + 'Chateau Exemple;vin_rouge;Bordeaux;2020;750;Domaines & Terroirs;3760012345670;5,20;9,90;20;12;1\r\n'

function ImportDialog({
  open, onClose, onImported, defaultVat, defaultThreshold,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
  defaultVat: number
  defaultThreshold: number
}) {
  const { categories } = useSettings()
  const toast = useToast()
  const [rows, setRows] = useState<ImportRow[]>([])
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<string[]>([])
  const [updateExisting, setUpdateExisting] = useState(true)

  async function pick(file: File) {
    setReport([])
    setFilename(file.name)
    const text = await readFileAsText(file)
    const objects = csvToObjects(text) as unknown as ImportRow[]
    setRows(objects.filter((r) => (r.nom ?? '').trim() !== ''))
  }

  async function run() {
    setBusy(true)
    const messages: string[] = []
    let created = 0
    let updated = 0

    // Les fournisseurs sont rapproches par nom ; on les cree au besoin.
    const { data: suppliersData } = await supabase.from('suppliers').select('id, name')
    const suppliers = new Map((suppliersData ?? []).map((s) => [searchKey(s.name), s.id]))
    const categoryByCode = new Map(categories.map((c) => [c.code, c.id]))
    const categoryByLabel = new Map(categories.map((c) => [searchKey(c.label), c.id]))

    for (const [index, row] of rows.entries()) {
      const line = index + 2 // +1 en-tete, +1 base 1
      try {
        let supplierId: string | null = null
        const supplierName = (row.fournisseur ?? '').trim()
        if (supplierName) {
          const key = searchKey(supplierName)
          if (suppliers.has(key)) supplierId = suppliers.get(key)!
          else {
            const { data: created2, error: supErr } = await supabase
              .from('suppliers').insert({ name: supplierName }).select('id').single()
            if (supErr) throw supErr
            supplierId = created2.id
            suppliers.set(key, created2.id)
          }
        }

        const catRaw = (row.categorie ?? '').trim()
        const categoryId = categoryByCode.get(catRaw) ?? categoryByLabel.get(searchKey(catRaw)) ?? null

        const payload = {
          name: row.nom.trim(),
          category_id: categoryId,
          appellation: (row.appellation ?? '').trim(),
          vintage: parseNumber(row.millesime ?? ''),
          volume_ml: parseNumber(row.contenance ?? '') ?? 750,
          supplier_id: supplierId,
          barcode: (row.code_barres ?? '').trim() ? normalizeScan(row.code_barres!) : null,
          purchase_price_ht: parseNumber(row.prix_achat_ht ?? '') ?? 0,
          sale_price_ttc: parseNumber(row.prix_vente_ttc ?? '') ?? 0,
          vat_rate: parseNumber(row.tva ?? '') ?? defaultVat,
          stock_alert_threshold: parseNumber(row.seuil_alerte ?? '') ?? defaultThreshold,
          pack_size: Math.max(1, Math.round(parseNumber(row.bouteilles_par_colis ?? '') ?? 1)),
        }

        // Rapprochement par code-barres, sinon par nom exact
        let existingId: string | null = null
        if (payload.barcode) {
          const { data } = await supabase.from('products').select('id').eq('barcode', payload.barcode).maybeSingle()
          existingId = data?.id ?? null
        }
        if (!existingId) {
          const { data } = await supabase.from('products').select('id').eq('name', payload.name).maybeSingle()
          existingId = data?.id ?? null
        }

        if (existingId) {
          if (!updateExisting) { messages.push(`Ligne ${line} : « ${payload.name} » existe deja, ignoree.`); continue }
          const { error: upErr } = await supabase.from('products').update(payload).eq('id', existingId)
          if (upErr) throw upErr
          updated++
        } else {
          const { error: insErr } = await supabase.from('products').insert(payload)
          if (insErr) throw insErr
          created++
        }
      } catch (err) {
        messages.push(`Ligne ${line} : ${describeError(err)}`)
      }
    }

    setReport([`${created} produit(s) cree(s), ${updated} mis a jour.`, ...messages])
    setBusy(false)
    toast.success(`${created} cree(s), ${updated} mis a jour.`)
    onImported()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importer des produits (CSV)"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          <Button disabled={!rows.length} loading={busy} onClick={() => void run()}>
            Importer {rows.length ? `${rows.length} ligne(s)` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert kind="info">
          Colonnes attendues (la casse et l ordre sont libres) :<br />
          <code className="text-xs">
            nom ; categorie ; appellation ; millesime ; contenance ; fournisseur ; code_barres ;
            prix_achat_ht ; prix_vente_ttc ; tva ; seuil_alerte ; bouteilles_par_colis
          </code>
          <br />
          Seul <b>nom</b> est obligatoire. La virgule decimale francaise est acceptee.
          Les categories se reconnaissent par leur code (<code>vin_rouge</code>) ou leur libelle.
        </Alert>

        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            <Upload className="h-4 w-4" /> Choisir un fichier CSV
            <input
              type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f) }}
            />
          </label>
          <Button
            variant="ghost" icon={Download}
            onClick={() => {
              const blob = new Blob(['﻿' + MODELE_CSV], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = 'modele_import_produits.csv'; a.click()
              setTimeout(() => URL.revokeObjectURL(url), 2000)
            }}
          >
            Telecharger un modele
          </Button>
          {filename && <span className="text-sm text-slate-600">{filename}</span>}
        </div>

        <Checkbox
          label="Mettre a jour les produits deja existants (rapprochement par code-barres puis par nom)"
          checked={updateExisting}
          onChange={(e) => setUpdateExisting(e.target.checked)}
        />

        {rows.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            <Table head={['Nom', 'Categorie', 'Code-barres', 'Achat HT', 'Vente TTC']}>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td className="td">{r.nom}</td>
                  <td className="td text-xs">{r.categorie ?? ''}</td>
                  <td className="td font-mono text-xs">{r.code_barres ?? ''}</td>
                  <td className="td tabular">{r.prix_achat_ht ?? ''}</td>
                  <td className="td tabular">{r.prix_vente_ttc ?? ''}</td>
                </tr>
              ))}
            </Table>
            {rows.length > 50 && (
              <p className="px-3 py-2 text-xs text-slate-500">… et {rows.length - 50} autre(s) ligne(s).</p>
            )}
          </div>
        )}

        {report.length > 0 && (
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            {report.map((m, i) => (
              <p key={i} className={i === 0 ? 'font-semibold text-slate-800' : 'text-red-700'}>{m}</p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
