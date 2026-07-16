import { useEffect, useState } from 'react'
import type { Dealer } from '../types/dealer'
import { listDealers, deleteDealer } from '../lib/dealers'
import { countDealerDocuments } from '../lib/dealerDocuments'
import { listSeasons } from '../lib/seasons'
import type { Season } from '../types/asset'
import { listDealerCredits, type DealerCredit } from '../lib/creditRating'
import { numify, type ExportColumn } from '../lib/exportFile'
import EmptyState from '../components/EmptyState'
import CreditBadge from '../components/CreditBadge'
import ExportButtons from '../components/ExportButtons'
import DealerEditModal from '../components/DealerEditModal'
import { useT } from '../i18n'

// ─── Export ─────────────────────────────────────────────────────────────────

/** Zahlungskonditionen als lesbarer Text (strukturiert; Fallback: Rohstring). */
function dealerTermsText(d: Dealer): string {
  const sp = numify(d.skonto_prozent)
  const st = d.skonto_tage
  const ziel = d.zahlungsziel_tage
  if (sp === null && st === null && ziel === null) return d.payment_terms_raw ?? ''
  const parts: string[] = []
  if (sp !== null && sp > 0) {
    parts.push(`${String(sp).replace('.', ',')} % Skonto in ${st ?? '—'} Tagen`)
  }
  parts.push(ziel === 0 ? 'netto sofort' : `netto ${ziel ?? '—'} Tage`)
  return parts.join(', ')
}

/** Spalten für den Händler-Export (deutsche Überschriften). */
const DEALER_EXPORT_COLUMNS: ExportColumn<Dealer>[] = [
  { header: 'Kundennummer', value: (d) => d.kundennummer },
  { header: 'Name', value: (d) => d.name },
  { header: 'Kurzname', value: (d) => d.short_name },
  { header: 'Firmenname', value: (d) => d.company_name },
  { header: 'Inhaber', value: (d) => d.owner_name },
  { header: 'Ansprechpartner', value: (d) => d.contact_name },
  { header: 'E-Mail', value: (d) => d.email },
  { header: 'UID-Nr.', value: (d) => d.uid },
  { header: 'Gegenkonto', value: (d) => d.gegenkonto },
  { header: 'Zahlungskonditionen', value: (d) => dealerTermsText(d) },
  { header: 'Zahlungsziel (Tage)', value: (d) => d.zahlungsziel_tage },
  { header: 'Skonto %', value: (d) => numify(d.skonto_prozent) },
  { header: 'Skonto-Tage', value: (d) => d.skonto_tage },
  { header: 'Lieferadresse Straße', value: (d) => d.shipping_street },
  { header: 'Lieferadresse PLZ', value: (d) => d.shipping_zip },
  { header: 'Lieferadresse Ort', value: (d) => d.shipping_city },
  { header: 'Lieferadresse Land', value: (d) => d.shipping_country_name },
  { header: 'Lieferadresse Telefon', value: (d) => d.shipping_phone },
  { header: 'Lieferadresse E-Mail', value: (d) => d.shipping_email },
  { header: 'Lieferadresse E-Mail 2', value: (d) => d.shipping_email2 },
  { header: 'Rechnungsadresse Name', value: (d) => d.billing_name },
  { header: 'Rechnungsadresse Straße', value: (d) => d.billing_street },
  { header: 'Rechnungsadresse PLZ', value: (d) => d.billing_zip },
  { header: 'Rechnungsadresse Ort', value: (d) => d.billing_city },
  { header: 'Rechnungsadresse Land', value: (d) => d.billing_country_name },
  { header: 'Rechnungsadresse Telefon', value: (d) => d.billing_phone },
  { header: 'Rechnungsadresse E-Mail', value: (d) => d.billing_email },
  { header: 'Store Name', value: (d) => d.store_name },
  { header: 'Store Straße', value: (d) => d.store_street },
  { header: 'Store PLZ', value: (d) => d.store_zip },
  { header: 'Store Ort', value: (d) => d.store_city },
  { header: 'Store Land', value: (d) => d.store_country_name },
  { header: 'Store Telefon', value: (d) => d.store_phone },
  { header: 'Store E-Mail', value: (d) => d.store_email },
]

// ─── Seite ──────────────────────────────────────────────────────────────────

export default function Dealers() {
  const t = useT()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [credits, setCredits] = useState<Map<string, DealerCredit>>(new Map())
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal: geschlossen (null) oder offen; `editing = null` legt neu an.
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Dealer | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Händler und Bonitäts-Bewertungen parallel; die Ampel ist ergänzend und
      // soll die Liste nicht blockieren, falls sie fehlschlägt.
      const [dealerList, creditMap, seasonList] = await Promise.all([
        listDealers(),
        listDealerCredits().catch(() => new Map<string, DealerCredit>()),
        listSeasons().catch(() => [] as Season[]),
      ])
      setDealers(dealerList)
      setCredits(creditMap)
      setSeasons(seasonList)
    } catch {
      setError(t('dealers.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(d: Dealer) {
    setEditing(d)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
  }

  async function handleDelete(d: Dealer) {
    if (!window.confirm(t('dealers.deleteConfirm', { name: d.name }))) return
    try {
      // Vertrauliche Dokumente dürfen nicht verwaisen: Der FK ohne cascade würde
      // das Löschen ohnehin blocken — hier eine klare Meldung statt DB-Fehler.
      const docCount = await countDealerDocuments(d.id)
      if (docCount > 0) {
        setError(t('dealers.deleteBlockedDocs', { count: docCount }))
        return
      }
      await deleteDealer(d.id)
      await load()
    } catch {
      setError(t('dealers.deleteError'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('dealers.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('dealers.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons
            filenameBase="haendler"
            sheetName="Händler"
            columns={DEALER_EXPORT_COLUMNS}
            rows={dealers}
          />
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
          >
            {t('dealers.add')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : dealers.length === 0 ? (
        <EmptyState actionLabel={t('dealers.add')} onAction={openCreate}>
          {t('dealers.empty')}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  {t('dealers.col.customerNo')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="px-4 py-3 font-medium">
                  {t('dealers.col.contact')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.email')}</th>
                <th className="px-4 py-3 font-medium">
                  {t('dealers.col.city')}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t('dealers.col.credit')}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => (
                <tr
                  key={d.id}
                  className="border-t-[0.5px] border-line bg-surface text-ink"
                >
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {d.kundennummer ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-muted">{d.contact_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{d.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {[d.city, d.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <CreditBadge credit={credits.get(d.id)} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      className="ml-4 text-muted transition-colors hover:text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <DealerEditModal
          dealer={editing}
          seasons={seasons}
          onClose={closeForm}
          onSaved={() => {
            closeForm()
            load()
          }}
        />
      )}
    </div>
  )
}
