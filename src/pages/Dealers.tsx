import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Dealer, DealerInput } from '../types/dealer'
import {
  listDealers,
  createDealer,
  updateDealer,
  deleteDealer,
} from '../lib/dealers'
import { parsePaymentTerms, formatPaymentTerms } from '../lib/paymentTerms'
import { DEFAULT_ZAHLUNGSZIEL_TAGE } from '../lib/tax'
import EmptyState from '../components/EmptyState'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/**
 * Alle Formularfelder als Strings (kontrollierte Inputs). Umwandlung in die
 * typisierten DealerInput-Werte passiert erst beim Speichern (toDealerInput).
 * `kundennummer` fehlt bewusst: bei Neuanlage vergibt der DB-Default, bei
 * Bestehenden ist sie unveränderlich (nur Anzeige).
 */
type DealerFormKey =
  | 'name'
  | 'short_name'
  | 'company_name'
  | 'owner_name'
  | 'contact_name'
  | 'email'
  | 'city'
  | 'country'
  | 'uid'
  | 'gegenkonto'
  | 'skonto_prozent'
  | 'skonto_tage'
  | 'zahlungsziel_tage'
  | 'shipping_street'
  | 'shipping_zip'
  | 'shipping_city'
  | 'shipping_country_code'
  | 'shipping_country_name'
  | 'shipping_phone'
  | 'shipping_email'
  | 'shipping_email2'
  | 'billing_name'
  | 'billing_street'
  | 'billing_zip'
  | 'billing_city'
  | 'billing_country_code'
  | 'billing_country_name'
  | 'billing_phone'
  | 'billing_email'
  | 'store_name'
  | 'store_street'
  | 'store_zip'
  | 'store_city'
  | 'store_country_code'
  | 'store_country_name'
  | 'store_phone'
  | 'store_email'

type DealerForm = Record<DealerFormKey, string>

const emptyForm: DealerForm = {
  name: '',
  short_name: '',
  company_name: '',
  owner_name: '',
  contact_name: '',
  email: '',
  city: '',
  country: 'AT',
  uid: '',
  gegenkonto: '',
  skonto_prozent: '',
  skonto_tage: '',
  zahlungsziel_tage: '',
  shipping_street: '',
  shipping_zip: '',
  shipping_city: '',
  shipping_country_code: '',
  shipping_country_name: '',
  shipping_phone: '',
  shipping_email: '',
  shipping_email2: '',
  billing_name: '',
  billing_street: '',
  billing_zip: '',
  billing_city: '',
  billing_country_code: '',
  billing_country_name: '',
  billing_phone: '',
  billing_email: '',
  store_name: '',
  store_street: '',
  store_zip: '',
  store_city: '',
  store_country_code: '',
  store_country_name: '',
  store_phone: '',
  store_email: '',
}

// ─── Umwandlungs-Helfer ─────────────────────────────────────────────────────

/** Leerer String → null, sonst getrimmt. */
function trimOrNull(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

/** Ganzzahl aus String (Komma/Punkt egal) oder null. */
function intOrNull(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number.parseInt(t.replace(',', '.'), 10)
  return Number.isNaN(n) ? null : n
}

/** Dezimalzahl aus String (Dezimalkomma erlaubt) oder null. */
function decOrNull(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

/** number/string/null → Anzeigestring fürs Formular. */
function numToStr(v: number | string | null): string {
  if (v === null || v === '') return ''
  return String(v)
}

/** Lockere E-Mail-Prüfung: entweder leer oder enthält ein @ (Auslandsadressen). */
function emailLooksValid(v: string): boolean {
  const t = v.trim()
  return t === '' || t.includes('@')
}

/** Alle E-Mail-Felder des Formulars für die Sammelvalidierung. */
const EMAIL_FIELDS: DealerFormKey[] = [
  'email',
  'shipping_email',
  'shipping_email2',
  'billing_email',
  'store_email',
]

/**
 * Formularzustand → DealerInput. Numerische Felder werden konvertiert,
 * payment_terms_raw wird aus den strukturierten Konditionen abgeleitet, damit
 * Rohstring und Struktur konsistent bleiben.
 */
function toDealerInput(f: DealerForm): DealerInput {
  const skonto_prozent = decOrNull(f.skonto_prozent)
  const skonto_tage = intOrNull(f.skonto_tage)
  const zahlungsziel_tage = intOrNull(f.zahlungsziel_tage)

  return {
    name: f.name.trim(),
    short_name: trimOrNull(f.short_name),
    company_name: trimOrNull(f.company_name),
    owner_name: trimOrNull(f.owner_name),
    contact_name: trimOrNull(f.contact_name),
    email: trimOrNull(f.email),
    city: trimOrNull(f.city),
    country: trimOrNull(f.country),

    uid: trimOrNull(f.uid),
    gegenkonto: intOrNull(f.gegenkonto),

    skonto_prozent,
    skonto_tage,
    zahlungsziel_tage,
    payment_terms_raw: formatPaymentTerms({
      skonto_prozent,
      skonto_tage,
      zahlungsziel_tage,
    }),

    shipping_street: trimOrNull(f.shipping_street),
    shipping_zip: trimOrNull(f.shipping_zip),
    shipping_city: trimOrNull(f.shipping_city),
    shipping_country_code: trimOrNull(f.shipping_country_code),
    shipping_country_name: trimOrNull(f.shipping_country_name),
    shipping_phone: trimOrNull(f.shipping_phone),
    shipping_email: trimOrNull(f.shipping_email),
    shipping_email2: trimOrNull(f.shipping_email2),

    billing_name: trimOrNull(f.billing_name),
    billing_street: trimOrNull(f.billing_street),
    billing_zip: trimOrNull(f.billing_zip),
    billing_city: trimOrNull(f.billing_city),
    billing_country_code: trimOrNull(f.billing_country_code),
    billing_country_name: trimOrNull(f.billing_country_name),
    billing_phone: trimOrNull(f.billing_phone),
    billing_email: trimOrNull(f.billing_email),

    store_name: trimOrNull(f.store_name),
    store_street: trimOrNull(f.store_street),
    store_zip: trimOrNull(f.store_zip),
    store_city: trimOrNull(f.store_city),
    store_country_code: trimOrNull(f.store_country_code),
    store_country_name: trimOrNull(f.store_country_name),
    store_phone: trimOrNull(f.store_phone),
    store_email: trimOrNull(f.store_email),
  }
}

/**
 * Bestehenden Händler → Formularzustand. Zahlungskonditionen werden aus den
 * gespeicherten Strukturwerten vorbefüllt; fehlen diese, aber es gibt einen
 * payment_terms_raw (Import-Altbestand), wird dieser als Vorbefüllung geparst.
 */
function dealerToForm(d: Dealer): DealerForm {
  const parsed = d.payment_terms_raw
    ? parsePaymentTerms(d.payment_terms_raw)
    : null
  const skonto_prozent = d.skonto_prozent ?? parsed?.skonto_prozent ?? null
  const skonto_tage = d.skonto_tage ?? parsed?.skonto_tage ?? null
  const zahlungsziel_tage =
    d.zahlungsziel_tage ?? parsed?.zahlungsziel_tage ?? null

  return {
    name: d.name,
    short_name: d.short_name ?? '',
    company_name: d.company_name ?? '',
    owner_name: d.owner_name ?? '',
    contact_name: d.contact_name ?? '',
    email: d.email ?? '',
    city: d.city ?? '',
    country: d.country ?? 'AT',
    uid: d.uid ?? '',
    gegenkonto: numToStr(d.gegenkonto),
    skonto_prozent: numToStr(skonto_prozent),
    skonto_tage: numToStr(skonto_tage),
    zahlungsziel_tage: numToStr(zahlungsziel_tage),
    shipping_street: d.shipping_street ?? '',
    shipping_zip: d.shipping_zip ?? '',
    shipping_city: d.shipping_city ?? '',
    shipping_country_code: d.shipping_country_code ?? '',
    shipping_country_name: d.shipping_country_name ?? '',
    shipping_phone: d.shipping_phone ?? '',
    shipping_email: d.shipping_email ?? '',
    shipping_email2: d.shipping_email2 ?? '',
    billing_name: d.billing_name ?? '',
    billing_street: d.billing_street ?? '',
    billing_zip: d.billing_zip ?? '',
    billing_city: d.billing_city ?? '',
    billing_country_code: d.billing_country_code ?? '',
    billing_country_name: d.billing_country_name ?? '',
    billing_phone: d.billing_phone ?? '',
    billing_email: d.billing_email ?? '',
    store_name: d.store_name ?? '',
    store_street: d.store_street ?? '',
    store_zip: d.store_zip ?? '',
    store_city: d.store_city ?? '',
    store_country_code: d.store_country_code ?? '',
    store_country_name: d.store_country_name ?? '',
    store_phone: d.store_phone ?? '',
    store_email: d.store_email ?? '',
  }
}

/** Lesbare Klartext-Zusammenfassung der Konditionen fürs Formular. */
function readableTerms(f: DealerForm): string {
  const sp = decOrNull(f.skonto_prozent)
  const st = intOrNull(f.skonto_tage)
  const ziel = intOrNull(f.zahlungsziel_tage)
  if (sp === null && st === null && ziel === null) {
    return `Keine Kondition hinterlegt → Hausstandard (netto ${DEFAULT_ZAHLUNGSZIEL_TAGE} Tage).`
  }
  const parts: string[] = []
  if (sp !== null && sp > 0) {
    parts.push(
      `${String(sp).replace('.', ',')} % Skonto bei Zahlung in ${st ?? '—'} Tagen`,
    )
  }
  parts.push(ziel === 0 ? 'netto sofort' : `netto ${ziel ?? DEFAULT_ZAHLUNGSZIEL_TAGE} Tage`)
  return parts.join(', ')
}

// ─── Präsentations-Komponenten ──────────────────────────────────────────────

/** Ein beschriftetes Textfeld. */
function Field({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email'
  placeholder?: string
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  )
}

/** Ein Abschnitt mit Überschrift, optional ein-/ausklappbar. */
function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const heading = (
    <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
      {title}
    </span>
  )

  if (!collapsible) {
    return (
      <fieldset className="flex flex-col gap-3 border-t-[0.5px] border-line pt-4">
        {heading}
        {children}
      </fieldset>
    )
  }

  return (
    <div className="border-t-[0.5px] border-line pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        {heading}
        <span className="text-sm text-muted">{open ? '–' : '+'}</span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  )
}

/**
 * Ein Adressblock (Liefer-/Rechnungs-/Store-Adresse). Die Feldnamen werden aus
 * dem Präfix gebildet; das Set der Präfix-Spalten ist in DealerFormKey typisiert.
 */
function AddressBlock({
  prefix,
  form,
  set,
  withName = false,
  withEmail2 = false,
}: {
  prefix: 'shipping' | 'billing' | 'store'
  form: DealerForm
  set: (key: DealerFormKey, value: string) => void
  withName?: boolean
  withEmail2?: boolean
}) {
  const k = (suffix: string) => `${prefix}_${suffix}` as DealerFormKey
  const f = (suffix: string) => form[k(suffix)]
  return (
    <>
      {withName && (
        <Field label="Name" value={f('name')} onChange={(v) => set(k('name'), v)} />
      )}
      <Field label="Straße" value={f('street')} onChange={(v) => set(k('street'), v)} />
      <div className="flex gap-3">
        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-xs text-muted">PLZ</span>
          <input
            type="text"
            value={f('zip')}
            onChange={(e) => set(k('zip'), e.target.value)}
            className={inputClass}
          />
        </label>
        <Field label="Ort" value={f('city')} onChange={(v) => set(k('city'), v)} />
      </div>
      <div className="flex gap-3">
        <Field
          label="Ländercode"
          value={f('country_code')}
          onChange={(v) => set(k('country_code'), v)}
          placeholder="z. B. CH"
        />
        <Field
          label="Land"
          value={f('country_name')}
          onChange={(v) => set(k('country_name'), v)}
        />
      </div>
      <Field label="Telefon" value={f('phone')} onChange={(v) => set(k('phone'), v)} />
      <Field
        label="E-Mail"
        type="email"
        inputMode="email"
        value={f('email')}
        onChange={(v) => set(k('email'), v)}
      />
      {withEmail2 && (
        <Field
          label="E-Mail 2"
          type="email"
          inputMode="email"
          value={f('shipping_email2')}
          onChange={(v) => set('shipping_email2', v)}
        />
      )}
    </>
  )
}

// ─── Seite ──────────────────────────────────────────────────────────────────

export default function Dealers() {
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Dealer | null>(null)
  const [form, setForm] = useState<DealerForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function set(key: DealerFormKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setDealers(await listDealers())
    } catch {
      setError('Händler konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(d: Dealer) {
    setEditing(d)
    setForm(dealerToForm(d))
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!form.name.trim()) {
      setFormError('Name ist erforderlich.')
      return
    }
    const badEmail = EMAIL_FIELDS.find((key) => !emailLooksValid(form[key]))
    if (badEmail) {
      setFormError('Bitte eine gültige E-Mail-Adresse eingeben (muss ein @ enthalten).')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload = toDealerInput(form)
      if (editing) {
        await updateDealer(editing.id, payload)
      } else {
        await createDealer(payload)
      }
      closeForm()
      await load()
    } catch {
      setFormError('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(d: Dealer) {
    if (!window.confirm(`Händler „${d.name}" wirklich löschen?`)) return
    try {
      await deleteDealer(d.id)
      await load()
    } catch {
      setError('Löschen fehlgeschlagen.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">Händler</h1>
          <p className="mt-1 text-sm text-muted">
            Stammdaten, Konditionen und Adressen der Fachhandels-Kontakte.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
        >
          Händler hinzufügen
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : dealers.length === 0 ? (
        <EmptyState actionLabel="Händler hinzufügen" onAction={openCreate}>
          Hier verwaltest du deine Fachhandels-Kontakte. Lege den ersten Händler
          an.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Kd.-Nr.</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Ansprechpartner</th>
                <th className="px-4 py-3 font-medium">E-Mail</th>
                <th className="px-4 py-3 font-medium">Ort</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => (
                <tr
                  key={d.id}
                  className="border-t-[0.5px] border-line bg-white text-ink"
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
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      className="ml-4 text-muted transition-colors hover:text-red-700"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4 py-8">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-cream shadow-xl">
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
              <div className="flex items-baseline justify-between px-6 pt-6 pb-4">
                <h2 className="text-lg font-medium text-ink">
                  {editing ? 'Händler bearbeiten' : 'Händler hinzufügen'}
                </h2>
                {editing && (
                  <span className="text-xs text-muted">
                    Kd.-Nr.{' '}
                    <span className="tabular-nums text-ink">
                      {editing.kundennummer ?? '—'}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6">
                {/* Stammdaten */}
                <Section title="Stammdaten">
                  <Field
                    label="Name *"
                    value={form.name}
                    onChange={(v) => set('name', v)}
                  />
                  <div className="flex gap-3">
                    <Field
                      label="Kurzname"
                      value={form.short_name}
                      onChange={(v) => set('short_name', v)}
                    />
                    <Field
                      label="Firmenname"
                      value={form.company_name}
                      onChange={(v) => set('company_name', v)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <Field
                      label="Inhaber"
                      value={form.owner_name}
                      onChange={(v) => set('owner_name', v)}
                    />
                    <Field
                      label="Ansprechpartner"
                      value={form.contact_name}
                      onChange={(v) => set('contact_name', v)}
                    />
                  </div>
                  <Field
                    label="E-Mail"
                    type="email"
                    inputMode="email"
                    value={form.email}
                    onChange={(v) => set('email', v)}
                  />
                  <div className="flex gap-3">
                    <Field
                      label="Ort"
                      value={form.city}
                      onChange={(v) => set('city', v)}
                    />
                    <label className="flex w-24 flex-col gap-1.5">
                      <span className="text-xs text-muted">Land</span>
                      <input
                        type="text"
                        value={form.country}
                        onChange={(e) => set('country', e.target.value)}
                        className={inputClass}
                      />
                    </label>
                  </div>
                  {!editing && (
                    <p className="text-xs text-muted">
                      Die Kundennummer wird beim Speichern automatisch vergeben.
                    </p>
                  )}
                </Section>

                {/* Steuer & Buchhaltung */}
                <Section title="Steuer & Buchhaltung">
                  <div className="flex gap-3">
                    <Field
                      label="UID-Nr. (optional)"
                      value={form.uid}
                      onChange={(v) => set('uid', v)}
                      placeholder="z. B. ATU61622989"
                    />
                    <Field
                      label="Gegenkonto"
                      inputMode="numeric"
                      value={form.gegenkonto}
                      onChange={(v) => set('gegenkonto', v)}
                    />
                  </div>
                </Section>

                {/* Zahlungskonditionen */}
                <Section title="Zahlungskonditionen">
                  <div className="flex gap-3">
                    <Field
                      label="Skonto %"
                      inputMode="decimal"
                      value={form.skonto_prozent}
                      onChange={(v) => set('skonto_prozent', v)}
                      placeholder="z. B. 3"
                    />
                    <Field
                      label="Skonto-Tage"
                      inputMode="numeric"
                      value={form.skonto_tage}
                      onChange={(v) => set('skonto_tage', v)}
                      placeholder="z. B. 10"
                    />
                    <Field
                      label="Zahlungsziel (Tage)"
                      inputMode="numeric"
                      value={form.zahlungsziel_tage}
                      onChange={(v) => set('zahlungsziel_tage', v)}
                      placeholder="z. B. 30"
                    />
                  </div>
                  <p className="text-xs text-muted">{readableTerms(form)}</p>
                  {editing?.payment_terms_raw && (
                    <p className="text-xs text-muted">
                      Importiert:{' '}
                      <span className="text-ink">{editing.payment_terms_raw}</span>
                    </p>
                  )}
                </Section>

                {/* Adressen (ausklappbar; beim Bearbeiten offen) */}
                <Section
                  title="Lieferadresse"
                  collapsible
                  defaultOpen={!!editing}
                >
                  <AddressBlock prefix="shipping" form={form} set={set} withEmail2 />
                </Section>

                <Section
                  title="Rechnungsadresse"
                  collapsible
                  defaultOpen={!!editing}
                >
                  <AddressBlock prefix="billing" form={form} set={set} withName />
                </Section>

                <Section
                  title="Store / POS"
                  collapsible
                  defaultOpen={!!editing}
                >
                  <AddressBlock prefix="store" form={form} set={set} withName />
                </Section>

                {formError && (
                  <p className="text-sm text-red-700">{formError}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 pt-4 pb-6">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
