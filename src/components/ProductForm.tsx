/**
 * Fiche produit (creation / modification).
 * Affiche en direct la marge brute calculee a partir des prix saisis.
 */

import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, Save, Trash2, Wand2 } from 'lucide-react'
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { detectBarcodeKind, normalizeScan } from '@/lib/barcode'
import { formatMoney, formatPercent, parseNumber, UNIT_LABELS, UNIT_PACK_SIZE } from '@/lib/format'
import { htFromTtc, marginRate, roundTo, unitMarginHt } from '@/lib/calc'
import type { Product, ProductFull, ProductUnit } from '@/types/database'

interface FormState {
  name: string
  category_id: string
  appellation: string
  vintage: string
  volume_ml: string
  supplier_id: string
  purchase_price_ht: string
  sale_price_ttc: string
  vat_rate: string
  barcode: string
  internal_code: string
  unit: ProductUnit
  pack_size: string
  stock_alert_threshold: string
  photo_url: string
  active: boolean
  notes: string
}

function toForm(p: Partial<ProductFull> | null, defaultVat: number, defaultThreshold: number): FormState {
  return {
    name: p?.name ?? '',
    category_id: p?.category_id ?? '',
    appellation: p?.appellation ?? '',
    vintage: p?.vintage ? String(p.vintage) : '',
    volume_ml: p?.volume_ml ? String(p.volume_ml) : '750',
    supplier_id: p?.supplier_id ?? '',
    purchase_price_ht: p?.purchase_price_ht !== undefined ? String(p.purchase_price_ht) : '',
    sale_price_ttc: p?.sale_price_ttc !== undefined ? String(p.sale_price_ttc) : '',
    vat_rate: p?.vat_rate !== undefined ? String(p.vat_rate) : String(defaultVat),
    barcode: p?.barcode ?? '',
    internal_code: p?.internal_code ?? '',
    unit: (p?.unit as ProductUnit) ?? 'bouteille',
    pack_size: p?.pack_size ? String(p.pack_size) : '1',
    stock_alert_threshold:
      p?.stock_alert_threshold !== undefined ? String(p.stock_alert_threshold) : String(defaultThreshold),
    photo_url: p?.photo_url ?? '',
    active: p?.active ?? true,
    notes: '',
  }
}

export default function ProductForm({
  open, product, prefillBarcode, onClose, onSaved,
}: {
  open: boolean
  /** Produit a modifier, ou null pour une creation. */
  product: ProductFull | null
  /** Code scanne inconnu : prerempli le champ code-barres. */
  prefillBarcode?: string
  onClose: () => void
  onSaved: (product: Product) => void
}) {
  const { settings, categories } = useSettings()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => toForm(null, 20, 6))
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    const base = toForm(product, settings?.default_vat_rate ?? 20, settings?.low_stock_default ?? 6)
    if (!product && prefillBarcode) base.barcode = prefillBarcode
    setForm(base)
    setError(null)

    void supabase
      .from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setSuppliers(data ?? []))
  }, [open, product, prefillBarcode, settings])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // --- Indicateurs de marge calcules en direct -------------------------
  const marge = useMemo(() => {
    const achat = parseNumber(form.purchase_price_ht) ?? 0
    const vente = parseNumber(form.sale_price_ttc) ?? 0
    const tva = parseNumber(form.vat_rate) ?? 0
    return {
      venteHt: htFromTtc(vente, tva),
      margeHt: unitMarginHt(vente, tva, achat),
      taux: marginRate(vente, tva, achat),
    }
  }, [form.purchase_price_ht, form.sale_price_ttc, form.vat_rate])

  const barcodeKind = form.barcode ? detectBarcodeKind(form.barcode) : null

  /** Le conditionnement choisi impose le nombre de bouteilles par colis. */
  function changeUnit(unit: ProductUnit) {
    setForm((f) => ({ ...f, unit, pack_size: String(UNIT_PACK_SIZE[unit] ?? 1) }))
  }

  async function uploadPhoto(file: File) {
    setUploading(true)
    setError(null)
    try {
      // L'extension vient du nom de fichier choisi par l'utilisateur : on la
      // reduit a des caracteres inoffensifs pour qu'aucun chemin ne puisse etre
      // fabrique (« ../ ») dans la cle de stockage.
      const rawExt = file.name.split('.').pop()?.toLowerCase() ?? ''
      const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'jpg'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('produits').upload(path, file, {
        cacheControl: '31536000', upsert: false,
      })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('produits').getPublicUrl(path)
      set('photo_url', data.publicUrl)
      toast.success('Photo envoyee.')
    } catch (err) {
      setError(
        `${describeError(err)}\nSi le message parle du « bucket », creez un bucket public nomme `
        + `« produits » dans Supabase > Storage (voir le README), ou collez simplement l adresse d une image.`,
      )
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) { setError('Le nom du produit est obligatoire.'); return }
    const venteSaisie = parseNumber(form.sale_price_ttc)
    if (venteSaisie === null || venteSaisie < 0) { setError('Le prix de vente TTC est obligatoire.'); return }
    // On enregistre les prix a la precision de la devise : en FCFA, un prix a
    // 6,50 produirait des tickets dont les lignes ne font pas la somme du total.
    const decimales = settings?.currency_decimals ?? 2
    const vente = roundTo(venteSaisie, decimales)

    const payload = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      appellation: form.appellation.trim(),
      vintage: parseNumber(form.vintage),
      volume_ml: parseNumber(form.volume_ml),
      supplier_id: form.supplier_id || null,
      purchase_price_ht: roundTo(parseNumber(form.purchase_price_ht) ?? 0, decimales),
      sale_price_ttc: vente,
      vat_rate: parseNumber(form.vat_rate) ?? 20,
      barcode: form.barcode.trim() ? normalizeScan(form.barcode) : null,
      internal_code: form.internal_code.trim() || null,
      unit: form.unit,
      pack_size: Math.max(1, Math.round(parseNumber(form.pack_size) ?? 1)),
      stock_alert_threshold: parseNumber(form.stock_alert_threshold) ?? 0,
      photo_url: form.photo_url.trim(),
      active: form.active,
    }

    setBusy(true)
    try {
      const query = product
        ? supabase.from('products').update(payload).eq('id', product.id).select().single()
        : supabase.from('products').insert(payload).select().single()
      const { data, error: dbErr } = await query
      if (dbErr) throw dbErr

      toast.success(product ? 'Produit modifie.' : `Produit cree (${data.internal_code ?? data.barcode}).`)
      onSaved(data as Product)
      onClose()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!product) return
    if (!window.confirm(`Supprimer definitivement « ${product.name} » ? Son historique de mouvements sera egalement supprime.`)) return
    setBusy(true)
    try {
      const { error: dbErr } = await supabase.from('products').delete().eq('id', product.id)
      if (dbErr) throw dbErr
      toast.success('Produit supprime.')
      onSaved({ ...(product as Product), active: false })
      onClose()
    } catch (err) {
      setError(
        `${describeError(err)}\nAstuce : si le produit a deja ete vendu, desactivez-le `
        + `plutot que de le supprimer (case « Produit actif »).`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? `Modifier : ${product.name}` : 'Nouveau produit'}
      footer={
        <>
          {product && isAdmin && (
            <Button variant="danger" icon={Trash2} onClick={() => void remove()} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button icon={Save} loading={busy} onClick={(e) => void submit(e as unknown as React.FormEvent)}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert kind="error"><span className="whitespace-pre-line">{error}</span></Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du produit" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required
                   placeholder="Chateau Les Ormes - Bordeaux Superieur" />
          </Field>

          <Field label="Categorie">
            <Select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">— Non classe —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>

          <Field label="Appellation / origine">
            <Input value={form.appellation} onChange={(e) => set('appellation', e.target.value)}
                   placeholder="Saint-Emilion Grand Cru" />
          </Field>

          <Field label="Millesime" hint="Laisser vide pour les produits sans millesime.">
            <Input value={form.vintage} onChange={(e) => set('vintage', e.target.value)}
                   inputMode="numeric" placeholder="2020" />
          </Field>

          <Field label="Contenance (ml)" hint="750 pour une bouteille standard, 1000 pour 1 L.">
            <Input value={form.volume_ml} onChange={(e) => set('volume_ml', e.target.value)} inputMode="numeric" />
          </Field>

          <Field label="Fournisseur">
            <Select value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
              <option value="">— Aucun —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>

          <Field label="Conditionnement de vente">
            <Select value={form.unit} onChange={(e) => changeUnit(e.target.value as ProductUnit)}>
              {Object.entries(UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>

          <Field label="Bouteilles par colis" hint="Base de la conversion carton / bouteille.">
            <Input value={form.pack_size} onChange={(e) => set('pack_size', e.target.value)} inputMode="numeric" />
          </Field>

          <Field label="Seuil d alerte de stock" hint="Alerte au tableau de bord sous ce niveau (en bouteilles).">
            <Input value={form.stock_alert_threshold} onChange={(e) => set('stock_alert_threshold', e.target.value)}
                   inputMode="decimal" />
          </Field>
        </div>

        {/* --- Prix et marge --- */}
        <div className="rounded-lg border border-line bg-raised p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Prix d achat HT" required>
              <Input value={form.purchase_price_ht} onChange={(e) => set('purchase_price_ht', e.target.value)}
                     inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field label="Prix de vente TTC" required>
              <Input value={form.sale_price_ttc} onChange={(e) => set('sale_price_ttc', e.target.value)}
                     inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field label="Taux de TVA (%)">
              <Input value={form.vat_rate} onChange={(e) => set('vat_rate', e.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-ink-2">Vente HT : <b className="tabular">{formatMoney(marge.venteHt, currencyOf(settings))}</b></span>
            <span className="text-ink-2">
              Marge brute : <b className={`tabular ${marge.margeHt < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {formatMoney(marge.margeHt, currencyOf(settings))}
              </b>
            </span>
            <span className="text-ink-2">Taux de marge : <b className="tabular">{formatPercent(marge.taux, 1)}</b></span>
          </div>
        </div>

        {/* --- Codes --- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Code-barres (EAN-13 / UPC)"
            hint={
              barcodeKind
                ? `Code reconnu : ${barcodeKind}${barcodeKind === 'AUTRE' ? ' (accepte, mais la cle de controle ne correspond pas a un EAN)' : ''}`
                : 'Laisser vide : un code interne sera genere automatiquement.'
            }
          >
            <Input value={form.barcode} onChange={(e) => set('barcode', e.target.value)}
                   inputMode="numeric" placeholder="3760012345670" className="font-mono" />
          </Field>

          <Field label="Code interne" hint="Genere automatiquement si le produit n a pas de code-barres.">
            <div className="flex gap-2">
              <Input value={form.internal_code} onChange={(e) => set('internal_code', e.target.value)}
                     placeholder={`${settings?.internal_code_prefix ?? 'CAV'}000123`} className="font-mono" />
              {!product && (
                <Button
                  type="button" variant="secondary" icon={Wand2}
                  title="Generer maintenant"
                  onClick={async () => {
                    const { data, error: rpcErr } = await supabase.rpc('next_internal_code')
                    if (rpcErr) toast.error(describeError(rpcErr))
                    else set('internal_code', String(data))
                  }}
                />
              )}
            </div>
          </Field>
        </div>

        {/* --- Photo --- */}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Photo du produit" hint="Televersez une image ou collez l adresse d une photo existante.">
            <Input value={form.photo_url} onChange={(e) => set('photo_url', e.target.value)}
                   placeholder="https://..." />
            <div className="mt-2">
              <label className="btn-secondary cursor-pointer">
                {uploading ? 'Envoi...' : <><ImagePlus className="h-4 w-4" /> Choisir une image</>}
                <input
                  type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f) }}
                />
              </label>
            </div>
          </Field>
          {form.photo_url && (
            <img
              src={form.photo_url} alt=""
              className="h-28 w-28 rounded-lg border border-line object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
        </div>

        <Checkbox
          label="Produit actif (visible en caisse)"
          checked={form.active}
          onChange={(e) => set('active', e.target.checked)}
        />

        {product && (
          <Textarea
            readOnly
            rows={2}
            className="bg-raised text-xs text-ink-3"
            value={`Stock total : ${product.total_stock ?? 0} unite(s) · Valeur au prix d achat : ${
              formatMoney(product.stock_value_ht ?? 0, currencyOf(settings))}`}
          />
        )}
      </form>
    </Modal>
  )
}

/** Petit utilitaire local pour eviter d importer le hook de devise partout. */
function currencyOf(settings: { currency_symbol?: string; currency_decimals?: number; currency?: string } | null) {
  return {
    symbol: settings?.currency_symbol ?? '€',
    decimals: settings?.currency_decimals ?? 2,
    code: settings?.currency ?? 'EUR',
  }
}
