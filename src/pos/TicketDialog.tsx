/**
 * Ticket de caisse : apercu a l'ecran, impression 80 mm et telechargement PDF.
 */

import { CloudOff, Download, Printer, ShoppingCart } from 'lucide-react'
import { Alert, Button, Modal } from '@/components/ui'
import { downloadTicketPdf, printTicketPdf, type TicketData } from '@/lib/pdf'
import { ticketFilename } from '@/lib/exports'
import { formatDateTime, formatMoney, formatQty, PAYMENT_LABELS } from '@/lib/format'
import { useSettings } from '@/hooks/useSettings'

export default function TicketDialog({
  open, data, offline, onClose, onNewSale,
}: {
  open: boolean
  data: TicketData | null
  /** Vrai si la vente est encore dans la file d attente locale. */
  offline?: boolean
  onClose: () => void
  onNewSale: () => void
}) {
  const { settings, currency } = useSettings()
  if (!data) return null

  const change = data.payments.reduce((s, p) => s + (p.change_given ?? 0), 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ticket ${data.sale.ticket_ref}`}
      footer={
        <>
          <Button
            variant="secondary" icon={Download}
            onClick={() => downloadTicketPdf(data, settings, ticketFilename(data.sale.ticket_ref, data.sale.created_at))}
          >
            PDF
          </Button>
          <Button variant="secondary" icon={Printer} onClick={() => printTicketPdf(data, settings)}>
            Imprimer (80 mm)
          </Button>
          <Button icon={ShoppingCart} onClick={onNewSale}>Nouvelle vente</Button>
        </>
      }
    >
      <div className="space-y-3">
        {offline && (
          <Alert kind="warning">
            <span className="flex items-center gap-1 font-semibold"><CloudOff className="h-4 w-4" /> Vente enregistree hors ligne</span>
            Elle part automatiquement vers le serveur au retour du reseau. Le numero definitif
            du ticket sera attribue a ce moment-la ; le ticket imprime reste valable.
          </Alert>
        )}

        {change > 0 && (
          <div className="rounded-lg bg-emerald-50 p-3 text-center text-emerald-800">
            <p className="text-xs font-semibold uppercase tracking-wide">Rendu monnaie</p>
            <p className="tabular text-3xl font-bold">{formatMoney(change, currency)}</p>
          </div>
        )}

        {/* Apercu fidele au ticket papier */}
        <div className="mx-auto w-full max-w-[320px] rounded-lg border border-dashed border-line bg-card p-4 font-mono text-[11px] leading-relaxed text-ink">
          <p className="text-center text-sm font-bold">{settings?.company_name}</p>
          {settings?.address && <p className="text-center">{settings.address}</p>}
          {settings?.phone && <p className="text-center">Tel. {settings.phone}</p>}
          <hr className="my-2 border-dashed" />
          <div className="flex justify-between font-bold">
            <span>{data.sale.ticket_ref}</span>
            <span>{formatDateTime(data.sale.created_at)}</span>
          </div>
          {data.cashierName && <p>Caissier : {data.cashierName}</p>}
          {data.customerName && <p>Client : {data.customerName}</p>}
          <hr className="my-2 border-dashed" />

          {data.items.map((it, i) => (
            <div key={i} className="mb-1">
              <p className="font-bold">{it.label}{it.pack_size > 1 ? ` (x${it.pack_size})` : ''}</p>
              <div className="flex justify-between">
                <span>{formatQty(it.quantity)} x {formatMoney(it.unit_price_ttc, currency)}</span>
                <span>{formatMoney(it.line_ttc, currency)}</span>
              </div>
              {it.line_discount > 0 && (
                <div className="flex justify-between text-ink-3">
                  <span>dont remise</span><span>- {formatMoney(it.line_discount, currency)}</span>
                </div>
              )}
            </div>
          ))}

          <hr className="my-2 border-dashed" />
          {data.sale.discount_total > 0 && (
            <div className="flex justify-between">
              <span>Remises</span><span>- {formatMoney(data.sale.discount_total, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL</span><span>{formatMoney(data.sale.total_ttc, currency)}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>Total HT</span><span>{formatMoney(data.sale.total_ht, currency)}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>Total TVA</span><span>{formatMoney(data.sale.total_vat, currency)}</span>
          </div>
          {data.vatBreakdown?.map((b) => (
            <div key={b.rate} className="flex justify-between text-ink-3">
              <span>TVA {formatQty(b.rate)} % sur {formatMoney(b.base, currency)}</span>
              <span>{formatMoney(b.vat, currency)}</span>
            </div>
          ))}

          <hr className="my-2 border-dashed" />
          {data.payments.map((p, i) => (
            <div key={i}>
              <div className="flex justify-between">
                <span>{p.operator || PAYMENT_LABELS[p.method]}</span>
                <span>{formatMoney(p.amount, currency)}</span>
              </div>
              {p.tendered ? (
                <>
                  <div className="flex justify-between text-ink-3">
                    <span>Remis</span><span>{formatMoney(p.tendered, currency)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Rendu</span><span>{formatMoney(p.change_given, currency)}</span>
                  </div>
                </>
              ) : null}
            </div>
          ))}

          {settings?.ticket_footer && (
            <>
              <hr className="my-2 border-dashed" />
              <p className="whitespace-pre-line text-center">{settings.ticket_footer}</p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-ink-3">
          Apercu — le PDF genere respecte la largeur 80 mm des imprimantes thermiques.
        </p>
      </div>
    </Modal>
  )
}
