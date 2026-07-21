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
