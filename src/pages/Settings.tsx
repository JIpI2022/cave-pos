/**
 * Parametres (administrateur uniquement) :
 * boutique et devise, utilisateurs et roles, emplacements, categories,
 * journal d'audit.
 */

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react'
import {
  Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Modal, PageHeader,
  Select, Spinner, Table, Textarea,
} from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { formatDateTime, parseNumber, ROLE_LABELS } from '@/lib/format'
import type { AuditEntry, Category, Location, Profile, UserRole } from '@/types/database'

type Tab = 'boutique' | 'utilisateurs' | 'emplacements' | 'categories' | 'audit'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('boutique')

  return (
    <div>
      <PageHeader title="Parametres" subtitle="Reserve aux administrateurs" />

      <div className="mb-3 flex flex-wrap gap-2">
        {([
          ['boutique', 'Boutique et devise'],
          ['utilisateurs', 'Utilisateurs et roles'],
          ['emplacements', 'Emplacements'],
          ['categories', 'Categories'],
          ['audit', 'Journal d audit'],
        ] as const).map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === key ? 'bg-brand text-white' : 'bg-card text-ink-2 hover:bg-raised'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'boutique' && <ShopSettings />}
      {tab === 'utilisateurs' && <UsersTab />}
      {tab === 'emplacements' && <LocationsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

// ---------------------------------------------------------------- Boutique
const CURRENCY_PRESETS = [
  { code: 'EUR', symbol: '€', decimals: 2, label: 'Euro (EUR)' },
  { code: 'XOF', symbol: 'FCFA', decimals: 0, label: 'Franc CFA ouest-africain (XOF)' },
  { code: 'XAF', symbol: 'FCFA', decimals: 0, label: 'Franc CFA d Afrique centrale (XAF)' },
  { code: 'CHF', symbol: 'CHF', decimals: 2, label: 'Franc suisse (CHF)' },
  { code: 'CAD', symbol: '$', decimals: 2, label: 'Dollar canadien (CAD)' },
  { code: 'MAD', symbol: 'DH', decimals: 2, label: 'Dirham marocain (MAD)' },
]

function ShopSettings() {
  const { settings, saveSettings, reload } = useSettings()
  const toast = useToast()
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setForm({
      company_name: settings.company_name ?? '',
      address: settings.address ?? '',
      phone: settings.phone ?? '',
      tax_id: settings.tax_id ?? '',
      currency: settings.currency ?? 'EUR',
      currency_symbol: settings.currency_symbol ?? '€',
      currency_decimals: String(settings.currency_decimals ?? 2),
      timezone: settings.timezone ?? 'Europe/Paris',
      default_vat_rate: String(settings.default_vat_rate ?? 20),
      internal_code_prefix: settings.internal_code_prefix ?? 'CAV',
      internal_code_padding: String(settings.internal_code_padding ?? 6),
      internal_code_next: String(settings.internal_code_next ?? 1),
      ticket_prefix: settings.ticket_prefix ?? 'T',
      ticket_footer: settings.ticket_footer ?? '',
      low_stock_default: String(settings.low_stock_default ?? 6),
      mobile_money_operators: (settings.mobile_money_operators ?? []).join(', '),
    })
  }, [settings])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await saveSettings({
        company_name: form.company_name.trim(),
        address: form.address,
        phone: form.phone,
        tax_id: form.tax_id,
        currency: form.currency,
        currency_symbol: form.currency_symbol,
        currency_decimals: Math.max(0, Math.min(3, Math.round(parseNumber(form.currency_decimals) ?? 2))),
        timezone: form.timezone,
        default_vat_rate: parseNumber(form.default_vat_rate) ?? 20,
        internal_code_prefix: form.internal_code_prefix.toUpperCase(),
        internal_code_padding: Math.max(3, Math.round(parseNumber(form.internal_code_padding) ?? 6)),
        internal_code_next: Math.max(1, Math.round(parseNumber(form.internal_code_next) ?? 1)),
        ticket_prefix: form.ticket_prefix,
        ticket_footer: form.ticket_footer,
        low_stock_default: parseNumber(form.low_stock_default) ?? 6,
        mobile_money_operators: form.mobile_money_operators
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      })
      toast.success('Parametres enregistres.')
      await reload()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <Spinner />

  return (
    <div className="card space-y-4 p-4">
      {error && <Alert kind="error">{error}</Alert>}

      <h2 className="font-semibold text-ink">Identite de la boutique</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom de la boutique" required>
          <Input value={form.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} />
        </Field>
        <Field label="Telephone">
          <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Adresse" className="sm:col-span-2">
          <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Identifiant fiscal" hint="SIRET, NIF, RCCM... imprime sur le ticket.">
          <Input value={form.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} />
        </Field>
        <Field label="Fuseau horaire des rapports" hint="Determine la cloture des journees comptables.">
          <Input value={form.timezone ?? ''} onChange={(e) => set('timezone', e.target.value)} placeholder="Europe/Paris" />
        </Field>
      </div>

      <h2 className="font-semibold text-ink">Devise et TVA</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Devise" className="sm:col-span-2">
          <Select
            value={form.currency ?? 'EUR'}
            onChange={(e) => {
              const preset = CURRENCY_PRESETS.find((c) => c.code === e.target.value)
              if (preset) {
                setForm((f) => ({
                  ...f, currency: preset.code, currency_symbol: preset.symbol,
                  currency_decimals: String(preset.decimals),
                }))
              } else set('currency', e.target.value)
            }}
          >
            {CURRENCY_PRESETS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Symbole">
          <Input value={form.currency_symbol ?? ''} onChange={(e) => set('currency_symbol', e.target.value)} />
        </Field>
        <Field label="Decimales" hint="0 pour le FCFA.">
          <Input value={form.currency_decimals ?? '2'} onChange={(e) => set('currency_decimals', e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Taux de TVA par defaut (%)">
          <Input value={form.default_vat_rate ?? ''} onChange={(e) => set('default_vat_rate', e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Seuil d alerte par defaut">
          <Input value={form.low_stock_default ?? ''} onChange={(e) => set('low_stock_default', e.target.value)} inputMode="decimal" />
        </Field>
        <Field
          label="Operateurs de paiement mobile"
          className="sm:col-span-4"
          hint="Separes par des virgules. Ils apparaissent comme boutons en caisse et sont detailles dans le rapport Z."
        >
          <Input
            value={form.mobile_money_operators ?? ''}
            onChange={(e) => set('mobile_money_operators', e.target.value)}
            placeholder="Orange Money, MTN MoMo, Moov Money, Wave"
          />
        </Field>
      </div>

      <h2 className="font-semibold text-ink">Codes produit et tickets</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Prefixe des codes internes" hint="Exemple : CAV.">
          <Input value={form.internal_code_prefix ?? ''} onChange={(e) => set('internal_code_prefix', e.target.value)} />
        </Field>
        <Field label="Longueur du numero" hint="6 donne CAV000123.">
          <Input value={form.internal_code_padding ?? ''} onChange={(e) => set('internal_code_padding', e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Prochain numero" hint="Ne reculez pas ce compteur : les codes doivent rester uniques.">
          <Input value={form.internal_code_next ?? ''} onChange={(e) => set('internal_code_next', e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Prefixe des tickets" hint="T donne T000042.">
          <Input value={form.ticket_prefix ?? ''} onChange={(e) => set('ticket_prefix', e.target.value)} />
        </Field>
        <Field label="Pied de ticket" className="sm:col-span-4">
          <Textarea rows={3} value={form.ticket_footer ?? ''} onChange={(e) => set('ticket_footer', e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button icon={Save} loading={busy} onClick={() => void submit()}>Enregistrer les parametres</Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ Utilisateurs
function UsersTab() {
  const { profile: me } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('email')
    // Les comptes en attente d'activation passent en tete de liste.
    const list = (data ?? []) as Profile[]
    setRows([...list].sort((a, b) => Number(a.active) - Number(b.active)))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function changeRole(p: Profile, role: UserRole) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) toast.error(describeError(error))
    else { toast.success(`${p.email} est maintenant ${ROLE_LABELS[role].toLowerCase()}.`); void load() }
  }

  async function toggleActive(p: Profile) {
    const { error } = await supabase.from('profiles').update({ active: !p.active }).eq('id', p.id)
    if (error) toast.error(describeError(error))
    else { toast.success(p.active ? 'Compte desactive.' : 'Compte active.'); void load() }
  }

  return (
    <div className="space-y-3">
      <Alert kind="info">
        Les comptes se creent depuis l ecran de connexion (« Creer un compte »).
        Le tout premier compte cree devient administrateur et actif. <b>Tous les
        suivants arrivent « caissier » et INACTIFS</b> : tant que vous ne les
        activez pas ici, ils ne peuvent rien voir ni rien faire. C est ce qui
        protege votre boutique si l adresse de l application venait a circuler.
      </Alert>

      {rows.some((p) => !p.active) && (
        <Alert kind="warning">
          {rows.filter((p) => !p.active).length} compte(s) en attente d activation
          (en haut de la liste). Verifiez qu il s agit bien de vos employes avant
          de les activer.
        </Alert>
      )}

      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="Aucun utilisateur" />
        ) : (
          <Table head={['Utilisateur', 'Role', 'Statut', 'Cree le', '']}>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-raised">
                <td className="td">
                  <p className="font-medium text-ink">{p.full_name || p.email}</p>
                  <p className="text-xs text-ink-3">{p.email}</p>
                </td>
                <td className="td">
                  <Select
                    value={p.role}
                    disabled={p.id === me?.id}
                    onChange={(e) => void changeRole(p, e.target.value as UserRole)}
                    className="w-auto"
                  >
                    <option value="admin">Administrateur</option>
                    <option value="gerant">Gerant</option>
                    <option value="caissier">Caissier</option>
                  </Select>
                </td>
                <td className="td">
                  {p.active
                    ? <Badge color="green">actif</Badge>
                    : <Badge color="amber">en attente d activation</Badge>}
                </td>
                <td className="td text-xs text-ink-3">{formatDateTime(p.created_at)}</td>
                <td className="td">
                  {p.id !== me?.id && (
                    <Button
                      variant={p.active ? 'ghost' : 'primary'}
                      icon={ShieldCheck}
                      onClick={() => void toggleActive(p)}
                    >
                      {p.active ? 'Desactiver' : 'Activer'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <Alert kind="warning">
        Droits : <b>administrateur</b> = tout, <b>gerant</b> = stock, receptions, inventaire,
        rapports et annulations, <b>caissier</b> = caisse et clients uniquement.
        Ces regles sont appliquees par la base de donnees (RLS), pas seulement par l interface.
      </Alert>
    </div>
  )
}

// ------------------------------------------------------------ Emplacements
function LocationsTab() {
  const { reload } = useSettings()
  const toast = useToast()
  const [rows, setRows] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Location | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', kind: 'cave', is_sales_point: false, active: true })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('locations').select('*').order('code')
    setRows((data ?? []) as Location[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!open) return
    setForm({
      code: editing?.code ?? '', name: editing?.name ?? '', kind: editing?.kind ?? 'cave',
      is_sales_point: editing?.is_sales_point ?? false, active: editing?.active ?? true,
    })
    setError(null)
  }, [open, editing])

  async function submit() {
    if (!form.code.trim() || !form.name.trim()) { setError('Le code et le nom sont obligatoires.'); return }
    const payload = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim() }

    // Un seul point de vente a la fois : on decoche les autres.
    if (payload.is_sales_point) {
      await supabase.from('locations').update({ is_sales_point: false }).neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000')
    }

    const { error: dbErr } = editing
      ? await supabase.from('locations').update(payload).eq('id', editing.id)
      : await supabase.from('locations').insert(payload)

    if (dbErr) { setError(describeError(dbErr)); return }
    toast.success(editing ? 'Emplacement modifie.' : 'Emplacement cree.')
    setOpen(false)
    await load()
    await reload()
  }

  async function remove(l: Location) {
    if (!window.confirm(`Supprimer l emplacement « ${l.name} » ? Impossible s il contient des mouvements.`)) return
    const { error } = await supabase.from('locations').delete().eq('id', l.id)
    if (error) toast.error(describeError(error))
    else { toast.success('Emplacement supprime.'); void load(); void reload() }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => { setEditing(null); setOpen(true) }}>Nouvel emplacement</Button>
      </div>

      <div className="card">
        {loading ? <Spinner /> : (
          <Table head={['Code', 'Nom', 'Type', 'Point de vente', 'Statut', '']}>
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-raised">
                <td className="td font-mono font-semibold">{l.code}</td>
                <td className="td">{l.name}</td>
                <td className="td text-sm text-ink-2">{l.kind}</td>
                <td className="td">{l.is_sales_point && <Badge color="wine">caisse</Badge>}</td>
                <td className="td">{l.active ? <Badge color="green">actif</Badge> : <Badge color="slate">inactif</Badge>}</td>
                <td className="td">
                  <div className="flex gap-1">
                    <Button variant="ghost" icon={Pencil} onClick={() => { setEditing(l); setOpen(true) }} />
                    <Button variant="ghost" icon={Trash2} onClick={() => void remove(l)} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} size="sm"
        title={editing ? `Modifier : ${editing.name}` : 'Nouvel emplacement'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={() => void submit()}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Code" required hint="Court et sans espace : CAVE, DEPOT, BOUTIQUE.">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Nom" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="cave">Cave</option>
              <option value="depot">Depot</option>
              <option value="reserve">Reserve</option>
              <option value="boutique">Boutique</option>
            </Select>
          </Field>
          <Checkbox
            label="Emplacement de vente (caisse) — un seul a la fois"
            checked={form.is_sales_point}
            onChange={(e) => setForm({ ...form, is_sales_point: e.target.checked })}
          />
          <Checkbox
            label="Emplacement actif"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
        </div>
      </Modal>
    </div>
  )
}

// --------------------------------------------------------------- Categories
function CategoriesTab() {
  const { reload } = useSettings()
  const toast = useToast()
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState({ code: '', label: '', sort_order: '100', active: true })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').order('sort_order')
    setRows((data ?? []) as Category[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!open) return
    setForm({
      code: editing?.code ?? '', label: editing?.label ?? '',
      sort_order: String(editing?.sort_order ?? 100), active: editing?.active ?? true,
    })
    setError(null)
  }, [open, editing])

  async function submit() {
    if (!form.code.trim() || !form.label.trim()) { setError('Le code et le libelle sont obligatoires.'); return }
    const payload = {
      code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
      label: form.label.trim(),
      sort_order: Math.round(parseNumber(form.sort_order) ?? 100),
      active: form.active,
    }
    const { error: dbErr } = editing
      ? await supabase.from('categories').update(payload).eq('id', editing.id)
      : await supabase.from('categories').insert(payload)
    if (dbErr) { setError(describeError(dbErr)); return }
    toast.success(editing ? 'Categorie modifiee.' : 'Categorie creee.')
    setOpen(false)
    await load()
    await reload()
  }

  async function remove(c: Category) {
    if (!window.confirm(`Supprimer la categorie « ${c.label} » ? Les produits concernes seront « non classes ».`)) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (error) toast.error(describeError(error))
    else { toast.success('Categorie supprimee.'); void load(); void reload() }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => { setEditing(null); setOpen(true) }}>Nouvelle categorie</Button>
      </div>

      <div className="card">
        {loading ? <Spinner /> : (
          <Table head={['Ordre', 'Code', 'Libelle', 'Statut', '']}>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-raised">
                <td className="td tabular text-ink-3">{c.sort_order}</td>
                <td className="td font-mono text-xs">{c.code}</td>
                <td className="td font-medium">{c.label}</td>
                <td className="td">{c.active ? <Badge color="green">active</Badge> : <Badge color="slate">inactive</Badge>}</td>
                <td className="td">
                  <div className="flex gap-1">
                    <Button variant="ghost" icon={Pencil} onClick={() => { setEditing(c); setOpen(true) }} />
                    <Button variant="ghost" icon={Trash2} onClick={() => void remove(c)} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} size="sm"
        title={editing ? `Modifier : ${editing.label}` : 'Nouvelle categorie'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={() => void submit()}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Code" required hint="Sans accent ni espace : vin_rouge, spiritueux...">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Libelle affiche" required>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </Field>
          <Field label="Ordre d affichage">
            <Input value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} inputMode="numeric" />
          </Field>
          <Checkbox label="Categorie active" checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        </div>
      </Modal>
    </div>
  )
}

// -------------------------------------------------------------------- Audit
const AUDIT_LABELS: Record<string, string> = {
  'produit.prix': 'Modification de prix',
  'produit.suppression': 'Suppression de produit',
  'vente.annulation': 'Annulation de vente',
  'vente.retour': 'Retour d article',
  'stock.casse': 'Casse / perte',
  'stock.ajustement': 'Ajustement de stock',
  'inventaire.validation': 'Validation d inventaire',
  'reception.validation': 'Validation de reception',
  'caisse.ouverture': 'Ouverture de caisse',
  'caisse.cloture': 'Cloture de caisse',
  'utilisateur.role': 'Changement de role',
  'utilisateur.activation': 'Activation / desactivation de compte',
}

function AuditTab() {
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)
    if (action) query = query.eq('action', action)
    const { data } = await query
    setRows((data ?? []) as AuditEntry[])
    setLoading(false)
  }, [action])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <Field label="Type d operation">
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Toutes les operations</option>
            {Object.entries(AUDIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Button variant="secondary" icon={RefreshCw} onClick={() => void load()}>Actualiser</Button>
      </div>

      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="Aucune operation enregistree" description="Le journal se remplit automatiquement." />
        ) : (
          <Table head={['Date', 'Operation', 'Utilisateur', 'Detail']}>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-raised">
                <td className="td whitespace-nowrap text-xs text-ink-2">{formatDateTime(a.created_at)}</td>
                <td className="td">
                  <Badge color={a.action.startsWith('vente') ? 'red' : a.action.startsWith('caisse') ? 'blue' : 'amber'}>
                    {AUDIT_LABELS[a.action] ?? a.action}
                  </Badge>
                </td>
                <td className="td text-xs">{a.user_email}</td>
                <td className="td">
                  <code className="block max-w-xl overflow-x-auto whitespace-pre-wrap break-words text-xs text-ink-2">
                    {JSON.stringify(a.details, null, 1)}
                  </code>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <Alert kind="info">
        Le journal est alimente par la base de donnees elle-meme : il ne peut pas etre
        contourne depuis l interface, et ses lignes ne sont ni modifiables ni supprimables.
      </Alert>
    </div>
  )
}
