import {
  ORDER_TYPES,
  SHIPPING_METHODS,
  ORDER_TERMS,
  ORDER_TYPE_LABEL_KEYS,
  SHIPPING_METHOD_LABEL_KEYS,
  ORDER_TERM_LABEL_KEYS,
  orderHeadDateRangeOk,
  type OrderHeadForm,
} from '../types/order'
import { validateOrderPaymentTerms } from '../lib/paymentTerms'
import { validateShipping, SHIPPING_SONSTIGE } from '../lib/shipping'
import type { TranslationKey } from '../i18n/dict'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/**
 * Präsentations-Komponente für die Order-Kopfdaten (Order-Art, Versandart,
 * Versand-/Lieferkondition, Lieferzeitraum, PO#). Gemeinsam von der Anlage
 * (Orders.tsx) und der Bearbeitung (OrderEdit.tsx) genutzt.
 */
export default function OrderHeadFields({
  value,
  onChange,
}: {
  value: OrderHeadForm
  onChange: (patch: Partial<OrderHeadForm>) => void
}) {
  const t = useT()
  const rangeOk = orderHeadDateRangeOk(value)
  // Inline-Rückmeldung für die Zahlungsbedingungen (block-statt-raten): dieselbe
  // Prüfung, die der Speichern-Handler vor dem Schreiben erzwingt.
  const paymentTerms = validateOrderPaymentTerms(value)
  // Versandart: „Sonstige" braucht einen Freitext (gleiche Prüfung wie beim Save).
  const shipping = validateShipping({
    method: value.shipping_method,
    freitext: value.shipping_method_freitext,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t('order.field.type')}</span>
          <select
            value={value.order_type}
            onChange={(e) => onChange({ order_type: e.target.value })}
            className={inputClass}
          >
            <option value="">—</option>
            {ORDER_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(ORDER_TYPE_LABEL_KEYS[v])}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t('order.field.shipMethod')}</span>
          <select
            value={value.shipping_method}
            onChange={(e) => onChange({ shipping_method: e.target.value })}
            className={inputClass}
          >
            <option value="">—</option>
            {SHIPPING_METHODS.map((v) => (
              <option key={v} value={v}>
                {t(SHIPPING_METHOD_LABEL_KEYS[v])}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Freitext-Versandart — nur bei „Sonstige" sichtbar/relevant. */}
      {value.shipping_method === SHIPPING_SONSTIGE && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">
            {t('order.field.shipMethodFreitext')}
          </span>
          <input
            type="text"
            value={value.shipping_method_freitext}
            onChange={(e) => onChange({ shipping_method_freitext: e.target.value })}
            placeholder={t('order.field.shipMethodFreitextPlaceholder')}
            className={inputClass}
          />
          {!shipping.ok && (
            <span className="text-sm text-red-700">
              {t(shipping.error as TranslationKey)}
            </span>
          )}
        </label>
      )}

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t('order.field.shipTerms')}</span>
          <select
            value={value.shipping_terms}
            onChange={(e) => onChange({ shipping_terms: e.target.value })}
            className={inputClass}
          >
            <option value="">—</option>
            {ORDER_TERMS.map((v) => (
              <option key={v} value={v}>
                {t(ORDER_TERM_LABEL_KEYS[v])}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t('order.field.deliveryTerms')}</span>
          <select
            value={value.delivery_terms}
            onChange={(e) => onChange({ delivery_terms: e.target.value })}
            className={inputClass}
          >
            <option value="">—</option>
            {ORDER_TERMS.map((v) => (
              <option key={v} value={v}>
                {t(ORDER_TERM_LABEL_KEYS[v])}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t('order.field.deliveryFrom')}</span>
          <input
            type="date"
            value={value.delivery_date_from}
            onChange={(e) => onChange({ delivery_date_from: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t('order.field.deliveryTo')}</span>
          <input
            type="date"
            value={value.delivery_date_to}
            onChange={(e) => onChange({ delivery_date_to: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>
      {!rangeOk && (
        <p className="text-sm text-red-700">{t('order.field.dateRangeInvalid')}</p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t('order.field.poNumber')}</span>
        <input
          type="text"
          value={value.po_number}
          onChange={(e) => onChange({ po_number: e.target.value })}
          placeholder={t('order.field.poNumberPlaceholder')}
          className={inputClass}
        />
      </label>

      {/* Zahlungsbedingungen — je Order/AB bestimmbar (nicht fix am Kunden). */}
      <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-line p-3">
        <span className="text-sm font-medium text-ink">
          {t('order.payment.heading')}
        </span>
        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm text-muted">{t('order.field.zahlungsziel')}</span>
            <input
              type="text"
              inputMode="numeric"
              value={value.zahlungsziel_tage}
              onChange={(e) => onChange({ zahlungsziel_tage: e.target.value })}
              placeholder="30"
              className={inputClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm text-muted">{t('order.field.skontoProzent')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={value.skonto_prozent}
              onChange={(e) => onChange({ skonto_prozent: e.target.value })}
              placeholder="—"
              className={inputClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm text-muted">{t('order.field.skontoTage')}</span>
            <input
              type="text"
              inputMode="numeric"
              value={value.skonto_tage}
              onChange={(e) => onChange({ skonto_tage: e.target.value })}
              placeholder="—"
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">
            {t('order.field.zahlungsbedingungFreitext')}
          </span>
          <input
            type="text"
            value={value.zahlungsbedingung_freitext}
            onChange={(e) => onChange({ zahlungsbedingung_freitext: e.target.value })}
            placeholder={t('order.field.zahlungsbedingungFreitextPlaceholder')}
            className={inputClass}
          />
        </label>
        {!paymentTerms.ok && (
          <p className="text-sm text-red-700">
            {t(paymentTerms.error as TranslationKey)}
          </p>
        )}
      </div>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={value.priority}
          onChange={(e) => onChange({ priority: e.target.checked })}
          className="mt-0.5"
        />
        <span className="flex flex-col">
          <span className="text-sm text-ink">{t('order.field.priority')}</span>
          <span className="text-xs text-muted">
            {t('order.field.priorityHint')}
          </span>
        </span>
      </label>
    </div>
  )
}
