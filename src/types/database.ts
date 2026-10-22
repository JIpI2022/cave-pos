/**
 * Types TypeScript miroir du schema PostgreSQL (supabase/schema.sql).
 * Ecrits a la main pour rester lisibles ; si vous modifiez le schema,
 * mettez ce fichier a jour (ou regenerez-le avec `supabase gen types`).
 */

export type UserRole = 'admin' | 'gerant' | 'caissier'
export type ProductUnit = 'bouteille' | 'carton_6' | 'carton_12'
export type MovementType = 'entree' | 'sortie' | 'transfert' | 'casse' | 'ajustement' | 'retour'
export type SaleStatus = 'validee' | 'annulee'
export type PaymentMethod = 'especes' | 'carte' | 'mobile_money'
export type CashStatus = 'ouverte' | 'cloturee'
export type InventoryStatus = 'ouverte' | 'validee' | 'annulee'
export type ReceptionStatus = 'brouillon' | 'validee'
export type DiscountType = 'aucune' | 'pourcentage' | 'montant'

export interface AppSettings {
  id: number
  company_name: string
  address: string
  phone: string
  tax_id: string
  currency: string
  currency_symbol: string
  currency_decimals: number
  timezone: string
  default_vat_rate: number
  internal_code_prefix: string
  internal_code_next: number
  internal_code_padding: number
  ticket_footer: string
  ticket_prefix: string
  low_stock_default: number
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  active: boolean
  created_at: string
}

export interface Category {
  id: string
  code: string
  label: string
  sort_order: number
  active: boolean
}

export interface Location {
  id: string
  code: string
  name: string
  kind: string
  is_sales_point: boolean
  active: boolean
}

export interface Supplier {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
  notes: string
  active: boolean
  created_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address: string
  notes: string
  active: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  category_id: string | null
  appellation: string
  vintage: number | null
  volume_ml: number | null
  supplier_id: string | null
  purchase_price_ht: number
  sale_price_ttc: number
  vat_rate: number
  barcode: string | null
  internal_code: string | null
  unit: ProductUnit
  pack_size: number
  stock_alert_threshold: number
  photo_url: string
  active: boolean
  created_at: string
  updated_at: string
}

/** Vue v_products_full : produit + categorie + fournisseur + stock total */
export interface ProductFull extends Product {
  category_label: string | null
  category_code: string | null
  supplier_name: string | null
  total_stock: number
  is_low_stock: boolean
  stock_value_ht: number
  sale_price_ht: number
  unit_margin_ht: number
}

export interface StockLevel {
  product_id: string
  location_id: string
  quantity: number
  updated_at: string
}

/** Vue v_stock_by_location */
export interface StockByLocation {
  product_id: string
  location_id: string
  quantity: number
  updated_at: string
  product_name: string
  barcode: string | null
  internal_code: string | null
  purchase_price_ht: number
  sale_price_ttc: number
  stock_alert_threshold: number
  active: boolean
  category_label: string | null
  location_name: string
  location_code: string
  value_ht: number
}

/** Vue v_movements_full */
export interface MovementFull {
  id: number
  created_at: string
  type: MovementType
  quantity_delta: number
  reason: string
  reference: string
  unit_cost_ht: number | null
  transfer_group: string | null
  related_id: string | null
  product_id: string
  product_name: string
  barcode: string | null
  internal_code: string | null
  location_id: string
  location_name: string
  user_email: string | null
  user_name: string | null
}

export interface Reception {
  id: string
  number: string
  supplier_id: string | null
  location_id: string
  received_on: string
  status: ReceptionStatus
  invoice_ref: string
  notes: string
  total_ht: number
  user_id: string | null
  validated_at: string | null
  created_at: string
}

export interface ReceptionLine {
  id: string
  reception_id: string
  product_id: string
  quantity: number
  pack_size: number
  purchase_price_ht: number
  update_product_price: boolean
}

export interface InventorySession {
  id: string
  label: string
  location_id: string
  status: InventoryStatus
  notes: string
  started_by: string | null
  started_at: string
  validated_at: string | null
}

/** Vue v_inventory_lines_full */
export interface InventoryLineFull {
  id: string
  session_id: string
  product_id: string
  theoretical_qty: number
  counted_qty: number
  gap: number
  reason: string
  updated_at: string
  product_name: string
  barcode: string | null
  internal_code: string | null
  purchase_price_ht: number
  gap_value_ht: number
  category_label: string | null
}

export interface CashSession {
  id: string
  location_id: string
  status: CashStatus
  opening_float: number
  opened_by: string | null
  opened_at: string
  closed_by: string | null
  closed_at: string | null
  counted_cash: number | null
  expected_cash: number | null
  cash_gap: number | null
  notes: string
}

/** Vue v_cash_session_report : rapport Z */
export interface CashSessionReport extends CashSession {
  location_name: string
  opened_by_email: string | null
  closed_by_email: string | null
  nb_tickets: number
  ca_ttc: number
  ca_ht: number
  total_tva: number
  total_remises: number
  total_especes: number
  total_carte: number
  total_mobile_money: number
  total_retours: number
  nb_annulations: number
}

export interface Sale {
  id: string
  ticket_number: number
  ticket_ref: string
  client_uuid: string
  cash_session_id: string | null
  location_id: string
  customer_id: string | null
  user_id: string | null
  status: SaleStatus
  total_ht: number
  total_vat: number
  total_ttc: number
  discount_total: number
  note: string
  cancelled_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string | null
  label: string
  quantity: number
  pack_size: number
  unit: string
  unit_price_ttc: number
  vat_rate: number
  discount_type: DiscountType
  discount_value: number
  line_discount: number
  line_ttc: number
  line_ht: number
  line_vat: number
  unit_cost_ht: number
  position: number
}

export interface Payment {
  id: string
  sale_id: string
  method: PaymentMethod
  amount: number
  tendered: number | null
  change_given: number
  reference: string
  created_at: string
}

export interface SaleReturn {
  id: string
  sale_id: string
  sale_item_id: string | null
  product_id: string | null
  quantity: number
  amount_ttc: number
  reason: string
  user_id: string | null
  created_at: string
}

export interface AuditEntry {
  id: number
  user_id: string | null
  user_email: string
  action: string
  entity: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

/** Vue v_sales_daily */
export interface SalesDaily {
  sale_date: string
  nb_tickets: number
  ca_ttc: number
  ca_ht: number
  total_tva: number
  total_remises: number
  panier_moyen: number
  marge_ht: number
}

/** Vue v_top_products */
export interface TopProduct {
  product_id: string | null
  product_name: string
  category_label: string | null
  qty_sold: number
  ca_ttc: number
  ca_ht: number
  marge_ht: number
  first_sale: string
  last_sale: string
}

/** Vue v_payments_breakdown */
export interface PaymentBreakdown {
  sale_date: string
  method: PaymentMethod
  nb_paiements: number
  total: number
  cash_session_id: string | null
}

/** Vue v_sale_items_full */
export interface SaleItemFull extends SaleItem {
  qty_base: number
  margin_ht: number
  ticket_ref: string
  ticket_number: number
  created_at: string
  status: SaleStatus
  cash_session_id: string | null
  location_id: string
  customer_id: string | null
  sale_date: string
  category_label: string | null
  user_email: string | null
}

/** Vue v_low_stock */
export interface LowStockRow {
  id: string
  name: string
  barcode: string | null
  internal_code: string | null
  category_label: string | null
  supplier_name: string | null
  total_stock: number
  stock_alert_threshold: number
  missing_qty: number
  purchase_price_ht: number
  sale_price_ttc: number
}

/** Vue v_stock_value */
export interface StockValueRow {
  nb_products: number
  total_units: number
  value_purchase_ht: number
  value_sale_ttc: number
}

/** Payload de la RPC pos_create_sale */
export interface SalePayloadItem {
  product_id: string | null
  label: string
  quantity: number
  pack_size: number
  unit: string
  unit_price_ttc: number
  vat_rate: number
  discount_type: DiscountType
  discount_value: number
}

export interface SalePayloadPayment {
  method: PaymentMethod
  amount: number
  tendered?: number | null
  change_given?: number
  reference?: string
}

export interface SalePayload {
  client_uuid: string
  cash_session_id: string | null
  location_id: string
  customer_id: string | null
  ticket_discount_type: DiscountType
  ticket_discount_value: number
  note: string
  created_at: string
  items: SalePayloadItem[]
  payments: SalePayloadPayment[]
}
