/**
 * Impression d'etiquettes code-barres (Code 128 / EAN-13) sur planche A4.
 * Plusieurs etiquettes par page, nombre d'exemplaires parametrable.
 */

import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { Alert, Button, Checkbox, Field, Input, Modal, Select } from '@/components/ui'
import { LABEL_LAYOUTS, downloadLabelsPdf, printLabelsPdf, type LabelItem } from '@/lib/pdf'
import { formatMoney, formatVolume } from '@/lib/format'
import { useSettings } from '@/hooks/useSettings'
import { stampedFilename } from '@/lib/exports'
import type { ProductFull } from '@/types/database'

export default function LabelsDialog({
  open, products, onClose,
}: { open: boolean; products: ProductFull[]; onClose: () => void }) {
  const { currency } = useSettings()
  const [layoutKey, setLayoutKey] = useState<keyof typeof LABEL_LAYOUTS>('grille_24')
  const [copies, setCopies] = useState('1')
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [startOffset, setStartOffset] = useState('0')

  const withoutCode = products.filter((p) => !p.barcode && !p.internal_code)

  const items = useMemo<LabelItem[]>(() => {
    const n = Math.max(1, Math.min(50, Number(copies) || 1))
    const list: LabelItem[] = []
    for (const p of products) {
      const code = p.barcode || p.internal_code
      if (!code) continue
      const extra = [p.appellation, p.vintage ? String(p.vintage) : '', formatVolume(p.volume_ml)]
        .filter(Boolean).join(' · ')
      for (let i = 0; i < n; i++) {
        list.push({
          code,
          name: p.name,
          price: formatMoney(p.sale_price_ttc, currency),
          extra,
        })
      }
    }
    return list
  }, [products, copies, currency])

  const layout = LABEL_LAYOUTS[layoutKey]
  const perPage = layout.columns * layout.rows
  const offset = Math.max(0, Math.min(perPage - 1, Number(startOffset) || 0))
  const pages = Math.ceil((items.length + offset) / perPage)

  const options = { showName, showPrice, startOffset: offset }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Imprimer des etiquettes"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          <Button
            variant="secondary" icon={Download} disabled={!items.length}
            onClick={() => downloadLabelsPdf(items, layout, stampedFilename('etiquettes', 'pdf'), options)}
          >
            Telecharger le PDF
          </Button>
          <Button icon={Printer} disabled={!items.length} onClick={() => printLabelsPdf(items, layout, options)}>
            Imprimer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          {products.length} produit(s) selectionne(s) — <b>{items.length} etiquette(s)</b> sur{' '}
          <b>{pages || 0} page(s)</b> A4.
        </p>

        {withoutCode.length > 0 && (
          <Alert kind="warning">
            {withoutCode.length} produit(s) sans code ne seront pas imprimes. Ouvrez leur fiche
            et generez un code interne.
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Disposition">
            <Select value={layoutKey} onChange={(e) => setLayoutKey(e.target.value as keyof typeof LABEL_LAYOUTS)}>
              {Object.entries(LABEL_LAYOUTS).map(([k, l]) => <option key={k} value={k}>{l.label}</option>)}
            </Select>
          </Field>

          <Field label="Exemplaires par produit">
            <Input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" />
          </Field>

          <Field
            label="Commencer a l etiquette n°"
            hint="Pour reutiliser une planche deja partiellement entamee."
          >
            <Input value={startOffset} onChange={(e) => setStartOffset(e.target.value)} inputMode="numeric" />
          </Field>

          <div className="flex flex-col justify-end gap-2 pb-1">
            <Checkbox label="Afficher le nom du produit" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
            <Checkbox label="Afficher le prix de vente" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
          </div>
        </div>

        <Alert kind="info">
          Les codes a 13 chiffres sont imprimes en EAN-13, les codes internes en Code 128.
          Toutes les douchettes du marche lisent ces deux formats.
        </Alert>
      </div>
    </Modal>
  )
}
