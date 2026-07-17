import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Dealer } from '../types/dealer'
import { listDealers, deleteDealer } from '../lib/dealers'
import { listAllDealerAliases } from '../lib/dealerAliases'
import { countDealerDocuments } from '../lib/dealerDocuments'
import { listSeasons } from '../lib/seasons'
import type { Season } from '../types/asset'
import { numify, type ExportColumn } from '../lib/exportFile'
import EmptyState from '../components/EmptyState'
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
  { header: 'Lieferadresse Name', value: (d) => d.shipping_name },
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
  const navigate = useNavigate()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter/Suche (rein clientseitig — die Liste ist ohnehin vollständig geladen).
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('') // '' = alle Länder
  // Alias-Namen je Händler (dealer_id → Aliasse), damit die Suche sie mitfindet.
  const [aliasMap, setAliasMap] = useState<Record<string, string[]>>({})

  // Modal: geschlossen (null) oder offen; `editing = null` legt neu an.
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Dealer | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [dealerList, seasonList, aliasList] = await Promise.all([
        listDealers(),
        listSeasons().catch(() => [] as Season[]),
        // Aliasse sind ergänzend: fehlt die Tabelle noch (Migration nicht
        // eingespielt), bleibt die Suche ohne Alias-Treffer statt zu brechen.
        listAllDealerAliases().catch(() => []),
      ])
      setDealers(dealerList)
      setSeasons(seasonList)
      const map: Record<string, string[]> = {}
      for (const a of aliasList) {
        ;(map[a.dealer_id] ??= []).push(a.alias)
      }
      setAliasMap(map)
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

  // Länder für den Filter: tatsächlich vorkommende country-Werte, alphabetisch.
  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const d of dealers) if (d.country) set.add(d.country)
    return [...set].sort((a, b) => a.localeCompare(b, 'de'))
  }, [dealers])

  // Land-Filter UND Freitextsuche (Name, Alias, Ansprechpartner, E-Mail, Ort,
  // Kundennr., Kurz-/Firmenname). Land wird case-insensitiv verglichen.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dealers.filter((d) => {
      if (country && (d.country ?? '') !== country) return false
      if (q === '') return true
      const haystack = [
        d.name,
        d.short_name,
        d.company_name,
        d.contact_name,
        d.email,
        d.city,
        d.country,
        d.kundennummer != null ? String(d.kundennummer) : null,
        ...(aliasMap[d.id] ?? []),
      ]
      return haystack.some((v) => v != null && v.toLowerCase().includes(q))
    })
  }, [dealers, country, search, aliasMap])

  return (
    <div className="mx-auto max-w-5xl">
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
            rows={filtered}
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

      {!loading && dealers.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('dealers.search.placeholder')}
            className="min-w-[16rem] flex-1 rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="">{t('dealers.filter.allCountries')}</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted tabular-nums">
            {t('dealers.filter.count', { count: filtered.length })}
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : dealers.length === 0 ? (
        <EmptyState actionLabel={t('dealers.add')} onAction={openCreate}>
          {t('dealers.empty')}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">{t('dealers.filter.noMatches')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          {/* table-fixed: Spaltenbreiten bestimmen das Layout, nicht der Inhalt.
              So sprengen lange (umbruchlose) E-Mail-Adressen die Tabelle nicht
              über den Container hinaus; sie brechen stattdessen um. */}
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="w-20 px-4 py-3 font-medium">
                  {t('dealers.col.customerNo')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="px-4 py-3 font-medium">
                  {t('dealers.col.contact')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.email')}</th>
                <th className="w-24 px-4 py-3 font-medium">
                  {t('dealers.col.city')}
                </th>
                <th className="w-44 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/dealers/${d.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-surface text-ink transition-colors hover:bg-card"
                >
                  <td className="px-4 py-3 align-top text-muted tabular-nums">
                    {d.kundennummer ?? '—'}
                  </td>
                  <td className="px-4 py-3 align-top font-medium break-words">
                    {d.name}
                  </td>
                  <td className="px-4 py-3 align-top text-muted break-words">
                    {d.contact_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 align-top text-muted break-words">
                    {d.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 align-top text-muted break-words">
                    {[d.city, d.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right align-top whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(d)
                      }}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(d)
                      }}
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
