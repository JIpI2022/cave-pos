/** Fournisseurs : fiche simple et acces rapide aux receptions. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Modal, PageHeader,
  Spinner, Table, Textarea,
} from '@/components/ui'
import { supabase, describeError } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { searchKey } from '@/lib/format'
import { downloadCsv, stampedFilename, type ExportColumn } from '@/lib/exports'
import type { Supplier } from '@/types/database'

export default function Suppliers() {
  const toast = useToast()
  const [rows, setRows] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setRows((data ?? []) as Supplier[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const key = searchKey(search)
    if (!key) return rows
    return rows.filter((s) =>
      searchKey(s.name).includes(key) || searchKey(s.contact).includes(key) || (s.phone ?? '').includes(key))
  }, [rows, search])

  const columns: ExportColumn<Supplier>[] = [
    { header: 'Nom', value: (s) => s.name },
    { header: 'Contact', value: (s) => s.contact },
    { header: 'Telephone', value: (s) => s.phone },
    { header: 'E-mail', value: (s) => s.email },
    { header: 'Adresse', value: (s) => s.address },
    { header: 'Actif', value: (s) => (s.active ? 'oui' : 'non') },
  ]

  async function remove(supplier: Supplier) {
    if (!window.confirm(`Supprimer le fournisseur « ${supplier.name} » ?`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', supplier.id)
    if (error) toast.error(describeError(error))
    else { toast.success('Fournisseur supprime.'); void load() }
  }

  return (
    <div>
      <PageHeader
        title="Fournisseurs"
        subtitle={`${rows.length} fournisseur(s)`}
        actions={
          <>
            <Button variant="secondary" icon={Download}
              onClick={() => downloadCsv(filtered, columns, stampedFilename('fournisseurs', 'csv'))}>CSV</Button>
            <Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Nouveau fournisseur</Button>
          </>
        }
      />

      <div className="card mb-3 p-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un fournisseur..." />
      </div>

      <div className="card">
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title="Aucun fournisseur" description="Ajoutez vos fournisseurs pour saisir des receptions." />
        ) : (
          <Table head={['Nom', 'Contact', 'Telephone', 'E-mail', 'Statut', '']}>
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-raised">
                <td className="td font-medium text-ink">{s.name}</td>
                <td className="td text-sm">{s.contact || '—'}</td>
                <td className="td text-sm">{s.phone || '—'}</td>
                <td className="td text-sm">{s.email || '—'}</td>
                <td className="td">{s.active ? <Badge color="green">actif</Badge> : <Badge color="slate">inactif</Badge>}</td>
                <td className="td">
                  <div className="flex gap-1">
                    <Button variant="ghost" icon={Pencil} onClick={() => { setEditing(s); setFormOpen(true) }} />
                    <Button variant="ghost" icon={Trash2} onClick={() => void remove(s)} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <SupplierForm
        open={formOpen} supplier={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); void load() }}
      />
    </div>
  )
}

function SupplierForm({
  open, supplier, onClose, onSaved,
}: { open: boolean; supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: '', contact: '', phone: '', email: '', address: '', notes: '', active: true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({
      name: supplier?.name ?? '', contact: supplier?.contact ?? '', phone: supplier?.phone ?? '',
      email: supplier?.email ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '',
      active: supplier?.active ?? true,
    })
    setError(null)
  }, [open, supplier])

  async function submit() {
    if (!form.name.trim()) { setError('Le nom est obligatoire.'); return }
    setBusy(true)
    setError(null)
    try {
      const payload = { ...form, name: form.name.trim() }
      const { error: dbErr } = supplier
        ? await supabase.from('suppliers').update(payload).eq('id', supplier.id)
        : await supabase.from('suppliers').insert(payload)
      if (dbErr) throw dbErr
      toast.success(supplier ? 'Fournisseur modifie.' : 'Fournisseur cree.')
      onSaved()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open} onClose={onClose} title={supplier ? `Modifier : ${supplier.name}` : 'Nouveau fournisseur'}
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
          <Field label="Nom" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Personne de contact">
            <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </Field>
          <Field label="Telephone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          </Field>
          <Field label="E-mail">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" />
          </Field>
          <Field label="Adresse">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        <Checkbox label="Fournisseur actif" checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </div>
    </Modal>
  )
}
