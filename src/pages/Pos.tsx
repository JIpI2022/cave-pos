/**
 * CAISSE (point de vente).
 *
 * Fonctionnement
 *  - Le champ de scan garde le focus en permanence : une douchette USB ou
 *    Bluetooth « tape » le code puis valide avec Entree, l article est ajoute.
 *  - La camera du telephone peut remplacer la douchette.
 *  - La recherche par nom reste possible pour les produits sans code.
 *  - Un code inconnu propose immediatement la creation du produit.
 *  - HORS LIGNE : la vente est ecrite dans IndexedDB puis envoyee au serveur
 *    des le retour du reseau (la RPC est idempotente, aucun doublon possible).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CloudOff, Lock, Minus, Percent, Plus, RefreshCw, ShoppingCart, Trash2, Unlock, UserPlus, X,
} from 'lucide-react'
import {
  Alert, Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner,
} from '@/components/ui'
import ScanInput from '@/components/ScanInput'
import ProductForm from '@/components/ProductForm'
import PaymentDialog from '@/pos/PaymentDialog'
import TicketDialog from '@/pos/TicketDialog'
import { CloseCashDialog, OpenCashDialog } from '@/pos/CashSessionDialogs'
import { useCatalog } from '@/pos/useCatalog'
import { cartTotals, useCart } from '@/store/cart'
import { supabase, describeError } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useSyncQueue, pushSale } from '@/hooks/useSyncQueue'
import { useToast } from '@/hooks/useToast'
import { enqueueSale, markFailed, markSynced, newClientUuid } from '@/lib/offline'
import { formatMoney, formatQty, formatVolume, parseNumber } from '@/lib/format'
import type { TicketData } from '@/lib/pdf'
import type {
  CashSession, Customer, DiscountType, PosProduct, Sale, SalePayload, SalePayloadPayment,
} from '@/types/database'

export default function Pos() {
  const { profile, isManager } = useAuth()
  const { currency, salesLocation, settings } = useSettings()
  const { online, refresh: refreshQueue, pendingCount } = useSyncQueue()
  const toast = useToast()
  const catalog = useCatalog()
  const cart = useCart()
  const totals = useMemo(() => cartTotals(cart, currency.decimals), [cart, currency.decimals])

  const [session, setSession] = useState<CashSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [openCash, setOpenCash] = useState(false)
  const [closeCash, setCloseCash] = useState(false)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [cartOpen, setCartOpen] = useState(false)

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ticket, setTicket] = useState<{ data: TicketData; offline: boolean } | null>(null)

  const [unknownCode, setUnknownCode] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [discountLineKey, setDiscountLineKey] = useState<string | null>(null)
  const [ticketDiscountOpen, setTicketDiscountOpen] = useState(false)

  // ---- Session de caisse en cours -------------------------------------
  // L objet `salesLocation` est recree a chaque chargement des parametres :
  // on se cale sur son identifiant pour ne pas relancer la recherche de
  // session de caisse (et donc le voile de chargement) sans raison.
  const salesLocationId = salesLocation?.id ?? null

  const loadSession = useCallback(async () => {
    if (!salesLocationId) { setSessionLoading(false); return }
    setSessionLoading(true)
    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'ouverte')
      .eq('location_id', salesLocationId)
      .maybeSingle()
    setSession((data ?? null) as CashSession | null)
    setSessionLoading(false)
  }, [salesLocationId])

  useEffect(() => { void loadSession() }, [loadSession])

  useEffect(() => {
    void supabase
      .from('customers').select('*').eq('active', true).order('name')
      .then(({ data }) => setCustomers((data ?? []) as Customer[]))
  }, [])

  // ---- Ajout d'un article ---------------------------------------------
  const { findByCode, search: searchCatalog } = catalog

  const addByCode = useCallback((code: string) => {
    const product = findByCode(code)
    if (product) {
      cart.addProduct(product)
      setSearch('')
      return
    }
    // Code inconnu : recherche par nom en secours, sinon proposition de creation.
    const matches = searchCatalog(code, 2)
    if (matches.length === 1) {
      cart.addProduct(matches[0])
      setSearch('')
      return
    }
    setUnknownCode(code)
  }, [findByCode, searchCatalog, cart])

  const visibleProducts = useMemo(() => {
    const list = searchCatalog(search, 120)
    return categoryFilter ? list.filter((p) => p.category_id === categoryFilter) : list
  }, [searchCatalog, search, categoryFilter])

  // ---- Enregistrement de la vente -------------------------------------
  async function confirmSale(payments: SalePayloadPayment[]) {
    if (!cart.lines.length || !salesLocation) return
    setSaving(true)

    const clientUuid = newClientUuid()
    const createdAt = new Date().toISOString()

    const payload: SalePayload = {
      client_uuid: clientUuid,
      cash_session_id: session?.id ?? null,
      location_id: salesLocation.id,
      customer_id: cart.customerId,
      ticket_discount_type: cart.ticketDiscountType,
      ticket_discount_value: cart.ticketDiscountValue,
      note: cart.note,
      created_at: createdAt,
      items: cart.lines.map((l) => ({
        product_id: l.productId,
        label: l.label,
        quantity: l.quantity,
        pack_size: l.packSize,
        unit: l.unit,
        unit_price_ttc: l.unitPriceTtc,
        vat_rate: l.vatRate,
        discount_type: l.discountType,
        discount_value: l.discountValue,
      })),
      payments,
    }

    // 1. Ecriture locale systematique : aucune vente ne peut etre perdue.
    const queued = await enqueueSale(payload)

    // 2. Tentative d'envoi immediat.
    let sale: Sale | null = null
    let offline = true
    if (online) {
      try {
        sale = await pushSale(queued)
        await markSynced(queued.id, sale.ticket_ref)
        offline = false
      } catch (err) {
        const message = describeError(err)
        await markFailed(queued.id, message)
        toast.warning(`Vente conservee sur l appareil : ${message}`)
      }
    }

    // 3. Construction du ticket (les montants viennent du serveur si possible).
    const data: TicketData = {
      sale: {
        ticket_ref: sale?.ticket_ref ?? `HL-${clientUuid.slice(0, 6).toUpperCase()}`,
        created_at: createdAt,
        total_ht: sale ? Number(sale.total_ht) : totals.totalHt,
        total_vat: sale ? Number(sale.total_vat) : totals.totalVat,
        total_ttc: sale ? Number(sale.total_ttc) : totals.totalTtc,
        discount_total: sale ? Number(sale.discount_total) : totals.discountTotal,
        status: 'validee',
      },
      items: cart.lines.map((l, i) => ({
        label: l.label,
        quantity: l.quantity,
        // Prix unitaire deja ramene a la precision de la devise : le ticket
        // affiche donc des lignes qui font exactement la somme du total.
        unit_price_ttc: totals.lines[i]?.unitPriceTtc ?? l.unitPriceTtc,
        line_ttc: totals.lines[i]?.ttc ?? 0,
        line_discount: totals.lines[i]?.totalDiscount ?? 0,
        vat_rate: l.vatRate,
        unit: l.unit,
        pack_size: l.packSize,
      })),
      payments: payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        tendered: p.tendered ?? null,
        change_given: p.change_given ?? 0,
        operator: p.operator ?? '',
      })),
      vatBreakdown: totals.vatBreakdown,
      cashierName: profile?.full_name || profile?.email,
      customerName: customers.find((c) => c.id === cart.customerId)?.name,
    }

    setTicket({ data, offline })
    setPaymentOpen(false)
    setSaving(false)
    cart.clear()
    setSearch('')
    await refreshQueue()
    if (!offline) void catalog.reload()
  }

  // ---- Rendu -----------------------------------------------------------
  if (sessionLoading) return <Spinner label="Ouverture de la caisse..." />

  if (!salesLocation) {
    return (
      <Alert kind="warning">
        Aucun emplacement de vente n est defini. Un administrateur doit cocher
        « point de vente » sur un emplacement dans Parametres &gt; Emplacements.
      </Alert>
    )
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-ink">La caisse est fermee</h1>
          <p className="mt-1 text-sm text-ink-3">
            Ouvrez la caisse en indiquant le fond de caisse pour commencer a encaisser.
          </p>
          <Button icon={Unlock} size="lg" className="mt-4" onClick={() => setOpenCash(true)}>
            Ouvrir la caisse
          </Button>
          {!online && (
            <p className="mt-3 text-xs text-amber-700">
              L ouverture de caisse necessite une connexion. Les ventes, elles, fonctionnent hors ligne.
            </p>
          )}
        </div>
        <OpenCashDialog
          open={openCash} locationId={salesLocation.id}
          onClose={() => setOpenCash(false)}
          onOpened={(s) => setSession(s)}
        />
      </div>
    )
  }

  return (
    <div>
      <h1 className="sr-only">Caisse</h1>

      {/* ---- Bandeau de session ---- */}
      <div className="card mb-3 flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge color="green">Caisse ouverte</Badge>
          <span className="text-ink-2">{salesLocation.name}</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-2">Fond : {formatMoney(session.opening_float, currency)}</span>
          {catalog.fromCache && (
            <Badge color="amber"><CloudOff className="h-3 w-3" /> catalogue local</Badge>
          )}
          {pendingCount > 0 && <Badge color="amber">{pendingCount} vente(s) a synchroniser</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={RefreshCw} onClick={() => void catalog.reload()} title="Recharger le catalogue">
            <span className="hidden sm:inline">Catalogue</span>
          </Button>
          <Button variant="secondary" icon={Lock} onClick={() => setCloseCash(true)}>
            Cloturer
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
        {/* ---- Colonne gauche : scan + catalogue ---- */}
        <div className="space-y-3">
          <div className="card p-3">
            <ScanInput
              onScan={addByCode}
              onTextChange={setSearch}
              value={search}
              keepFocus
              placeholder="Scanner un code-barres, ou chercher un produit..."
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CategoryChips value={categoryFilter} onChange={setCategoryFilter} />
            </div>
          </div>

          <div className="card p-3">
            {catalog.loading ? <Spinner /> : visibleProducts.length === 0 ? (
              <EmptyState title="Aucun produit" description="Modifiez la recherche ou le filtre de categorie." />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((p) => (
                  <ProductTile key={p.id} product={p} currency={currency} onAdd={(asPack) => cart.addProduct(p, { asPack })} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---- Colonne droite : panier (ordinateur) ---- */}
        <div className="hidden lg:block">
          <CartPanel
            onPay={() => setPaymentOpen(true)}
            onLineDiscount={setDiscountLineKey}
            onTicketDiscount={() => setTicketDiscountOpen(true)}
            customers={customers}
          />
        </div>
      </div>

      {/* ---- Barre panier (mobile) ---- */}
      <div className="safe-bottom fixed inset-x-0 bottom-14 z-20 border-t border-line bg-card p-2 lg:hidden">
        <Button
          size="lg" className="w-full justify-between" icon={ShoppingCart}
          onClick={() => setCartOpen(true)}
        >
          <span>{cart.lines.length} article(s)</span>
          <span className="tabular">{formatMoney(totals.totalTtc, currency)}</span>
        </Button>
      </div>

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Panier" size="md">
        <CartPanel
          embedded
          onPay={() => { setCartOpen(false); setPaymentOpen(true) }}
          onLineDiscount={setDiscountLineKey}
          onTicketDiscount={() => setTicketDiscountOpen(true)}
          customers={customers}
        />
      </Modal>

      {/* ---- Fenetres ---- */}
      <PaymentDialog
        open={paymentOpen}
        totalDue={totals.totalTtc}
        currency={currency}
        busy={saving}
        onClose={() => setPaymentOpen(false)}
        onConfirm={(payments) => void confirmSale(payments)}
      />

      <TicketDialog
        open={Boolean(ticket)}
        data={ticket?.data ?? null}
        offline={ticket?.offline}
        onClose={() => setTicket(null)}
        onNewSale={() => setTicket(null)}
      />

      <CloseCashDialog
        open={closeCash}
        session={session}
        onClose={() => setCloseCash(false)}
        onClosed={() => { setSession(null); void loadSession() }}
      />

      <LineDiscountDialog
        open={Boolean(discountLineKey)}
        lineKey={discountLineKey}
        onClose={() => setDiscountLineKey(null)}
      />

      <TicketDiscountDialog open={ticketDiscountOpen} onClose={() => setTicketDiscountOpen(false)} />

      {/* Code inconnu : creation immediate du produit (gerant) */}
      <UnknownCodeDialog
        code={unknownCode}
        canCreate={isManager}
        onClose={() => setUnknownCode(null)}
        onCreated={async (product) => {
          setUnknownCode(null)
          await catalog.reload()
          cart.addProduct(product)
        }}
        defaultVat={settings?.default_vat_rate ?? 20}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pastilles de categorie
// ---------------------------------------------------------------------------
function CategoryChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { categories } = useSettings()
  return (
    <>
      <button
        onClick={() => onChange('')}
        className={`badge ${value === '' ? 'bg-brand text-white' : 'bg-raised text-ink-2'}`}
      >
        Tout
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(value === c.id ? '' : c.id)}
          className={`badge ${value === c.id ? 'bg-brand text-white' : 'bg-raised text-ink-2'}`}
        >
          {c.label}
        </button>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Tuile produit (gros bouton tactile)
// ---------------------------------------------------------------------------
function ProductTile({
  product, currency, onAdd,
}: {
  product: PosProduct
  currency: { symbol: string; decimals: number; code: string }
  onAdd: (asPack: boolean) => void
}) {
  const low = product.total_stock <= 0
  return (
    <div className={`flex flex-col rounded-lg border p-2 text-left transition ${
      low ? 'border-amber-300 bg-amber-50' : 'border-line bg-card hover:border-brand/40'}`}>
      <button onClick={() => onAdd(false)} className="flex-1 text-left">
        <p className="line-clamp-2 text-sm font-semibold text-ink">{product.name}</p>
        <p className="text-xs text-ink-3">
          {[product.appellation, product.vintage, formatVolume(product.volume_ml)].filter(Boolean).join(' · ')}
        </p>
        <p className="tabular mt-1 text-base font-bold text-brand">
          {formatMoney(product.sale_price_ttc, currency)}
        </p>
        <p className={`text-xs ${low ? 'font-semibold text-amber-700' : 'text-ink-3'}`}>
          Stock : {formatQty(product.total_stock)}
        </p>
      </button>
      {product.pack_size > 1 && (
        <button
          onClick={() => onAdd(true)}
          className="mt-1 rounded bg-raised py-1 text-xs font-semibold text-ink-2 hover:bg-line"
        >
          + carton de {product.pack_size}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panier
// ---------------------------------------------------------------------------
function CartPanel({
  onPay, onLineDiscount, onTicketDiscount, customers, embedded,
}: {
  onPay: () => void
  onLineDiscount: (key: string) => void
  onTicketDiscount: () => void
  customers: Customer[]
  embedded?: boolean
}) {
  const cart = useCart()
  const { currency } = useSettings()
  const totals = useMemo(() => cartTotals(cart, currency.decimals), [cart, currency.decimals])

  return (
    <div className={embedded ? '' : 'card sticky top-4 flex max-h-[calc(100vh-7rem)] flex-col'}>
      {!embedded && (
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <ShoppingCart className="h-4 w-4" /> Panier
          </h2>
          {cart.lines.length > 0 && (
            <button onClick={cart.clear} className="text-xs text-ink-3 hover:text-red-600">
              Vider
            </button>
          )}
        </div>
      )}

      <div className={embedded ? 'space-y-2' : 'flex-1 space-y-2 overflow-y-auto p-3'}>
        {cart.lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">
            Scannez un article ou touchez un produit pour commencer.
          </p>
        ) : (
          cart.lines.map((line, i) => {
            const computed = totals.lines[i]
            const insufficient = line.knownStock > 0 && line.quantity * line.packSize > line.knownStock
            return (
              <div key={line.key} className="rounded-lg border border-line p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{line.label}</p>
                    <p className="text-xs text-ink-3">
                      {formatMoney(computed?.unitPriceTtc ?? line.unitPriceTtc, currency)} / {line.unit}
                      {line.packSize > 1 && ` (${line.packSize} bouteilles)`}
                    </p>
                  </div>
                  <button
                    onClick={() => cart.removeLine(line.key)}
                    className="shrink-0 text-ink-3 hover:text-red-600"
                    aria-label="Retirer l article"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => cart.changeQuantity(line.key, -1)}
                      className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-ink-2 active:bg-line"
                      aria-label="Diminuer"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      value={line.quantity}
                      onChange={(e) => cart.setQuantity(line.key, parseNumber(e.target.value) ?? 0)}
                      inputMode="decimal"
                      className="tabular h-9 w-14 rounded-lg border border-line text-center font-semibold"
                      aria-label="Quantite"
                    />
                    <button
                      onClick={() => cart.changeQuantity(line.key, 1)}
                      className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-ink-2 active:bg-line"
                      aria-label="Augmenter"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="text-right">
                    {computed && computed.totalDiscount > 0 && (
                      <p className="text-xs text-ink-3 line-through">{formatMoney(computed.gross, currency)}</p>
                    )}
                    <p className="tabular font-bold text-ink">{formatMoney(computed?.ttc ?? 0, currency)}</p>
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onLineDiscount(line.key)}
                    className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    <Percent className="h-3 w-3" />
                    {line.discountType === 'aucune'
                      ? 'Remise'
                      : line.discountType === 'pourcentage'
                        ? `- ${line.discountValue} %`
                        : `- ${formatMoney(line.discountValue, currency)}`}
                  </button>
                  {insufficient && <span className="text-xs font-semibold text-amber-700">stock insuffisant</span>}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className={embedded ? 'mt-3 space-y-2' : 'space-y-2 border-t border-line p-3'}>
        <Field label="Client (facultatif)">
          <Select value={cart.customerId ?? ''} onChange={(e) => cart.setCustomer(e.target.value || null)}>
            <option value="">Client de passage</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <div className="space-y-1 text-sm">
          <Row label="Sous-total" value={formatMoney(totals.grossTotal, currency)} />
          {totals.lineDiscountTotal > 0 && (
            <Row label="Remises de ligne" value={`- ${formatMoney(totals.lineDiscountTotal, currency)}`} />
          )}
          <div className="flex items-center justify-between">
            <button onClick={onTicketDiscount} className="flex items-center gap-1 text-brand hover:underline">
              <Percent className="h-3.5 w-3.5" />
              Remise sur le ticket
            </button>
            <span className="tabular">
              {totals.ticketDiscount > 0 ? `- ${formatMoney(totals.ticketDiscount, currency)}` : '—'}
            </span>
          </div>
          <Row label="Total HT" value={formatMoney(totals.totalHt, currency)} muted />
          <Row label="TVA" value={formatMoney(totals.totalVat, currency)} muted />
        </div>

        <div className="flex items-baseline justify-between rounded-lg bg-strong px-3 py-2 text-strong-ink">
          <span className="text-sm font-semibold uppercase tracking-wide">Total</span>
          <span className="tabular text-2xl font-bold">{formatMoney(totals.totalTtc, currency)}</span>
        </div>

        <Button size="lg" className="w-full" disabled={!cart.lines.length} onClick={onPay}>
          Encaisser
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-ink-3' : ''}`}>
      <span>{label}</span><span className="tabular">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Remises
// ---------------------------------------------------------------------------
function LineDiscountDialog({
  open, lineKey, onClose,
}: { open: boolean; lineKey: string | null; onClose: () => void }) {
  const cart = useCart()
  const { currency } = useSettings()
  const line = cart.lines.find((l) => l.key === lineKey)
  const [type, setType] = useState<DiscountType>('pourcentage')
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open || !line) return
    setType(line.discountType === 'aucune' ? 'pourcentage' : line.discountType)
    setValue(line.discountType === 'aucune' ? '' : String(line.discountValue))
  }, [open, line])

  if (!line) return null

  return (
    <Modal
      open={open} onClose={onClose} size="sm" title={`Remise — ${line.label}`}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => { cart.setLineDiscount(line.key, 'aucune', 0); onClose() }}
          >
            Supprimer la remise
          </Button>
          <Button
            onClick={() => {
              cart.setLineDiscount(line.key, type, parseNumber(value) ?? 0)
              onClose()
            }}
          >
            Appliquer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setType('pourcentage')}
            className={`rounded-lg border py-2 text-sm font-semibold ${
              type === 'pourcentage' ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line'}`}
          >
            En pourcentage
          </button>
          <button
            onClick={() => setType('montant')}
            className={`rounded-lg border py-2 text-sm font-semibold ${
              type === 'montant' ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line'}`}
          >
            En montant
          </button>
        </div>

        <Field label={type === 'pourcentage' ? 'Remise (%)' : `Remise (${currency.symbol})`}>
          <Input
            value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus
            className="tabular text-right text-xl font-bold"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {(type === 'pourcentage' ? [5, 10, 15, 20, 25, 50] : [1, 2, 5, 10]).map((v) => (
            <button key={v} onClick={() => setValue(String(v))} className="btn-secondary px-3 py-1.5 text-sm">
              {type === 'pourcentage' ? `${v} %` : formatMoney(v, currency)}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function TicketDiscountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useCart()
  const { currency } = useSettings()
  const [type, setType] = useState<DiscountType>('pourcentage')
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return
    setType(cart.ticketDiscountType === 'aucune' ? 'pourcentage' : cart.ticketDiscountType)
    setValue(cart.ticketDiscountType === 'aucune' ? '' : String(cart.ticketDiscountValue))
  }, [open, cart.ticketDiscountType, cart.ticketDiscountValue])

  return (
    <Modal
      open={open} onClose={onClose} size="sm" title="Remise sur l ensemble du ticket"
      footer={
        <>
          <Button variant="secondary" onClick={() => { cart.setTicketDiscount('aucune', 0); onClose() }}>
            Supprimer
          </Button>
          <Button onClick={() => { cart.setTicketDiscount(type, parseNumber(value) ?? 0); onClose() }}>
            Appliquer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setType('pourcentage')}
            className={`rounded-lg border py-2 text-sm font-semibold ${
              type === 'pourcentage' ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line'}`}
          >
            En pourcentage
          </button>
          <button
            onClick={() => setType('montant')}
            className={`rounded-lg border py-2 text-sm font-semibold ${
              type === 'montant' ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line'}`}
          >
            En montant
          </button>
        </div>
        <Field
          label={type === 'pourcentage' ? 'Remise (%)' : `Remise (${currency.symbol})`}
          hint="Repartie au prorata sur les lignes pour que la TVA reste exacte."
        >
          <Input
            value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus
            className="tabular text-right text-xl font-bold"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Code inconnu
// ---------------------------------------------------------------------------
function UnknownCodeDialog({
  code, canCreate, onClose, onCreated, defaultVat,
}: {
  code: string | null
  canCreate: boolean
  onClose: () => void
  onCreated: (product: PosProduct) => void
  defaultVat: number
}) {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <>
      <Modal
        open={Boolean(code) && !formOpen}
        onClose={onClose}
        size="sm"
        title="Code inconnu"
        footer={
          <>
            <Button variant="secondary" icon={X} onClick={onClose}>Ignorer</Button>
            {canCreate && (
              <Button icon={UserPlus} onClick={() => setFormOpen(true)}>Creer le produit</Button>
            )}
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p>
            Aucun produit ne correspond au code{' '}
            <span className="font-mono font-bold">{code}</span>.
          </p>
          {canCreate ? (
            <p className="text-ink-3">
              Vous pouvez creer la fiche produit immediatement : le code sera prerempli.
            </p>
          ) : (
            <Alert kind="warning">
              Seul un gerant peut creer un produit. Prevenez le responsable, puis rescannez l article.
            </Alert>
          )}
        </div>
      </Modal>

      <ProductForm
        open={formOpen}
        product={null}
        prefillBarcode={code ?? ''}
        onClose={() => { setFormOpen(false); onClose() }}
        onSaved={(product) => {
          // On reconstruit la forme attendue par la caisse, sans aucun cout :
          // le catalogue sera de toute facon recharge depuis v_pos_catalog.
          onCreated({
            id: product.id,
            name: product.name,
            category_id: product.category_id,
            category_label: null,
            category_code: null,
            appellation: product.appellation,
            vintage: product.vintage,
            volume_ml: product.volume_ml,
            sale_price_ttc: Number(product.sale_price_ttc),
            vat_rate: Number(product.vat_rate ?? defaultVat),
            barcode: product.barcode,
            internal_code: product.internal_code,
            unit: product.unit,
            pack_size: product.pack_size,
            photo_url: product.photo_url,
            active: product.active,
            stock_alert_threshold: product.stock_alert_threshold,
            total_stock: 0,
            is_low_stock: true,
          })
        }}
      />
    </>
  )
}
