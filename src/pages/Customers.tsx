/** Clients : fiche simple et historique d'achats. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, History, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Modal, PageHeader,
  Spinner, Table, Textarea,
} from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { formatDateTime, formatMoney, searchKey } from '@/lib/format'
import { downloadCsv, stampedFilename, type ExportColumn } from '@/lib/exports'
import type { Customer, Sale } from '@/types/database'

export default function Customers() {
  const { isManager } = useAuth()
  const { currency } = useSettings()
  const toast = useToast()

  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Customer | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [historyOf, setHistoryOf] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    setRows((data ?? []) as Customer[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const key = searchKey(search)
    if (!key) return rows
    return rows.filter((c) =>
      searchKey(c.name).includes(key) || (c.phone ?? '').includes(key) || searchKey(c.email).includes(key))
  }, [rows, search])

  const columns: ExportColumn<Customer>[] = [
    { header: 'Nom', value: (c) => c.name },
    { header: 'Telephone', value: (c) => c.phone },
    { header: 'E-mail', value: (c) => c.email },
    { header: 'Adresse', value: (c) => c.address },
    { header: 'Notes', value: (c) => c.notes },
  ]

  async function remove(customer: Customer) {
    if (!window.confirm(`Supprimer le client « ${customer.name} » ?`)) return
    const { error } = await supabase.from('customers').delete().eq('id', customer.id)
    if (error) toast.error(describeError(error))
    else { toast.success('Client supprime.'); void load() }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} client(s) · facultatif : la caisse accepte les clients de passage`}
        actions={
          <>
            <Button variant="secondary" icon={Download}
              onClick={() => downloadCsv(filtered, columns, stampedFilename('clients', 'csv'))}>CSV</Button>
            <Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Nouveau client</Button>
          </>
        }
      />

      <div className="card mb-3 p-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom, telephone, e-mail..." />
      </div>

      <div className="card">
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title="Aucun client" description="Les clients sont optionnels : utile pour les professionnels et les comites d entreprise." />
        ) : (
          <Table head={['Nom', 'Telephone', 'E-mail', 'Statut', '']}>
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="td font-medium text-slate-900">{c.name}</td>
                <td className="td text-sm">{c.phone || '—'}</td>
                <td className="td text-sm">{c.email || '—'}</td>
                <td className="td">{c.active ? <Badge color="green">actif</Badge> : <Badge color="slate">inactif</Badge>}</td>
                <td className="td">
                  <div className="flex gap-1">
                    <Button variant="ghost" icon={History} onClick={() => setHistoryOf(c)} title="Historique d achats" />
                    <Button variant="ghost" icon={Pencil} onClick={() => { setEditing(c); setFormOpen(true) }} />
                    {isManager && <Button variant="ghost" icon={Trash2} onClick={() => void remove(c)} />}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <CustomerForm
        open={formOpen} customer={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); void load() }}
      />

      <HistoryDialog customer={historyOf} currency={currency} onClose={() => setHistoryOf(null)} />
    </div>
  )
}

function CustomerForm({
  open, customer, onClose, onSaved,
}: { open: boolean; customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '', active: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({
      name: customer?.name ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '',
      address: customer?.address ?? '', notes: customer?.notes ?? '', active: customer?.active ?? true,
    })
    setError(null)
  }, [open, customer])

  async function submit() {
    if (!form.name.trim()) { setError('Le nom est obligatoire.'); return }
    setBusy(true)
    setError(null)
    try {
      const payload = { ...form, name: form.name.trim() }
      const { error: dbErr } = customer
        ? await supabase.from('customers').update(payload).eq('id', customer.id)
        : await supabase.from('customers').insert(payload)
      if (dbErr) throw dbErr
      toast.success(customer ? 'Client modifie.' : 'Client cree.')
      onSaved()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open} onClose={onClose} title={customer ? `Modifier : ${customer.name}` : 'Nouveau client'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button loading={busy} onClick={() => void submit()}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom ou raison sociale" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Telephone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          </Field>
          <Field label="E-mail">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" />
          </Field>
          <Field label="Adresse" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        <Checkbox label="Client actif" checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </div>
    </Modal>
  )
}

function HistoryDialog({
  customer, currency, onClose,
}: {
  customer: Customer | null
  currency: { symbol: string; decimals: number; code: string }
  onClose: () => void
}) {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!customer) return
    setLoading(true)
    void supabase
      .from('sales').select('*').eq('customer_id', customer.id)
      .order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => { setSales((data ?? []) as Sale[]); setLoading(false) })
  }, [customer])

  const total = sales.filter((s) => s.status === 'validee').reduce((s, x) => s + Number(x.total_ttc), 0)

  return (
    <Modal
      open={Boolean(customer)} onClose={onClose} size="lg"
      title={customer ? `Historique — ${customer.name}` : 'Historique'}
      footer={<Button onClick={onClose}>Fermer</Button>}
    >
      {loading ? <Spinner /> : sales.length === 0 ? (
        <EmptyState title="Aucun achat enregistre" description="Selectionnez ce client en caisse pour rattacher ses achats." />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {sales.length} ticket(s) · total achete <b>{formatMoney(total, currency)}</b>
          </p>
          <Table head={['Ticket', 'Date', 'Total TTC', 'Statut']}>
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="td font-mono">{s.ticket_ref}</td>
                <td className="td text-xs">{formatDateTime(s.created_at)}</td>
                <td className="td tabular font-semibold">{formatMoney(s.total_ttc, currency)}</td>
                <td className="td">
                  {s.status === 'validee' ? <Badge color="green">validee</Badge> : <Badge color="red">annulee</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  )
}
