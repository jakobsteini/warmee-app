import { useEffect, useMemo, useRef, useState } from 'react'
import { listDealers } from '../lib/dealers'
import {
  deleteNewsletter,
  getNewsletterDetail,
  listDealerNewsletterImages,
  listNewsletters,
  markNewsletterDownloaded,
  saveNewsletter,
} from '../lib/newsletters'
import { buildNewsletterHtml } from '../lib/newsletterHtml'
import type { Dealer } from '../types/dealer'
import type {
  DealerImage,
  NewsletterDetail,
  NewsletterListItem,
  NewsletterStatus,
} from '../types/newsletter'

const STATUS_LABELS: Record<NewsletterStatus, string> = {
  draft: 'Entwurf',
  ready: 'Bereit',
  downloaded: 'Heruntergeladen',
}

/** Datum kurz und deutsch formatieren. */
function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
}

/** Titel in einen dateisystemfreundlichen Slug wandeln. */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'newsletter'
}

/** HTML-String als Datei-Download im Browser auslösen. */
function downloadHtmlFile(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type View =
  | { mode: 'list' }
  | { mode: 'editor'; initial: NewsletterDetail | null }

export default function Newsletter() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return view.mode === 'list' ? (
    <NewsletterList
      onNew={() => setView({ mode: 'editor', initial: null })}
      onOpen={(detail) => setView({ mode: 'editor', initial: detail })}
    />
  ) : (
    <NewsletterEditor
      // Frischer Editor-Zustand je geöffnetem Newsletter bzw. Neuanlage.
      key={view.initial?.id ?? 'new'}
      initial={view.initial}
      onDone={() => setView({ mode: 'list' })}
    />
  )
}

/** Verlauf: gespeicherte Newsletter listen, öffnen, löschen, neu anlegen. */
function NewsletterList({
  onNew,
  onOpen,
}: {
  onNew: () => void
  onOpen: (detail: NewsletterDetail) => void
}) {
  const [items, setItems] = useState<NewsletterListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setItems(await listNewsletters())
    } catch {
      setError('Newsletter konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleOpen(id: string) {
    setOpeningId(id)
    setError(null)
    try {
      onOpen(await getNewsletterDetail(id))
    } catch {
      setError('Newsletter konnte nicht geöffnet werden.')
      setOpeningId(null)
    }
  }

  async function handleDelete(item: NewsletterListItem) {
    if (!window.confirm(`Newsletter „${item.title}" wirklich löschen?`)) return
    try {
      await deleteNewsletter(item.id)
      await load()
    } catch {
      setError('Löschen fehlgeschlagen.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">Newsletter</h1>
          <p className="mt-1 text-sm text-muted">
            Gespeicherte Newsletter – öffnen, bearbeiten, erneut herunterladen.
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
        >
          Neuer Newsletter
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : items.length === 0 ? (
        <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted">
            Noch keine Newsletter gespeichert. Lege mit „Neuer Newsletter" den
            ersten an.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Titel</th>
                <th className="px-4 py-3 font-medium">Händler</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aktualisiert</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t-[0.5px] border-line bg-white text-ink"
                >
                  <td className="px-4 py-3 font-medium">{item.title}</td>
                  <td className="px-4 py-3 text-muted">
                    {item.dealer_name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-card px-2.5 py-1 text-xs text-ink">
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(item.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleOpen(item.id)}
                      disabled={openingId === item.id}
                      className="text-muted transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {openingId === item.id ? 'Öffnet…' : 'Öffnen'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
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
    </div>
  )
}

/** Generator/Editor eines Newsletters (Neuanlage oder gespeicherten öffnen). */
function NewsletterEditor({
  initial,
  onDone,
}: {
  initial: NewsletterDetail | null
  onDone: () => void
}) {
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [dealerId, setDealerId] = useState(initial?.dealer_id ?? '')

  const [images, setImages] = useState<DealerImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)

  const [heroId, setHeroId] = useState<string | null>(
    initial?.hero_asset_id ?? null,
  )
  const [productIds, setProductIds] = useState<string[]>(
    initial?.product_asset_ids ?? [],
  )

  const [title, setTitle] = useState(initial?.title ?? '')
  const [subjectLine, setSubjectLine] = useState(initial?.subject_line ?? '')
  const [preheader, setPreheader] = useState(initial?.preheader ?? '')

  const [newsletterId, setNewsletterId] = useState<string | null>(
    initial?.id ?? null,
  )
  const [status, setStatus] = useState<NewsletterStatus | null>(
    initial?.status ?? null,
  )
  const [dirty, setDirty] = useState(false)

  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Beim ersten Lauf die gespeicherte Auswahl auf die geladenen Bilder
  // anwenden; danach bedeutet ein Händlerwechsel eine bewusste Änderung.
  const firstRunRef = useRef(true)
  const pendingSelectionRef = useRef<{
    heroId: string | null
    productIds: string[]
  } | null>(
    initial
      ? {
          heroId: initial.hero_asset_id,
          productIds: initial.product_asset_ids,
        }
      : null,
  )

  useEffect(() => {
    ;(async () => {
      try {
        setDealers(await listDealers())
      } catch {
        setError('Händler konnten nicht geladen werden.')
      }
    })()
  }, [])

  // Bilder des gewählten Händlers laden. Beim Händlerwechsel wird die
  // Bildauswahl zurückgesetzt (andere Bilder); newsletterId/Status bleiben,
  // damit ein geöffneter Newsletter beim erneuten Speichern aktualisiert wird.
  useEffect(() => {
    const isFirstRun = firstRunRef.current
    firstRunRef.current = false

    setImages([])
    if (!isFirstRun) {
      // Bewusster Händlerwechsel im Editor → Auswahl verwerfen, als geändert
      // markieren. Beim ersten Lauf stammt die Auswahl aus dem Datensatz.
      setHeroId(null)
      setProductIds([])
      setDirty(true)
    }
    if (!dealerId) return

    let cancelled = false
    setImagesLoading(true)
    setError(null)
    ;(async () => {
      try {
        const imgs = await listDealerNewsletterImages(dealerId)
        if (cancelled) return
        setImages(imgs)

        // Gespeicherte Auswahl wiederherstellen, aber nur Bilder, die es
        // weiterhin gibt (z. B. Zuschnitt inzwischen gelöscht).
        const pending = pendingSelectionRef.current
        if (pending) {
          pendingSelectionRef.current = null
          const available = new Set(imgs.map((i) => i.asset_id))
          setHeroId(
            pending.heroId && available.has(pending.heroId)
              ? pending.heroId
              : null,
          )
          setProductIds(pending.productIds.filter((id) => available.has(id)))
        }
      } catch {
        if (!cancelled)
          setError('Bilder des Händlers konnten nicht geladen werden.')
      } finally {
        if (!cancelled) setImagesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealerId])

  const heroImage = useMemo(
    () => images.find((i) => i.asset_id === heroId) ?? null,
    [images, heroId],
  )
  const productImages = useMemo(
    () =>
      productIds
        .map((id) => images.find((i) => i.asset_id === id))
        .filter((i): i is DealerImage => Boolean(i)),
    [images, productIds],
  )

  const complete =
    !!dealerId &&
    !!heroImage &&
    productImages.length === 2 &&
    title.trim().length > 0

  const previewHtml = useMemo(
    () =>
      buildNewsletterHtml({
        title,
        subjectLine: subjectLine.trim() || null,
        preheader: preheader.trim() || null,
        heroUrl: heroImage?.cropUrl ?? '',
        productUrls: [
          productImages[0]?.cropUrl ?? '',
          productImages[1]?.cropUrl ?? '',
        ],
      }),
    [title, subjectLine, preheader, heroImage, productImages],
  )

  function markDirty() {
    setDirty(true)
  }

  function toggleHero(assetId: string) {
    setHeroId((prev) => (prev === assetId ? null : assetId))
    // Ein Bild kann nicht zugleich Hero und Produkt sein.
    setProductIds((prev) => prev.filter((id) => id !== assetId))
    markDirty()
  }

  function toggleProduct(assetId: string) {
    setHeroId((prev) => (prev === assetId ? null : prev))
    setProductIds((prev) => {
      if (prev.includes(assetId)) return prev.filter((id) => id !== assetId)
      if (prev.length >= 2) return prev // maximal zwei Produktbilder
      return [...prev, assetId]
    })
    markDirty()
  }

  /** Persistiert den aktuellen Stand und gibt die Newsletter-ID zurück. */
  async function persist(nextStatus: NewsletterStatus): Promise<string> {
    const id = await saveNewsletter({
      id: newsletterId,
      title: title.trim(),
      subject_line: subjectLine.trim() || null,
      preheader: preheader.trim() || null,
      dealer_id: dealerId,
      season_id: heroImage?.season_id ?? null,
      hero_asset_id: heroImage!.asset_id,
      products: productImages.map((img) => ({
        asset_id: img.asset_id,
        product_id: img.product_id,
      })),
      status: nextStatus,
    })
    setNewsletterId(id)
    setDirty(false)
    return id
  }

  async function handleSave() {
    if (!complete) return
    setSaving(true)
    setError(null)
    try {
      await persist('ready')
      setStatus('ready')
    } catch {
      setError('Newsletter konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDownload() {
    if (!complete) return
    setDownloading(true)
    setError(null)
    try {
      // Vor dem Download sicher persistieren, dann als "downloaded" markieren.
      const id = await persist('ready')
      const html = buildNewsletterHtml({
        title,
        subjectLine: subjectLine.trim() || null,
        preheader: preheader.trim() || null,
        heroUrl: heroImage!.cropUrl,
        productUrls: [productImages[0].cropUrl, productImages[1].cropUrl],
      })
      const dealer = dealers.find((d) => d.id === dealerId)
      const filename = `newsletter-${slugify(dealer?.name ?? '')}-${slugify(title)}.html`
      downloadHtmlFile(html, filename)
      await markNewsletterDownloaded(id)
      setStatus('downloaded')
    } catch {
      setError('HTML konnte nicht erzeugt werden.')
    } finally {
      setDownloading(false)
    }
  }

  const selectClass =
    'w-full rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'
  const inputClass = selectClass

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border-[0.5px] border-line px-3 py-1.5 text-sm text-ink transition-colors hover:bg-card"
        >
          ← Verlauf
        </button>
        <span className="text-sm text-muted">
          {initial ? 'Newsletter bearbeiten' : 'Neuer Newsletter'}
        </span>
      </div>

      <div className="mb-8">
        <p className="text-sm text-muted">
          Händler wählen, drei Bilder setzen, Text erfassen – rechts die
          Live-Vorschau. Danach als standalone HTML herunterladen.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_600px]">
        {/* Steuerung */}
        <div className="flex flex-col gap-8">
          {/* 1. Händler */}
          <section>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Händler</span>
              <select
                value={dealerId}
                onChange={(e) => setDealerId(e.target.value)}
                className={selectClass}
              >
                <option value="">Händler wählen…</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.city ? ` · ${d.city}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* 2./3. Bildauswahl */}
          {dealerId && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink">
                  Bilder dieses Händlers
                </span>
                <span className="text-xs text-muted">
                  1 Hero · {productIds.length}/2 Produkte
                </span>
              </div>

              {imagesLoading ? (
                <p className="text-sm text-muted">Lädt…</p>
              ) : images.length === 0 ? (
                <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-10 text-center text-sm text-muted">
                  Keine Bilder mit Newsletter-Zuschnitt für diesen Händler.
                  Ordne im Bildarchiv Bilder zu und erzeuge im Zuschnitt-Editor
                  einen Newsletter-Zuschnitt.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {images.map((img) => {
                    const isHero = heroId === img.asset_id
                    const productIndex = productIds.indexOf(img.asset_id)
                    const isProduct = productIndex >= 0
                    return (
                      <div
                        key={img.asset_id}
                        className={[
                          'overflow-hidden rounded-md border-[0.5px] bg-card',
                          isHero || isProduct ? 'border-ink' : 'border-line',
                        ].join(' ')}
                      >
                        <div className="relative aspect-[4/5]">
                          <img
                            src={img.cropUrl}
                            alt={img.filename}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          {isHero && (
                            <span className="absolute left-1.5 top-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-cream">
                              Hero
                            </span>
                          )}
                          {isProduct && (
                            <span className="absolute left-1.5 top-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-cream">
                              Produkt {productIndex + 1}
                            </span>
                          )}
                        </div>
                        <div className="flex">
                          <button
                            type="button"
                            onClick={() => toggleHero(img.asset_id)}
                            className={[
                              'flex-1 border-t-[0.5px] border-line px-2 py-1.5 text-xs transition-colors',
                              isHero
                                ? 'bg-ink text-cream'
                                : 'text-ink hover:bg-line/30',
                            ].join(' ')}
                          >
                            Hero
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleProduct(img.asset_id)}
                            disabled={!isProduct && productIds.length >= 2}
                            className={[
                              'flex-1 border-l-[0.5px] border-t-[0.5px] border-line px-2 py-1.5 text-xs transition-colors',
                              isProduct
                                ? 'bg-ink text-cream'
                                : 'text-ink hover:bg-line/30 disabled:cursor-not-allowed disabled:text-muted/50 disabled:hover:bg-transparent',
                            ].join(' ')}
                          >
                            Produkt
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* 4. Text */}
          {dealerId && (
            <section className="flex flex-col gap-4">
              <span className="text-sm font-medium text-ink">Text</span>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Titel *</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    markDirty()
                  }}
                  placeholder="z. B. Neue Cashmere-Kollektion"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Betreff</span>
                <input
                  type="text"
                  value={subjectLine}
                  onChange={(e) => {
                    setSubjectLine(e.target.value)
                    markDirty()
                  }}
                  placeholder="Betreffzeile der E-Mail"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Preheader</span>
                <input
                  type="text"
                  value={preheader}
                  onChange={(e) => {
                    setPreheader(e.target.value)
                    markDirty()
                  }}
                  placeholder="Vorschautext (im Postfach neben dem Betreff)"
                  className={inputClass}
                />
              </label>
            </section>
          )}

          {/* 6./7. Aktionen */}
          {dealerId && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!complete || saving}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!complete || downloading}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {downloading ? 'Erzeugt…' : 'HTML herunterladen'}
                </button>
                {status && (
                  <span className="text-xs text-muted">
                    Status: {STATUS_LABELS[status]}
                    {dirty && ' · ungespeicherte Änderungen'}
                  </span>
                )}
              </div>
              {!complete && (
                <p className="text-xs text-muted">
                  Zum Speichern: Hero-Bild, zwei Produktbilder und ein Titel
                  auswählen.
                </p>
              )}
            </section>
          )}
        </div>

        {/* Live-Vorschau */}
        <div className="xl:sticky xl:top-8 xl:self-start">
          <p className="mb-2 text-sm font-medium text-ink">Vorschau</p>
          <div className="overflow-hidden rounded-lg border-[0.5px] border-line bg-white">
            <iframe
              title="Newsletter-Vorschau"
              srcDoc={previewHtml}
              className="h-[720px] w-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
