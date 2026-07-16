import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { CustomerGroup, Dealer, DealerInput } from '../types/dealer'
import { createDealer, updateDealer } from '../lib/dealers'
import {
  listDealerEmails,
  createDealerEmail,
  deleteDealerEmail,
} from '../lib/dealerEmails'
import {
  listDealerPriorities,
  setDealerPriority,
  deleteDealerPriority,
} from '../lib/dealerPriorities'
import {
  listDealerDocuments,
  uploadDealerDocument,
  signedDocumentUrl,
  deleteDealerDocument,
} from '../lib/dealerDocuments'
import {
  DEALER_DOCUMENT_CATEGORIES,
  type DealerDocument,
  type DealerDocumentCategory,
} from '../types/dealerDocument'
import {
  DEALER_EMAIL_ROLES,
  type DealerEmail,
  type DealerEmailRole,
} from '../types/dealerEmail'
import type { Season } from '../types/asset'
import { parsePaymentTerms, formatPaymentTerms } from '../lib/paymentTerms'
import { DEFAULT_ZAHLUNGSZIEL_TAGE } from '../lib/tax'
import { useT, type TFunc } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** E-Mail-Rolle → Übersetzungs-Key. */
function emailRoleKey(role: DealerEmailRole): TranslationKey {
  return `dealerEmail.role.${role}` as TranslationKey
}

/** Eine E-Mail-Zeile im Formular (id nur, wenn bereits persistiert). */
interface EmailRow {
  id?: string
  email: string
  role: DealerEmailRole
}

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

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
  | 'customer_group'
  | 'discount_percent'
  | 'credit_limit'
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
  customer_group: 'b2b',
  discount_percent: '',
  credit_limit: '',
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

/** Dokument-Kategorie → Übersetzungs-Key. */
function docCategoryKey(category: DealerDocumentCategory): TranslationKey {
  return `dealerDoc.category.${category}` as TranslationKey
}

/** Dateigröße menschenlesbar (kB/MB), oder leer wenn unbekannt. */
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** ISO-Datum als deutsches Kurzdatum, oder leer. */
function docDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

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

/** numeric (evtl. als "0.00"-String von Postgres) → knapper Anzeigestring. */
function pgNumToStr(v: number | string | null): string {
  if (v === null || v === '') return ''
  const n = Number(v)
  return Number.isNaN(n) ? '' : String(n)
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

    customer_group: (f.customer_group === 'b2c' ? 'b2c' : 'b2b') as CustomerGroup,
    discount_percent: decOrNull(f.discount_percent) ?? 0,
    credit_limit: decOrNull(f.credit_limit),

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
    customer_group: d.customer_group ?? 'b2b',
    discount_percent: pgNumToStr(d.discount_percent),
    credit_limit: pgNumToStr(d.credit_limit),
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
function readableTerms(f: DealerForm, t: TFunc): string {
  const sp = decOrNull(f.skonto_prozent)
  const st = intOrNull(f.skonto_tage)
  const ziel = intOrNull(f.zahlungsziel_tage)
  if (sp === null && st === null && ziel === null) {
    return t('dealers.terms.none', { days: DEFAULT_ZAHLUNGSZIEL_TAGE })
  }
  const parts: string[] = []
  if (sp !== null && sp > 0) {
    parts.push(
      t('dealers.terms.cashDiscount', {
        pct: String(sp).replace('.', ','),
        days: st ?? '—',
      }),
    )
  }
  parts.push(
    ziel === 0
      ? t('dealers.terms.netImmediate')
      : t('dealers.terms.net', { days: ziel ?? DEFAULT_ZAHLUNGSZIEL_TAGE }),
  )
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
  t,
  withName = false,
  withEmail2 = false,
}: {
  prefix: 'shipping' | 'billing' | 'store'
  form: DealerForm
  set: (key: DealerFormKey, value: string) => void
  t: TFunc
  withName?: boolean
  withEmail2?: boolean
}) {
  const k = (suffix: string) => `${prefix}_${suffix}` as DealerFormKey
  const f = (suffix: string) => form[k(suffix)]
  return (
    <>
      {withName && (
        <Field label={t('common.name')} value={f('name')} onChange={(v) => set(k('name'), v)} />
      )}
      <Field label={t('dealers.addr.street')} value={f('street')} onChange={(v) => set(k('street'), v)} />
      <div className="flex gap-3">
        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-xs text-muted">{t('dealers.addr.zip')}</span>
          <input
            type="text"
            value={f('zip')}
            onChange={(e) => set(k('zip'), e.target.value)}
            className={inputClass}
          />
        </label>
        <Field label={t('dealers.col.city')} value={f('city')} onChange={(v) => set(k('city'), v)} />
      </div>
      <div className="flex gap-3">
        <Field
          label={t('dealers.addr.countryCode')}
          value={f('country_code')}
          onChange={(v) => set(k('country_code'), v)}
          placeholder={t('dealers.ph.countryCode')}
        />
        <Field
          label={t('dealers.field.country')}
          value={f('country_name')}
          onChange={(v) => set(k('country_name'), v)}
        />
      </div>
      <Field label={t('dealers.addr.phone')} value={f('phone')} onChange={(v) => set(k('phone'), v)} />
      <Field
        label={t('common.email')}
        type="email"
        inputMode="email"
        value={f('email')}
        onChange={(v) => set(k('email'), v)}
      />
      {withEmail2 && (
        <Field
          label={t('dealers.addr.email2')}
          type="email"
          inputMode="email"
          value={f('shipping_email2')}
          onChange={(v) => set('shipping_email2', v)}
        />
      )}
    </>
  )
}

// ─── Modal ──────────────────────────────────────────────────────────────────

/**
 * Anlege-/Bearbeiten-Formular eines Händlers als Modal. `dealer = null` legt neu
 * an, sonst wird bearbeitet. Der eigene State (Formular, E-Mail-Verteiler,
 * Prioritäten, Dokumente) lebt komplett hier — eine einzige Quelle, aus Liste
 * und Detailseite gleichermaßen nutzbar. `onSaved` wird nach erfolgreichem
 * Speichern gerufen (Aufrufer lädt neu), `onClose` beim Abbrechen.
 */
export default function DealerEditModal({
  dealer,
  seasons,
  onClose,
  onSaved,
}: {
  dealer: Dealer | null
  seasons: Season[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()

  const [form, setForm] = useState<DealerForm>(
    dealer ? dealerToForm(dealer) : emptyForm,
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // ─── Relationen des Händlers (eigene Tabellen) ─────────────────────────────
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [originalEmails, setOriginalEmails] = useState<DealerEmail[]>([])
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<DealerEmailRole>('order_confirmation')
  // Priorität je Saison: season_id → Eingabestring; original als Zahl zum Diff.
  const [priorities, setPriorities] = useState<Record<string, string>>({})
  const [originalPriorities, setOriginalPriorities] = useState<
    Record<string, number>
  >({})
  // Dokumente des Händlers (nur Bearbeiten). Anders als E-Mails/Prioritäten
  // wirken Upload/Löschen SOFORT (echte Dateien) — nicht erst beim Speichern.
  const [documents, setDocuments] = useState<DealerDocument[]>([])
  const [docCategory, setDocCategory] =
    useState<DealerDocumentCategory>('contract')
  const [docBusy, setDocBusy] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)

  function set(key: DealerFormKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /** Saisons für den Prioritäts-Bereich (aktive zuerst). */
  const sortedSeasons = [...seasons].sort(
    (a, b) => Number(!!b.is_active) - Number(!!a.is_active),
  )

  // E-Mail-Verteiler, Saison-Prioritäten und Dokumente des Händlers nachladen.
  // Sind ergänzend — schlägt es fehl, bleibt das Formular nutzbar.
  useEffect(() => {
    if (!dealer) return
    let cancelled = false
    ;(async () => {
      try {
        const [em, pr, docs] = await Promise.all([
          listDealerEmails(dealer.id),
          listDealerPriorities(dealer.id),
          listDealerDocuments(dealer.id),
        ])
        if (cancelled) return
        setOriginalEmails(em)
        setEmails(em.map((e) => ({ id: e.id, email: e.email, role: e.role })))
        const prMap: Record<string, number> = {}
        for (const p of pr) prMap[p.season_id] = p.priority
        setOriginalPriorities(prMap)
        setPriorities(
          Object.fromEntries(
            Object.entries(prMap).map(([k, v]) => [k, String(v)]),
          ),
        )
        setDocuments(docs)
      } catch {
        /* Relationen sind ergänzend */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealer])

  /** Datei sofort hochladen (nur im Bearbeiten-Modus mit bestehender dealer_id). */
  async function handleUploadDoc(file: File) {
    if (!dealer) return
    setDocBusy(true)
    setDocError(null)
    try {
      await uploadDealerDocument(dealer.id, file, docCategory)
      setDocuments(await listDealerDocuments(dealer.id))
    } catch {
      setDocError(t('dealerDoc.uploadError'))
    } finally {
      setDocBusy(false)
    }
  }

  /** Dokument über eine Signed URL im neuen Tab öffnen. */
  async function handleDownloadDoc(doc: DealerDocument) {
    setDocError(null)
    try {
      window.open(await signedDocumentUrl(doc.storage_path), '_blank', 'noopener')
    } catch {
      setDocError(t('dealerDoc.downloadError'))
    }
  }

  /** Dokument löschen (Datei + Eintrag). */
  async function handleDeleteDoc(doc: DealerDocument) {
    if (!window.confirm(t('dealerDoc.deleteConfirm', { name: doc.file_name })))
      return
    setDocError(null)
    try {
      await deleteDealerDocument(doc)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } catch {
      setDocError(t('dealerDoc.deleteError'))
    }
  }

  function addEmailRow() {
    const value = addEmail.trim()
    if (value === '' || !value.includes('@')) return
    setEmails((prev) => [...prev, { email: value, role: addRole }])
    setAddEmail('')
  }

  function removeEmailRow(index: number) {
    setEmails((prev) => prev.filter((_, i) => i !== index))
  }

  /** E-Mails und Prioritäten des gespeicherten Händlers abgleichen. */
  async function saveRelations(dealerId: string) {
    // E-Mails: entfernte (persistierte, jetzt nicht mehr in der Liste) löschen,
    // neue (ohne id) anlegen. Bestehende Zeilen werden nicht editiert.
    const removed = originalEmails.filter(
      (o) => !emails.some((e) => e.id === o.id),
    )
    const added = emails.filter((e) => !e.id && e.email.trim() !== '')
    await Promise.all(removed.map((o) => deleteDealerEmail(o.id)))
    await Promise.all(
      added.map((e) => createDealerEmail(dealerId, { email: e.email, role: e.role })),
    )

    // Prioritäten je Saison: gesetzte upserten, geleerte (vorher vorhanden) löschen.
    for (const s of seasons) {
      const parsed = intOrNull(priorities[s.id] ?? '')
      const orig = originalPriorities[s.id]
      if (parsed !== null && parsed !== orig) {
        await setDealerPriority(dealerId, s.id, parsed)
      } else if (parsed === null && orig !== undefined) {
        await deleteDealerPriority(dealerId, s.id)
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!form.name.trim()) {
      setFormError(t('common.nameRequired'))
      return
    }
    const badEmail = EMAIL_FIELDS.find((key) => !emailLooksValid(form[key]))
    if (badEmail || emails.some((e) => !emailLooksValid(e.email))) {
      setFormError(t('dealers.emailInvalid'))
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload = toDealerInput(form)
      const saved = dealer
        ? await updateDealer(dealer.id, payload)
        : await createDealer(payload)
      await saveRelations(saved.id)
      onSaved()
    } catch {
      setFormError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-cream shadow-xl">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="flex items-baseline justify-between px-6 pt-6 pb-4">
            <h2 className="text-lg font-medium text-ink">
              {dealer ? t('dealers.edit') : t('dealers.add')}
            </h2>
            {dealer && (
              <span className="text-xs text-muted">
                {t('dealers.col.customerNo')}{' '}
                <span className="tabular-nums text-ink">
                  {dealer.kundennummer ?? '—'}
                </span>
              </span>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6">
            {/* Stammdaten */}
            <Section title={t('dealers.section.master')}>
              <Field
                label={t('dealers.field.nameReq')}
                value={form.name}
                onChange={(v) => set('name', v)}
              />
              <div className="flex gap-3">
                <Field
                  label={t('dealers.field.shortName')}
                  value={form.short_name}
                  onChange={(v) => set('short_name', v)}
                />
                <Field
                  label={t('dealers.field.companyName')}
                  value={form.company_name}
                  onChange={(v) => set('company_name', v)}
                />
              </div>
              <div className="flex gap-3">
                <Field
                  label={t('dealers.field.owner')}
                  value={form.owner_name}
                  onChange={(v) => set('owner_name', v)}
                />
                <Field
                  label={t('dealers.col.contact')}
                  value={form.contact_name}
                  onChange={(v) => set('contact_name', v)}
                />
              </div>
              <Field
                label={t('common.email')}
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(v) => set('email', v)}
              />
              <div className="flex gap-3">
                <Field
                  label={t('dealers.col.city')}
                  value={form.city}
                  onChange={(v) => set('city', v)}
                />
                <label className="flex w-24 flex-col gap-1.5">
                  <span className="text-xs text-muted">{t('dealers.field.country')}</span>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => set('country', e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              {!dealer && (
                <p className="text-xs text-muted">
                  {t('dealers.field.custNoHint')}
                </p>
              )}
            </Section>

            {/* Kundengruppe & Konditionen */}
            <Section title={t('dealers.section.classification')}>
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-xs text-muted">
                    {t('dealers.field.customerGroup')}
                  </span>
                  <select
                    value={form.customer_group}
                    onChange={(e) => set('customer_group', e.target.value)}
                    className={inputClass}
                  >
                    <option value="b2b">{t('dealers.group.b2b')}</option>
                    <option value="b2c">{t('dealers.group.b2c')}</option>
                  </select>
                </label>
                <Field
                  label={t('dealers.field.discount')}
                  inputMode="decimal"
                  value={form.discount_percent}
                  onChange={(v) => set('discount_percent', v)}
                  placeholder={t('dealers.ph.discount')}
                />
                <Field
                  label={t('dealers.field.creditLimit')}
                  inputMode="decimal"
                  value={form.credit_limit}
                  onChange={(v) => set('credit_limit', v)}
                  placeholder={t('dealers.ph.creditLimit')}
                />
              </div>
              <p className="text-xs text-muted">{t('dealers.discountHint')}</p>
            </Section>

            {/* Steuer & Buchhaltung */}
            <Section title={t('dealers.section.tax')}>
              <div className="flex gap-3">
                <Field
                  label={t('dealers.field.uid')}
                  value={form.uid}
                  onChange={(v) => set('uid', v)}
                  placeholder={t('dealers.ph.uid')}
                />
                <Field
                  label={t('dealers.field.contraAccount')}
                  inputMode="numeric"
                  value={form.gegenkonto}
                  onChange={(v) => set('gegenkonto', v)}
                />
              </div>
            </Section>

            {/* Zahlungskonditionen */}
            <Section title={t('dealers.section.terms')}>
              <div className="flex gap-3">
                <Field
                  label={t('dealers.field.cashDiscountPct')}
                  inputMode="decimal"
                  value={form.skonto_prozent}
                  onChange={(v) => set('skonto_prozent', v)}
                  placeholder={t('dealers.ph.cashDiscountPct')}
                />
                <Field
                  label={t('dealers.field.cashDiscountDays')}
                  inputMode="numeric"
                  value={form.skonto_tage}
                  onChange={(v) => set('skonto_tage', v)}
                  placeholder={t('dealers.ph.cashDiscountDays')}
                />
                <Field
                  label={t('dealers.field.paymentTermDays')}
                  inputMode="numeric"
                  value={form.zahlungsziel_tage}
                  onChange={(v) => set('zahlungsziel_tage', v)}
                  placeholder={t('dealers.ph.paymentTermDays')}
                />
              </div>
              <p className="text-xs text-muted">{readableTerms(form, t)}</p>
              {dealer?.payment_terms_raw && (
                <p className="text-xs text-muted">
                  {t('dealers.field.imported')}{' '}
                  <span className="text-ink">{dealer.payment_terms_raw}</span>
                </p>
              )}
            </Section>

            {/* E-Mail-Verteiler (Rollen) */}
            <Section
              title={t('dealers.section.emails')}
              collapsible
              defaultOpen={!!dealer}
            >
              {emails.length === 0 ? (
                <p className="text-xs text-muted">{t('dealers.emails.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {emails.map((row, idx) => (
                    <li
                      key={row.id ?? `new-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-ink">
                        {row.email}
                        <span className="ml-2 text-xs text-muted">
                          {t(emailRoleKey(row.role))}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEmailRow(idx)}
                        aria-label={t('common.remove')}
                        className="shrink-0 text-muted transition-colors hover:text-red-700"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
                  <span className="text-xs text-muted">{t('common.email')}</span>
                  <input
                    type="email"
                    inputMode="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addEmailRow()
                      }
                    }}
                    placeholder={t('dealers.emails.emailPlaceholder')}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t('dealers.emails.role')}</span>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as DealerEmailRole)}
                    className={inputClass}
                  >
                    {DEALER_EMAIL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(emailRoleKey(r))}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={addEmailRow}
                  disabled={!addEmail.includes('@')}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
                >
                  {t('dealers.emails.add')}
                </button>
              </div>
              <p className="text-xs text-muted">{t('dealers.emails.hint')}</p>
            </Section>

            {/* Priorität je Saison */}
            <Section
              title={t('dealers.section.priority')}
              collapsible
              defaultOpen={!!dealer}
            >
              {sortedSeasons.length === 0 ? (
                <p className="text-xs text-muted">{t('dealers.priority.noSeasons')}</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {sortedSeasons.map((s) => (
                      <div key={s.id} className="flex items-center gap-3">
                        <span className="flex-1 text-sm text-ink">
                          {s.label}
                          {s.is_active && (
                            <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-[11px] text-muted">
                              {t('dealers.priority.current')}
                            </span>
                          )}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={priorities[s.id] ?? ''}
                          onChange={(e) =>
                            setPriorities((prev) => ({
                              ...prev,
                              [s.id]: e.target.value,
                            }))
                          }
                          placeholder={t('dealers.priority.placeholder')}
                          className={`${inputClass} w-24 text-right`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted">{t('dealers.priority.hint')}</p>
                </>
              )}
            </Section>

            {/* Dokumente (nur Bearbeiten — Upload braucht eine dealer_id) */}
            {dealer && (
              <Section
                title={t('dealerDoc.section')}
                collapsible
                defaultOpen
              >
                <p className="text-xs text-muted">{t('dealerDoc.hint')}</p>

                {docError && (
                  <p className="text-sm text-red-700">{docError}</p>
                )}

                {/* Upload: Kategorie wählen, Datei hochladen (sofort) */}
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">
                      {t('dealerDoc.categoryLabel')}
                    </span>
                    <select
                      value={docCategory}
                      onChange={(e) =>
                        setDocCategory(
                          e.target.value as DealerDocumentCategory,
                        )
                      }
                      className={`${inputClass} w-44`}
                    >
                      {DEALER_DOCUMENT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {t(docCategoryKey(c))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">
                      {t('dealerDoc.choose')}
                    </span>
                    <input
                      type="file"
                      disabled={docBusy}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleUploadDoc(f)
                        e.target.value = ''
                      }}
                      className="text-sm text-ink file:mr-3 file:rounded-md file:border-[0.5px] file:border-line file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-cream disabled:opacity-50"
                    />
                  </label>
                  {docBusy && (
                    <span className="text-sm text-muted">
                      {t('dealerDoc.uploading')}
                    </span>
                  )}
                </div>

                {/* Liste vorhandener Dokumente */}
                {documents.length === 0 ? (
                  <p className="text-xs text-muted">{t('dealerDoc.empty')}</p>
                ) : (
                  <ul className="divide-y divide-line rounded-md border-[0.5px] border-line">
                    {documents.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {doc.file_name}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                            <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-ink">
                              {t(docCategoryKey(doc.category))}
                            </span>
                            <span>
                              {t('dealerDoc.uploadedBy', {
                                date: docDate(doc.created_at),
                              })}
                              {formatBytes(doc.file_size)
                                ? ` · ${formatBytes(doc.file_size)}`
                                : ''}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleDownloadDoc(doc)}
                            className="text-muted transition-colors hover:text-ink"
                          >
                            {t('dealerDoc.download')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDoc(doc)}
                            className="text-muted transition-colors hover:text-red-700"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {/* Adressen (ausklappbar; beim Bearbeiten offen) */}
            <Section
              title={t('dealers.section.shipping')}
              collapsible
              defaultOpen={!!dealer}
            >
              <AddressBlock prefix="shipping" form={form} set={set} t={t} withEmail2 />
            </Section>

            <Section
              title={t('dealers.section.billing')}
              collapsible
              defaultOpen={!!dealer}
            >
              <AddressBlock prefix="billing" form={form} set={set} t={t} withName />
            </Section>

            <Section
              title={t('dealers.section.store')}
              collapsible
              defaultOpen={!!dealer}
            >
              <AddressBlock prefix="store" form={form} set={set} t={t} withName />
            </Section>

            {formError && (
              <p className="text-sm text-red-700">{formError}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 pt-4 pb-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
