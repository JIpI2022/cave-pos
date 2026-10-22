/**
 * Generation des documents imprimables :
 *  - ticket de caisse 80 mm (PDF telechargeable + impression directe) ;
 *  - planches d'etiquettes A4 avec codes-barres Code 128.
 */

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import type { AppSettings, Payment, SaleItem, Sale } from '@/types/database'
import { formatMoney, formatDateTime, formatQty, currencyFromSettings, PAYMENT_LABELS } from './format'
import type { VatBucket } from './calc'

// ---------------------------------------------------------------------------
// Codes-barres (Code 128) rendus en image PNG via un canvas hors ecran
// ---------------------------------------------------------------------------

export interface BarcodeImageOptions {
  format?: 'CODE128' | 'EAN13' | 'EAN8' | 'UPC'
  widthFactor?: number
  height?: number
  displayValue?: boolean
  fontSize?: number
}

/** Rend un code-barres en data-URL PNG. Renvoie null si le code est invalide. */
export function barcodeDataUrl(value: string, options: BarcodeImageOptions = {}): string | null {
  if (!value) return null
  const canvas = document.createElement('canvas')
  try {
    JsBarcode(canvas, value, {
      format: options.format ?? 'CODE128',
      width: options.widthFactor ?? 2,
      height: options.height ?? 60,
      displayValue: options.displayValue ?? true,
      fontSize: options.fontSize ?? 14,
      font: 'monospace',
      textMargin: 2,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    })
    return canvas.toDataURL('image/png')
  } catch {
    // Code incompatible avec le format demande (ex. EAN-13 invalide) :
    // on retente en Code 128, qui accepte tous les caracteres ASCII.
    if ((options.format ?? 'CODE128') !== 'CODE128') {
      return barcodeDataUrl(value, { ...options, format: 'CODE128' })
    }
    return null
  }
}

/** Choisit le format de code-barres le plus adapte au code fourni. */
export function pickBarcodeFormat(code: string): 'CODE128' | 'EAN13' | 'EAN8' {
  const digits = code.replace(/\D/g, '')
  if (digits.length === 13 && digits === code) return 'EAN13'
  if (digits.length === 8 && digits === code) return 'EAN8'
  return 'CODE128'
}

// ---------------------------------------------------------------------------
// Ticket de caisse 80 mm
// ---------------------------------------------------------------------------

export interface TicketData {
  sale: Pick<Sale, 'ticket_ref' | 'created_at' | 'total_ht' | 'total_vat' | 'total_ttc' | 'discount_total' | 'status'>
  items: Pick<SaleItem, 'label' | 'quantity' | 'unit_price_ttc' | 'line_ttc' | 'line_discount' | 'vat_rate' | 'unit' | 'pack_size'>[]
  payments: Pick<Payment, 'method' | 'amount' | 'tendered' | 'change_given'>[]
  vatBreakdown?: VatBucket[]
  cashierName?: string
  customerName?: string
}

const TICKET_WIDTH_MM = 80
const MARGIN = 4
const LINE = 3.6

/** Construit le PDF du ticket (largeur 80 mm, hauteur calculee d'apres le contenu). */
export function buildTicketPdf(data: TicketData, settings: AppSettings | null): jsPDF {
  const currency = currencyFromSettings(settings)
  const footerLines = (settings?.ticket_footer ?? '').split('\n').filter(Boolean)

  // Hauteur estimee : en-tete + lignes + totaux + paiements + pied
  const estimated =
    44 +
    data.items.length * LINE * 2 +
    (data.vatBreakdown?.length ?? 1) * LINE +
    data.payments.length * LINE +
    footerLines.length * LINE +
    30

  const doc = new jsPDF({ unit: 'mm', format: [TICKET_WIDTH_MM, Math.max(120, estimated)] })
  let y = MARGIN + 3
  const W = TICKET_WIDTH_MM
  const right = W - MARGIN

  const center = (text: string, size = 9, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.text(text, W / 2, y, { align: 'center' })
    y += size <= 8 ? LINE : LINE + 0.6
  }
  const left = (text: string, size = 8, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.text(text, MARGIN, y)
    y += LINE
  }
  const row = (l: string, r: string, size = 8, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.text(l, MARGIN, y)
    doc.text(r, right, y, { align: 'right' })
    y += LINE
  }
  const rule = () => {
    doc.setLineWidth(0.1)
    doc.setLineDashPattern([0.6, 0.6], 0)
    doc.line(MARGIN, y, right, y)
    doc.setLineDashPattern([], 0)
    y += 2.4
  }

  // --- En-tete ---
  center(settings?.company_name ?? 'Ma Cave', 11, 'bold')
  if (settings?.address) center(settings.address, 7)
  if (settings?.phone) center(`Tel. ${settings.phone}`, 7)
  if (settings?.tax_id) center(settings.tax_id, 7)
  y += 1
  rule()

  row(`Ticket ${data.sale.ticket_ref}`, formatDateTime(data.sale.created_at), 8, 'bold')
  if (data.cashierName) left(`Caissier : ${data.cashierName}`, 7)
  if (data.customerName) left(`Client : ${data.customerName}`, 7)
  if (data.sale.status === 'annulee') {
    y += 1
    center('*** VENTE ANNULEE ***', 10, 'bold')
  }
  rule()

  // --- Lignes ---
  for (const it of data.items) {
    const packNote = it.pack_size > 1 ? ` (x${it.pack_size})` : ''
    left(truncate(it.label + packNote, 44), 8, 'bold')
    const qtyText = `${formatQty(it.quantity)} x ${formatMoney(it.unit_price_ttc, currency)}`
    row(`  ${qtyText}`, formatMoney(it.line_ttc, currency), 8)
    if (it.line_discount > 0) {
      row('  dont remise', `- ${formatMoney(it.line_discount, currency)}`, 7)
    }
  }
  rule()

  // --- Totaux ---
  if (data.sale.discount_total > 0) {
    row('Remises', `- ${formatMoney(data.sale.discount_total, currency)}`, 8)
  }
  row('TOTAL A PAYER', formatMoney(data.sale.total_ttc, currency), 11, 'bold')
  y += 1
  row('Total HT', formatMoney(data.sale.total_ht, currency), 7)
  row('Total TVA', formatMoney(data.sale.total_vat, currency), 7)

  if (data.vatBreakdown?.length) {
    for (const b of data.vatBreakdown) {
      row(`  TVA ${formatQty(b.rate)} % sur ${formatMoney(b.base, currency)}`, formatMoney(b.vat, currency), 7)
    }
  }
  rule()

  // --- Paiements ---
  for (const p of data.payments) {
    row(PAYMENT_LABELS[p.method] ?? p.method, formatMoney(p.amount, currency), 8)
    if (p.method === 'especes' && p.tendered) {
      row('  Remis', formatMoney(p.tendered, currency), 7)
      row('  Rendu', formatMoney(p.change_given, currency), 8, 'bold')
    }
  }
  rule()

  // --- Pied de ticket + code-barres du numero de ticket ---
  for (const line of footerLines) center(line, 7)
  y += 2

  const img = barcodeDataUrl(data.sale.ticket_ref, { format: 'CODE128', height: 40, displayValue: false })
  if (img) {
    const bw = 50
    doc.addImage(img, 'PNG', (W - bw) / 2, y, bw, 10)
    y += 12
    center(data.sale.ticket_ref, 7)
  }

  return doc
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

/** Telecharge le ticket en PDF. */
export function downloadTicketPdf(data: TicketData, settings: AppSettings | null, filename: string): void {
  buildTicketPdf(data, settings).save(filename)
}

/**
 * Impression directe du ticket.
 * On passe par un iframe cache : le navigateur ouvre la boite d'impression
 * sans quitter l'application (indispensable sur tablette et smartphone).
 */
export function printTicketPdf(data: TicketData, settings: AppSettings | null): void {
  const doc = buildTicketPdf(data, settings)
  const url = doc.output('bloburl') as unknown as string
  printFromUrl(url)
}

function printFromUrl(url: string): void {
  const existing = document.getElementById('cave-print-frame')
  if (existing) existing.remove()

  const frame = document.createElement('iframe')
  frame.id = 'cave-print-frame'
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      window.open(url, '_blank')
    }
  }
  document.body.appendChild(frame)
}

// ---------------------------------------------------------------------------
// Planches d'etiquettes A4 (Code 128)
// ---------------------------------------------------------------------------

export interface LabelItem {
  code: string
  name: string
  price?: string
  extra?: string
}

export interface LabelLayout {
  label: string
  columns: number
  rows: number
  marginX: number
  marginY: number
  gapX: number
  gapY: number
}

/** Dispositions d'etiquettes proposees (format A4 portrait : 210 x 297 mm). */
export const LABEL_LAYOUTS: Record<string, LabelLayout> = {
  grille_40: { label: '40 par page (48 x 25 mm)', columns: 4, rows: 10, marginX: 8, marginY: 12, gapX: 2, gapY: 1 },
  grille_24: { label: '24 par page (64 x 34 mm)', columns: 3, rows: 8, marginX: 8, marginY: 12, gapX: 3, gapY: 2 },
  grille_14: { label: '14 par page (99 x 38 mm)', columns: 2, rows: 7, marginX: 5, marginY: 12, gapX: 2, gapY: 2 },
}

/**
 * Construit une planche d'etiquettes.
 * `copies` permet d'imprimer plusieurs exemplaires de chaque etiquette
 * (utile pour etiqueter un carton entier).
 */
export function buildLabelsPdf(
  items: LabelItem[],
  layout: LabelLayout = LABEL_LAYOUTS.grille_24,
  options: { startOffset?: number; showName?: boolean; showPrice?: boolean } = {},
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = 210
  const pageH = 297
  const cellW = (pageW - 2 * layout.marginX - (layout.columns - 1) * layout.gapX) / layout.columns
  const cellH = (pageH - 2 * layout.marginY - (layout.rows - 1) * layout.gapY) / layout.rows
  const perPage = layout.columns * layout.rows

  let index = options.startOffset ?? 0

  for (const item of items) {
    const page = Math.floor(index / perPage)
    const slot = index % perPage
    if (page > 0 && slot === 0) doc.addPage()

    const col = slot % layout.columns
    const line = Math.floor(slot / layout.columns)
    const x = layout.marginX + col * (cellW + layout.gapX)
    const y = layout.marginY + line * (cellH + layout.gapY)

    drawLabel(doc, item, x, y, cellW, cellH, options)
    index++
  }

  return doc
}

function drawLabel(
  doc: jsPDF,
  item: LabelItem,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { showName?: boolean; showPrice?: boolean },
): void {
  const showName = options.showName ?? true
  const showPrice = options.showPrice ?? true
  const pad = 1.5
  let cursor = y + pad + 2.5

  if (showName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(w > 80 ? 9 : 7)
    const lines = doc.splitTextToSize(item.name, w - 2 * pad) as string[]
    for (const l of lines.slice(0, 2)) {
      doc.text(l, x + pad, cursor)
      cursor += w > 80 ? 3.6 : 2.9
    }
  }

  if (item.extra) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text(doc.splitTextToSize(item.extra, w - 2 * pad)[0] as string, x + pad, cursor)
    cursor += 2.6
  }

  // Code-barres : hauteur = place restante moins la ligne de prix
  const priceH = showPrice && item.price ? 5 : 0
  const barH = Math.max(6, y + h - pad - priceH - cursor)
  const img = barcodeDataUrl(item.code, {
    format: pickBarcodeFormat(item.code),
    height: 70,
    widthFactor: 2,
    displayValue: true,
    fontSize: 18,
  })
  if (img) {
    doc.addImage(img, 'PNG', x + pad, cursor, w - 2 * pad, barH)
  } else {
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    doc.text(item.code, x + pad, cursor + 4)
  }

  if (showPrice && item.price) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(w > 80 ? 11 : 9)
    doc.text(item.price, x + w - pad, y + h - pad, { align: 'right' })
  }
}

export function downloadLabelsPdf(
  items: LabelItem[],
  layout: LabelLayout,
  filename: string,
  options?: { startOffset?: number; showName?: boolean; showPrice?: boolean },
): void {
  buildLabelsPdf(items, layout, options).save(filename)
}

export function printLabelsPdf(
  items: LabelItem[],
  layout: LabelLayout,
  options?: { startOffset?: number; showName?: boolean; showPrice?: boolean },
): void {
  const doc = buildLabelsPdf(items, layout, options)
  printFromUrl(doc.output('bloburl') as unknown as string)
}

// ---------------------------------------------------------------------------
// Rapport Z (PDF A4) - utilise a la cloture de caisse
// ---------------------------------------------------------------------------

export interface ZReportData {
  title: string
  subtitle: string
  rows: { label: string; value: string; strong?: boolean }[]
  footer?: string
}

export function buildZReportPdf(data: ZReportData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(data.title, 20, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(data.subtitle, 20, y)
  y += 10

  doc.setLineWidth(0.3)
  doc.line(20, y, 190, y)
  y += 7

  for (const r of data.rows) {
    doc.setFont('helvetica', r.strong ? 'bold' : 'normal')
    doc.setFontSize(r.strong ? 12 : 10)
    doc.text(r.label, 20, y)
    doc.text(r.value, 190, y, { align: 'right' })
    y += r.strong ? 8 : 6
    if (y > 275) { doc.addPage(); y = 22 }
  }

  if (data.footer) {
    y += 6
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    for (const line of doc.splitTextToSize(data.footer, 170) as string[]) {
      doc.text(line, 20, y)
      y += 5
    }
  }
  return doc
}
