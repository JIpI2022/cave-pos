/**
 * Sessions de caisse : historique des ouvertures / clotures et rapports Z.
 */

import { useCallback, useEffect, useState } from 'react'
import { Download, FileSpreadsheet, LockKeyhole, Search } from 'lucide-react'
import {
  Alert, Badge, Button, EmptyState, Modal, PageHeader, Spinner, Table,
} from '@/components/ui'
import { CloseCashDialog } from '@/pos/CashSessionDialogs'
import { supabase, describeError } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { formatDateTime, formatMoney } from '@/lib/format'
import { buildZReportPdf } from '@/lib/pdf'
import { downloadCsv, downloadXlsx, stampedFilename, type ExportColumn } from '@/lib/exports'
import type { CashSessionReport } from '@/types/database'

export default function CashSessions() {
  const { currency, settings } = useSettings()
  const [rows, setRows] = useState<CashSessionReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<CashSessionReport | null>(null)
  const [closing, setClosing] = useState<CashSessionReport | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: dbErr } = await supabase
      .from('v_cash_session_report').select('*').order('opened_at', { ascending: false }).limit(200)
    if (dbErr) setError(describeError(dbErr))
    else { setError(null); setRows((data ?? []) as CashSessionReport[]) }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function zRows(r: CashSessionReport) {
    return [
      { label: 'Point de vente', value: r.location_name },
      { label: 'Ouverte le', value: formatDateTime(r.opened_at) },
      { label: 'Ouverte par', value: r.opened_by_email ?? '—' },
      { label: 'Cloturee le', value: r.closed_at ? formatDateTime(r.closed_at) : 'session en cours' },
      { label: 'Cloturee par', value: r.closed_by_email ?? '—' },
      { label: 'Nombre de tickets', value: String(r.nb_tickets) },
      { label: 'Chiffre d affaires TTC', value: formatMoney(r.ca_ttc, currency), strong: true },
      { label: 'dont HT', value: formatMoney(r.ca_ht, currency) },
      { label: 'dont TVA', value: formatMoney(r.total_tva, currency) },
      { label: 'Remises accordees', value: formatMoney(r.total_remises, currency) },
      { label: 'Especes', value: formatMoney(r.total_especes, currency) },
      { label: 'Carte bancaire', value: formatMoney(r.total_carte, currency) },
      { label: 'Mobile money', value: formatMoney(r.total_mobile_money, currency) },
      ...(r.mobile_money_detail ?? []).map((d) => ({
        label: `    dont ${d.operateur ?? 'operateur non precise'}`,
        value: formatMoney(d.total, currency),
      })),
      { label: 'Retours / remboursements', value: formatMoney(r.total_retours, currency) },
      { label: 'Ventes annulees', value: String(r.nb_annulations) },
      { label: 'Fond de caisse', value: formatMoney(r.opening_float, currency) },
      { label: 'Especes theoriques', value: formatMoney(r.expected_cash ?? 0, currency), strong: true },
      { label: 'Especes comptees', value: formatMoney(r.counted_cash ?? 0, currency), strong: true },
      { label: 'Ecart de caisse', value: formatMoney(r.cash_gap ?? 0, currency), strong: true },
    ]
  }

  function downloadZ(r: CashSessionReport) {
    buildZReportPdf({
      title: `Rapport Z — ${settings?.company_name ?? ''}`,
      subtitle: `Session du ${formatDateTime(r.opened_at)} · ${r.location_name}`,
      rows: zRows(r),
      footer: r.notes || undefined,
    }).save(stampedFilename('rapport_z', 'pdf'))
  }

  const columns: ExportColumn<CashSessionReport>[] = [
    { header: 'Ouverte le', value: (r) => formatDateTime(r.opened_at) },
    { header: 'Cloturee le', value: (r) => (r.closed_at ? formatDateTime(r.closed_at) : '') },
    { header: 'Point de vente', value: (r) => r.location_name },
    { header: 'Ouverte par', value: (r) => r.opened_by_email ?? '' },
    { header: 'Tickets', value: (r) => r.nb_tickets },
    { header: 'CA TTC', value: (r) => r.ca_ttc },
    { header: 'Especes', value: (r) => r.total_especes },
    { header: 'Carte', value: (r) => r.total_carte },
    { header: 'Mobile money', value: (r) => r.total_mobile_money },
    { header: 'Retours', value: (r) => r.total_retours },
    { header: 'Fond de caisse', value: (r) => r.opening_float },
    { header: 'Especes theoriques', value: (r) => r.expected_cash ?? '' },
    { header: 'Especes comptees', value: (r) => r.counted_cash ?? '' },
    { header: 'Ecart', value: (r) => r.cash_gap ?? '' },
  ]

  return (
    <div>
      <PageHeader
        title="Sessions de caisse"
        subtitle="Ouvertures, clotures et ecarts de caisse"
        actions={
          <>
            <Button variant="secondary" icon={Download}
              onClick={() => downloadCsv(rows, columns, stampedFilename('sessions_caisse', 'csv'))}>CSV</Button>
            <Button variant="secondary" icon={FileSpreadsheet}
              onClick={() => downloadXlsx(rows, columns, stampedFilename('sessions_caisse', 'xlsx'), 'Caisses')}>Excel</Button>
          </>
        }
      />

      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}

      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="Aucune session" description="Les sessions apparaissent des la premiere ouverture de caisse." />
        ) : (
          <Table head={['Ouverte le', 'Point de vente', 'Tickets', 'CA TTC', 'Especes', 'Ecart', 'Statut', '']}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-raised">
                <td className="td whitespace-nowrap text-xs text-ink-2">{formatDateTime(r.opened_at)}</td>
                <td className="td text-sm">{r.location_name}</td>
                <td className="td tabular">{r.nb_tickets}</td>
                <td className="td tabular font-semibold">{formatMoney(r.ca_ttc, currency)}</td>
                <td className="td tabular">{formatMoney(r.total_especes, currency)}</td>
                <td className="td tabular">
                  {r.cash_gap === null ? '—' : (
                    <Badge color={Number(r.cash_gap) === 0 ? 'green' : Number(r.cash_gap) > 0 ? 'blue' : 'red'}>
                      {formatMoney(r.cash_gap, currency)}
                    </Badge>
                  )}
                </td>
                <td className="td">
                  {r.status === 'ouverte' ? <Badge color="amber">ouverte</Badge> : <Badge color="slate">cloturee</Badge>}
                </td>
                <td className="td">
                  <div className="flex gap-1">
                    <Button variant="ghost" icon={Search} onClick={() => setDetail(r)}>
                      <span className="hidden sm:inline">Rapport Z</span>
                    </Button>
                    {r.status === 'ouverte' && (
                      <Button variant="ghost" icon={LockKeyhole} onClick={() => setClosing(r)}>
                        <span className="hidden sm:inline">Cloturer</span>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <Modal
        open={Boolean(detail)} onClose={() => setDetail(null)} size="md"
        title={detail ? `Rapport Z — ${formatDateTime(detail.opened_at)}` : 'Rapport Z'}
        footer={
          <>
            <Button variant="secondary" icon={Download} onClick={() => detail && downloadZ(detail)}>
              Telecharger le PDF
            </Button>
            <Button onClick={() => setDetail(null)}>Fermer</Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-1 text-sm">
            {detail.status === 'ouverte' && (
              <Alert kind="warning">Session encore ouverte : les montants evoluent a chaque vente.</Alert>
            )}
            {zRows(detail).map((row) => (
              <div
                key={row.label}
                className={`flex items-baseline justify-between gap-3 border-b border-line py-1 ${
                  row.strong ? 'font-bold text-ink' : 'text-ink-2'}`}
              >
                <span>{row.label}</span>
                <span className="tabular">{row.value}</span>
              </div>
            ))}
            {detail.notes && (
              <p className="pt-2 text-xs italic text-ink-3">{detail.notes}</p>
            )}
          </div>
        )}
      </Modal>

      <CloseCashDialog
        open={Boolean(closing)}
        session={closing}
        onClose={() => setClosing(null)}
        onClosed={() => void load()}
      />
    </div>
  )
}
