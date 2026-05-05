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
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '')
  const [isFastDelivery, setIsFastDelivery] = useState(
    product?.isFastDelivery ?? true,
  )
  const [stockStatus, setStockStatus] = useState<'in_stock' | 'out_of_stock'>(
    product?.stockStatus ?? 'in_stock',
  )
  const [submitting, setSubmitting] = useState(false)

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
  const canSubmit =
    !submitting &&
    name.trim().length >= 2 &&
    Number.isFinite(numericPrice) &&
    numericPrice >= 0

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !accessToken) return
    setSubmitting(true)
    try {
      const result = isEdit
        ? await updateProduct(accessToken, product!.id, {
            name: name.trim(),
            price: numericPrice,
            category,
            // PATCH treats null/empty as "clear". We want either to
            // unset (when the user wiped the field) or keep the new
            // string — never accidentally re-set the old value.
            imageUrl: imageUrl.trim() || null,
            isFastDelivery,
            stockStatus,
          })
        : await createProduct(accessToken, {
            storeId,
            name: name.trim(),
            price: numericPrice,
            category,
            imageUrl: imageUrl.trim() || undefined,
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
          />
          <Input
            label={t('store.product_price')}
            value={price}
            onChange={setPrice}
            inputMode="decimal"
          />
          <Input
            label={t('store.product_image_url')}
            value={imageUrl}
            onChange={setImageUrl}
            placeholder="https://"
            optional
          />
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
          />
          <Toggle
            label={t('store.product_in_stock')}
            value={stockStatus === 'in_stock'}
            onChange={(v) => setStockStatus(v ? 'in_stock' : 'out_of_stock')}
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: 'text' | 'decimal' | 'numeric'
  placeholder?: string
  optional?: boolean
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
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      />
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
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text)',
      }}
    >
      <span>{label}</span>
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
