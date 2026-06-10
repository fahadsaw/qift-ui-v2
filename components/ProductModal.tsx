'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  createProduct,
  updateProduct,
  type ApiProduct,
} from '@/lib/storesApi'
import ProductMediaPicker from './ProductMediaPicker'

// Shared "add or edit a product" modal. Used by both /store-dashboard
// (the orders dashboard) and /store-dashboard/products (the catalog
// management page) so the form fields stay in lockstep.
//
// Mode is implicit:
//   - `product` undefined  → "create" mode, calls POST /products
//   - `product` provided   → "edit" mode, calls PATCH /products/:id
//
// We show the same field set in both modes; for edit we prefill from the
// passed `product`. The `onSaved` callback receives the resulting row so
// the parent can refresh its list optimistically.
export type ProductModalProps = {
  storeId: string
  product?: ApiProduct
  onClose: () => void
  onSaved: (product: ApiProduct) => void
}

const CATEGORIES = [
  'flowers',
  'chocolate',
  'cake',
  'perishable',
  'perfume',
  'gifts',
] as const

export default function ProductModal({
  storeId,
  product,
  onClose,
  onSaved,
}: ProductModalProps) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const isEdit = !!product

  // Prefill from `product` when editing; otherwise sensible defaults.
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(
    product?.price != null ? String(product.price) : '',
  )
  const [category, setCategory] = useState<string>(
    product?.category ?? 'flowers',
  )
  // Phase 2.5b — ordered image gallery. Hydrated from the
  // ProductImage relation when editing; falls back to the legacy
  // `imageUrl` single-string when the parent passed a product
  // created before Phase 2.5a (or one whose gallery is empty but
  // whose legacy primary is set). Create-mode starts with an empty
  // gallery; the picker exposes the affordances to add to it.
  //
  // `product?.images` is the wire-shape array of `{url, displayOrder}`
  // surfaced by PUBLIC_PRODUCT_SELECT (the API sorts by displayOrder
  // server-side, so the array is already in render order — we just
  // map URLs out).
  const [imageUrls, setImageUrls] = useState<string[]>(() => {
    const fromGallery =
      product?.images?.map((img) => img.url).filter(Boolean) ?? []
    if (fromGallery.length > 0) return fromGallery
    if (product?.imageUrl) return [product.imageUrl]
    return []
  })
  const [isFastDelivery, setIsFastDelivery] = useState(
    product?.isFastDelivery ?? true,
  )
  const [stockStatus, setStockStatus] = useState<'in_stock' | 'out_of_stock'>(
    product?.stockStatus ?? 'in_stock',
  )
  const [submitting, setSubmitting] = useState(false)
  // PR 14 — first failed submit attempt flips this; from then on the
  // per-field validation hints render live instead of the button
  // silently staying disabled.
  const [showValidation, setShowValidation] = useState(false)

  // ESC + scroll lock — same affordances as every other modal in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const numericPrice = Number(price)
  const nameValid = name.trim().length >= 2
  const priceValid = Number.isFinite(numericPrice) && numericPrice >= 0
  const canSubmit = !submitting && nameValid && priceValid

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !accessToken) {
      // Surface WHY instead of a dead disabled button (PR 14).
      setShowValidation(true)
      return
    }
    setSubmitting(true)
    try {
      // Phase 2.5b — send the new gallery via `imageUrls`. The
      // backend (Phase 2.5a) denormalises imageUrls[0] onto the
      // legacy Product.imageUrl column transactionally, so older
      // consumers reading only `imageUrl` keep working. Sending
      // an empty array on update CLEARS the gallery + the legacy
      // imageUrl together (the picker only ever surfaces an empty
      // array when the merchant explicitly removed every tile).
      const result = isEdit
        ? await updateProduct(accessToken, product!.id, {
            name: name.trim(),
            price: numericPrice,
            category,
            imageUrls,
            isFastDelivery,
            stockStatus,
          })
        : await createProduct(accessToken, {
            storeId,
            name: name.trim(),
            price: numericPrice,
            category,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
            isFastDelivery,
            stockStatus,
          })
      onSaved(result)
    } catch {
      toast.show(
        isEdit
          ? t('store.product_update_failed')
          : t('store.product_create_failed'),
        { tone: 'error' },
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md qift-fade-in"
      style={{ background: 'rgba(15, 11, 24, 0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="qift-modal-in w-full max-w-sm overflow-hidden rounded-3xl border backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <h3
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {isEdit ? t('store.edit_product_title') : t('store.add_product_title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('profile.close')}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3.5 p-5">
          <Input
            label={t('store.product_name')}
            value={name}
            onChange={setName}
            error={
              showValidation && !nameValid
                ? t('store.product_name_invalid')
                : undefined
            }
          />
          <Input
            label={t('store.product_price')}
            value={price}
            onChange={setPrice}
            inputMode="decimal"
            placeholder={t('store.product_price_placeholder')}
            error={
              showValidation && !priceValid
                ? t('store.product_price_invalid')
                : undefined
            }
          />
          {/* Phase 2.5b — replaces the legacy single imageUrl
              <Input> with the 8-slot gallery picker. The
              picker stages uploads locally and emits the
              ordered URL array; we only commit to the API on
              Save. URL-paste fallback lives inside the picker
              for merchants who prefer the legacy workflow.
              accessToken is guaranteed non-null because the
              modal renders inside an authenticated dashboard
              route; we coerce with `?? ''` so the picker prop
              stays a string (it short-circuits the upload itself
              if the token is empty). */}
          <ProductMediaPicker
            accessToken={accessToken ?? ''}
            storeId={storeId}
            value={imageUrls}
            onChange={setImageUrls}
          />
          {/* PR 14 — image guidance. The first tile is the primary
              photo everywhere (cards, gift reveal, share preview). */}
          <p
            className="-mt-1.5 text-[0.68rem] leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {imageUrls.length === 0
              ? t('store.product_images_empty_hint')
              : t('store.product_images_hint')}
          </p>
          <div>
            <Label>{t('store.product_category')}</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1.5 w-full rounded-xl border bg-[var(--card)] px-3.5 py-2.5 text-sm font-medium"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`store.cat_${c}`)}
                </option>
              ))}
            </select>
          </div>

          <Toggle
            label={t('store.product_fast')}
            value={isFastDelivery}
            onChange={setIsFastDelivery}
            hint={t('store.product_fast_hint')}
          />
          <Toggle
            label={t('store.product_in_stock')}
            value={stockStatus === 'in_stock'}
            onChange={(v) => setStockStatus(v ? 'in_stock' : 'out_of_stock')}
            hint={
              stockStatus === 'in_stock'
                ? t('store.product_in_stock_hint')
                : t('store.product_out_of_stock_hint')
            }
          />

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-1 inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {submitting ? (
              <span className="qift-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
            ) : isEdit ? (
              t('store.edit_product_submit')
            ) : (
              t('store.add_product_submit')
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// --- Local form helpers (kept here since they're never used elsewhere) ---

function Input({
  label,
  value,
  onChange,
  inputMode,
  placeholder,
  optional,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: 'text' | 'decimal' | 'numeric'
  placeholder?: string
  optional?: boolean
  // PR 14 — inline validation message under the field.
  error?: string
}) {
  const { t } = useI18n()
  return (
    <div>
      <Label>
        {label}
        {optional && (
          <span
            className="ms-2 text-[0.6rem] font-normal"
            style={{ color: 'var(--muted)' }}
          >
            {t('common.optional')}
          </span>
        )}
      </Label>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        dir={inputMode === 'decimal' ? 'ltr' : undefined}
        className="mt-1.5 w-full rounded-xl border bg-[var(--card)] px-3.5 py-2.5 text-sm font-medium"
        style={{
          borderColor: error ? 'rgba(213, 91, 110, 0.55)' : 'var(--border)',
          color: 'var(--text)',
        }}
      />
      {error && (
        <p
          className="mt-1 text-[0.7rem] font-medium"
          style={{ color: '#B83A50' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block text-xs font-semibold tracking-[0.2em]"
      style={{ color: 'var(--text-soft)' }}
    >
      {children}
    </span>
  )
}

function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  // PR 14 — one-liner that explains what the toggle actually does
  // (fast-delivery gates coverage; out-of-stock hides giftability).
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text)',
      }}
    >
      <span className="min-w-0 text-start">
        <span className="block">{label}</span>
        {hint && (
          <span
            className="mt-0.5 block text-[0.66rem] leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{
          background: value ? 'var(--primary)' : 'var(--border-strong)',
        }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
          style={{
            left: value ? 'calc(100% - 18px)' : '2px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        />
      </span>
    </button>
  )
}
