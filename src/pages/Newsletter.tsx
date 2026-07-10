import { useEffect, useMemo, useState } from 'react'
import { listDealers } from '../lib/dealers'
import {
  listDealerNewsletterImages,
  markNewsletterDownloaded,
  saveNewsletter,
} from '../lib/newsletters'
import { buildNewsletterHtml } from '../lib/newsletterHtml'
import type { Dealer } from '../types/dealer'
import type {
  DealerImage,
  NewsletterStatus,
} from '../types/newsletter'

const STATUS_LABELS: Record<NewsletterStatus, string> = {
  draft: 'Entwurf',
  ready: 'Bereit',
  downloaded: 'Heruntergeladen',
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

export default function Newsletter() {
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [dealerId, setDealerId] = useState('')

  const [images, setImages] = useState<DealerImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)

  const [heroId, setHeroId] = useState<string | null>(null)
  const [productIds, setProductIds] = useState<string[]>([])

  const [title, setTitle] = useState('')
  const [subjectLine, setSubjectLine] = useState('')
  const [preheader, setPreheader] = useState('')

  const [newsletterId, setNewsletterId] = useState<string | null>(null)
  const [status, setStatus] = useState<NewsletterStatus | null>(null)
  const [dirty, setDirty] = useState(false)

  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setDealers(await listDealers())
      } catch {
        setError('Händler konnten nicht geladen werden.')
      }
    })()
  }, [])

  // Händlerwechsel: neuer Newsletter-Entwurf, nur die Bildauswahl wird
  // zurückgesetzt (Textfelder bleiben für schnelles Weiterarbeiten erhalten).
  useEffect(() => {
    setImages([])
    setHeroId(null)
    setProductIds([])
    setNewsletterId(null)
    setStatus(null)
    setDirty(false)
    if (!dealerId) return

    let cancelled = false
    setImagesLoading(true)
    setError(null)
    ;(async () => {
      try {
        const imgs = await listDealerNewsletterImages(dealerId)
        if (!cancelled) setImages(imgs)
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
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink">Newsletter</h1>
        <p className="mt-1 text-sm text-muted">
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
                          isHero || isProduct
                            ? 'border-ink'
                            : 'border-line',
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
