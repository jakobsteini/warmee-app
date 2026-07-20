import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { listOssRates, createOssRate, updateOssRate } from '../lib/ossRates'
import type { OssCountryRate } from '../types/ossRate'
import { COUNTRIES, countryLabel } from '../lib/countries'
import { parseDecimalField } from '../lib/paymentTerms'
import { useI18n } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Faktor (0.19) → Prozent-String für die Anzeige („19", „19,5"). */
function factorToPercent(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v
  if (Number.isNaN(n)) return ''
  return String(Math.round(n * 10000) / 100).replace('.', ',')
}

export default function OssRates() {
  const { t, lang } = useI18n()
  const [rates, setRates] = useState<OssCountryRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editierbarer Prozent-Entwurf je Zeile (String, damit Tippen frei ist).
  const [pctDraft, setPctDraft] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  // Neues Land
  const [newCountry, setNewCountry] = useState('')
  const [newPct, setNewPct] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await listOssRates()
      setRates(r)
      setPctDraft(
        Object.fromEntries(r.map((x) => [x.id, factorToPercent(x.vat_rate)])),
      )
    } catch {
      setError(t('oss.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // EU-Länder, die noch KEINE Zeile haben (OSS gilt nur EU; AT ist Inland).
  const addableCountries = useMemo(() => {
    const present = new Set(rates.map((r) => r.country_iso2.toUpperCase()))
    return COUNTRIES.filter(
      (c) => c.eu && c.code !== 'AT' && !present.has(c.code),
    )
  }, [rates])

  async function saveRate(r: OssCountryRate) {
    const parsed = parseDecimalField(pctDraft[r.id] ?? '')
    if (!parsed.ok || parsed.value === null) {
      setError(t('oss.rateInvalid'))
      return
    }
    setSavingId(r.id)
    setError(null)
    try {
      await updateOssRate(r.id, { vat_rate: parsed.value / 100 })
      await load()
    } catch {
      setError(t('oss.saveError'))
    } finally {
      setSavingId(null)
    }
  }

  async function toggleActive(r: OssCountryRate) {
    setSavingId(r.id)
    setError(null)
    try {
      await updateOssRate(r.id, { active: !r.active })
      await load()
    } catch {
      setError(t('oss.saveError'))
    } finally {
      setSavingId(null)
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const parsed = parseDecimalField(newPct)
    const country = COUNTRIES.find((c) => c.code === newCountry)
    if (!country || !parsed.ok || parsed.value === null) {
      setAddError(t('oss.addIncomplete'))
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      await createOssRate({
        country_iso2: country.code,
        country_name: country.de,
        vat_rate: parsed.value / 100,
        active: true,
      })
      setNewCountry('')
      setNewPct('')
      await load()
    } catch {
      setAddError(t('oss.addError'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">{t('oss.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('oss.subtitle')}</p>
      </div>

      <div className="mb-6 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-muted">
        {t('oss.hint')}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border-[0.5px] border-line">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('oss.col.country')}</th>
                <th className="px-4 py-3 font-medium">{t('oss.col.iso')}</th>
                <th className="px-4 py-3 font-medium">{t('oss.col.rate')}</th>
                <th className="px-4 py-3 font-medium">{t('oss.col.active')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-t-[0.5px] border-line">
                  <td className="px-4 py-2 text-ink">{r.country_name}</td>
                  <td className="px-4 py-2 text-muted">{r.country_iso2}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pctDraft[r.id] ?? ''}
                        onChange={(e) =>
                          setPctDraft((d) => ({ ...d, [r.id]: e.target.value }))
                        }
                        className={`${inputClass} w-20 text-right`}
                      />
                      <span className="text-muted">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => toggleActive(r)}
                      disabled={savingId === r.id}
                      className={`rounded-full px-3 py-1 text-xs ${
                        r.active
                          ? 'bg-ink text-cream'
                          : 'border-[0.5px] border-line text-muted'
                      }`}
                    >
                      {r.active ? t('oss.active') : t('oss.inactive')}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => saveRate(r)}
                      disabled={savingId === r.id}
                      className="text-sm text-muted transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {t('common.save')}
                    </button>
                  </td>
                </tr>
              ))}
              {rates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    {t('oss.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Neues Land */}
      <form
        onSubmit={handleAdd}
        className="mt-6 rounded-lg border-[0.5px] border-line p-4"
      >
        <h2 className="mb-3 text-sm font-medium text-ink">{t('oss.addTitle')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('oss.col.country')}</span>
            <select
              value={newCountry}
              onChange={(e) => setNewCountry(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {addableCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {countryLabel(c.code, lang)} ({c.code})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('oss.col.rate')} (%)</span>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={newPct}
                onChange={(e) => setNewPct(e.target.value)}
                placeholder="19"
                className={`${inputClass} w-24 text-right`}
              />
              <span className="text-muted">%</span>
            </div>
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream disabled:opacity-50"
          >
            {t('oss.add')}
          </button>
        </div>
        {addError && <p className="mt-2 text-sm text-red-700">{addError}</p>}
      </form>
    </div>
  )
}
