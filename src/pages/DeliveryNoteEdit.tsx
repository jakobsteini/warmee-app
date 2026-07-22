import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getDeliveryNote,
  getBelegArchiv,
  getInvoiceCreationDefaults,
  createInvoiceFromDeliveryNote,
  deleteDeliveryNoteItem,
  updateDeliveryNoteItemQuantity,
  updateDeliveryNoteNotes,
  signedArchiveUrl,
  signedPdfUrl,
  type InvoiceCreateOptions,
} from '../lib/invoices'
import {
  isDeliveryNoteLocked,
  type BelegArchivEntry,
  type DeliveryNoteWithItems,
} from '../types/invoice'
import { deliveryNoteTotalQuantity } from '../lib/deliveryNoteCalc'
import InvoiceCreateDialog from '../components/InvoiceCreateDialog'
import type { FrozenInvoiceTerms } from '../lib/paymentTerms'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Lieferschein-Status → Übersetzungs-Key. */
function deliveryNoteStatusKey(status: string): TranslationKey {
  return `deliveryNote.status.${status}` as TranslationKey
}

/** Datum (ISO) als deutsches Kurzdatum, oder „—". */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function DeliveryNoteEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const [note, setNote] = useState<DeliveryNoteWithItems | null>(null)
  const [notes, setNotes] = useState('')
  const [archive, setArchive] = useState<BelegArchivEntry | null>(null)
  const [invoiceDefaults, setInvoiceDefaults] =
    useState<FrozenInvoiceTerms | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [n, arch] = await Promise.all([
        getDeliveryNote(id),
        getBelegArchiv('delivery_note', id).catch(() => null),
      ])
      setNote(n)
      setNotes(n.notes ?? '')
      setArchive(arch)
      setError(null)
    } catch {
      setError(t('deliveryNoteEdit.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function openPdf() {
    if (!note?.pdf_path) return
    try {
      window.open(await signedPdfUrl(note.pdf_path), '_blank', 'noopener')
    } catch {
      setError(t('common.pdfOpenError'))
    }
  }

  async function openArchive() {
    if (!archive) return
    try {
      window.open(await signedArchiveUrl(archive.storage_path), '_blank', 'noopener')
    } catch {
      setError(t('common.pdfOpenError'))
    }
  }

  async function handleDeleteItem(itemId: string, name: string) {
    if (!window.confirm(t('deliveryNoteEdit.deleteItemConfirm', { name }))) return
    try {
      await deleteDeliveryNoteItem(itemId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deliveryNoteEdit.editError'))
    }
  }

  async function saveQuantity(itemId: string, value: string) {
    try {
      await updateDeliveryNoteItemQuantity(itemId, Number(value) || 0)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deliveryNoteEdit.editError'))
      await load()
    }
  }

  // Retour-Variante 1: Rechnung aus dem (ggf. bereinigten) Lieferschein. Öffnet
  // den Konditionen-/Frachtdialog; bei Bestätigung wird die Rechnung aus den
  // LS-Positionen erzeugt und angezeigt.
  async function handleOpenInvoiceFromNote() {
    if (!note?.delivery_id) return
    try {
      const defaults = await getInvoiceCreationDefaults(note.delivery_id)
      setInvoiceDefaults(defaults)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invoiceCreate.loadError'))
    }
  }

  async function handleConfirmInvoiceFromNote(options: InvoiceCreateOptions) {
    if (!note) return
    const invoice = await createInvoiceFromDeliveryNote(note.id, options)
    navigate(`/invoices/${invoice.id}`)
  }

  async function handleNotesBlur() {
    if (!note || notes === (note.notes ?? '')) return
    try {
      await updateDeliveryNoteNotes(note.id, notes.trim() || null)
      setNote({ ...note, notes: notes.trim() || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deliveryNoteEdit.editError'))
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'
  const cellInput =
    'w-24 rounded-md border-[0.5px] border-line bg-surface px-2 py-1.5 text-right text-sm text-ink outline-none focus:border-ink'

  if (loading) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (!note)
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/deliveries" className="text-sm text-muted hover:text-ink">
          {t('deliveryNoteEdit.backList')}
        </Link>
        <p className="mt-6 text-sm text-red-700">
          {error ?? t('deliveryNoteEdit.notFound')}
        </p>
      </div>
    )

  const locked = isDeliveryNoteLocked(note.status)
  const total = deliveryNoteTotalQuantity(note.delivery_note_items)

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to={`/deliveries/${note.delivery_id}`}
        className="text-sm text-muted hover:text-ink"
      >
        {t('deliveryNoteEdit.back')}
      </Link>

      <div className="mt-4 mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('deliveryNoteEdit.title', { number: note.note_number })}
            {note.delivery_type === 'kommission' && (
              <span className="ml-2 align-middle rounded-full bg-card px-2 py-0.5 text-xs text-muted">
                {t('deliveryNote.kommission')}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(note.note_date)} · {t(deliveryNoteStatusKey(note.status))}
            {note.delivery_type === 'kommission' && !locked
              ? ` · ${t('deliveryNoteEdit.kommissionOpen')}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!locked && (
            <button
              type="button"
              onClick={handleOpenInvoiceFromNote}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
            >
              {t('deliveryNoteEdit.invoiceFromNote')}
            </button>
          )}
          {archive && (
            <button
              type="button"
              onClick={openArchive}
              title={t('common.archiveHint')}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-muted transition-colors hover:bg-card hover:text-ink"
            >
              {t('common.archivePdf')}
            </button>
          )}
          <button
            type="button"
            onClick={openPdf}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
          >
            {t('common.openPdf')}
          </button>
        </div>
      </div>

      {locked && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-muted">
          {note.status === 'cancelled'
            ? t('deliveryNoteEdit.lockedCancelled')
            : t('deliveryNoteEdit.lockedSent')}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <h2 className="mb-3 text-lg font-medium text-ink">
        {t('deliveryNoteEdit.positions')}
      </h2>
      <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{t('common.product')}</th>
              <th className="px-4 py-3 font-medium">{t('common.color')}</th>
              <th className="px-4 py-3 font-medium">{t('common.size')}</th>
              <th className="px-4 py-3 text-right font-medium">
                {t('deliveryNoteEdit.colQty')}
              </th>
              {!locked && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {note.delivery_note_items.length === 0 ? (
              <tr className="border-t-[0.5px] border-line bg-surface">
                <td colSpan={locked ? 4 : 5} className="px-4 py-6 text-center text-muted">
                  {t('common.noPositions')}
                </td>
              </tr>
            ) : (
              note.delivery_note_items.map((i) => (
                <tr
                  key={i.id}
                  className="border-t-[0.5px] border-line bg-surface text-ink"
                >
                  <td className="px-4 py-2.5 font-medium">{i.description}</td>
                  <td className="px-4 py-2.5">{i.color ?? '—'}</td>
                  <td className="px-4 py-2.5">{i.size ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {locked ? (
                      i.quantity.toLocaleString('de-DE')
                    ) : (
                      <input
                        type="number"
                        min={0}
                        defaultValue={i.quantity}
                        onBlur={(e) => saveQuantity(i.id, e.target.value)}
                        className={cellInput}
                      />
                    )}
                  </td>
                  {!locked && (
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(i.id, i.description)}
                        className="text-muted transition-colors hover:text-ink"
                      >
                        {t('deliveryNoteEdit.deleteItem')}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-line bg-surface font-medium text-ink">
              <td className="px-4 py-2.5" colSpan={3}>
                {t('deliveryNoteEdit.total')}
              </td>
              <td className="px-4 py-2.5 text-right">
                {total.toLocaleString('de-DE')}
              </td>
              {!locked && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      <label className="mt-6 flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t('common.notes')}</span>
        {locked ? (
          <p className="text-sm text-ink">{note.notes ?? '—'}</p>
        ) : (
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder={t('deliveryNoteEdit.notesPlaceholder')}
            className={inputClass}
          />
        )}
      </label>

      {invoiceDefaults && (
        <InvoiceCreateDialog
          defaults={invoiceDefaults}
          onConfirm={handleConfirmInvoiceFromNote}
          onClose={() => setInvoiceDefaults(null)}
        />
      )}
    </div>
  )
}
