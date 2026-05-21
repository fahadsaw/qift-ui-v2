'use client'

// Admin merchant-review modal.
//
// Operational gap before this slice: the admin store list (in
// app/admin/page.tsx StoresSection) only exposed a generic status
// chip (pending/approved/rejected/suspended). The backend has had
// a richer review surface since onboarding-v2:
//
//   PATCH /admin/stores/:id/review
//     body: { action: approve | reject | request_changes, reason }
//     - validates the action
//     - enforces non-empty reason for reject / request_changes
//     - timestamps reviewedAt + records reviewedBy
//     - audits the action (Phase 8.A)
//
//   GET /admin/stores/:id/detail
//     returns the OwnerStore rich projection (legal entity, country
//     of registration, CR + VAT, contact, delivery zones, rejection
//     reason, submittedAt, reviewedAt)
//
//   GET /admin/stores/:id/documents
//     returns every StoreDocument the merchant uploaded
//
// This component is the one place those three endpoints converge.
// The reviewer sees the full application + every document + the
// previous review history, then picks one of three actions with a
// required reason field for the two negative branches. The save
// path calls adminReviewStore and bubbles the updated row back to
// the parent so the inline chip refreshes without a full refetch.
//
// PRIVACY / SAFETY
//   - Documents are linked as external URLs. The reviewer opens
//     them in a new tab; the bearer-token-free R2 URL is the same
//     one the merchant sees on their own documents page.
//   - The reason textarea is the operator's own note. The backend
//     persists it on Store.rejectionReason and the merchant sees it
//     verbatim on /store-dashboard. Reviewers should keep it
//     calm + actionable (e.g. "CR scan is unreadable — please
//     reupload a clearer copy") because it surfaces to the
//     merchant unmediated.

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import {
  adminGetStoreDetail,
  adminListStoreDocuments,
  adminReviewStore,
  type OwnerStore,
  type StoreDocument,
} from '@/lib/storesApi'
import type { AdminStore } from '../_types'

type ReviewAction = 'approve' | 'reject' | 'request_changes'

// Map a StoreDocument.type discriminator onto a stable translation
// key the admin modal renders. Distinct from the country-specific
// slot labels on the merchant onboarding side (e.g. doc_license_ae)
// — admins always see the canonical doc type irrespective of which
// country the merchant is registered in.
function adminDocLabelKey(docType: StoreDocument['type']): string {
  switch (docType) {
    case 'commercial_registration':
      return 'admin.review_doc_type_commercial_registration'
    case 'vat_certificate':
      return 'admin.review_doc_type_vat_certificate'
    case 'business_license':
      return 'admin.review_doc_type_business_license'
    case 'owner_id':
      return 'admin.review_doc_type_owner_id'
    case 'other':
      return 'admin.review_doc_type_other'
  }
}

export function MerchantReviewModal({
  storeId,
  accessToken,
  onClose,
  onReviewed,
}: {
  storeId: string
  accessToken: string
  onClose: () => void
  onReviewed: (updated: AdminStore) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [detail, setDetail] = useState<OwnerStore | null>(null)
  const [docs, setDocs] = useState<StoreDocument[] | null>(null)
  const [action, setAction] = useState<ReviewAction | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [d, list] = await Promise.all([
        adminGetStoreDetail(accessToken, storeId),
        adminListStoreDocuments(accessToken, storeId),
      ])
      if (cancelled) return
      setDetail(d)
      setDocs(list)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, storeId])

  // The backend enforces a non-empty reason for reject +
  // request_changes; we mirror the check here so the operator
  // sees a calm validation message instead of a generic 400.
  const reasonRequired = action === 'reject' || action === 'request_changes'
  const canSubmit =
    action !== null &&
    !submitting &&
    (!reasonRequired || reason.trim().length > 0)

  const onSubmit = useCallback(async () => {
    if (!action || submitting) return
    if (reasonRequired && reason.trim().length === 0) {
      toast.show(t('admin.review_reason_required'), { tone: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const updated = await adminReviewStore(
        accessToken,
        storeId,
        action,
        reasonRequired ? reason.trim() : undefined,
      )
      toast.show(t('admin.review_saved'))
      // Project the OwnerStore back onto the AdminStore shape the
      // parent list renders. Both share the same id; the parent
      // only cares about status + featured + plan for inline
      // rendering, so we narrow.
      onReviewed({
        ...((detail ?? {}) as unknown as AdminStore),
        id: storeId,
        status: updated.status,
        plan: updated.plan,
      } as AdminStore)
      onClose()
    } catch {
      toast.show(t('admin.review_failed'), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [
    accessToken,
    action,
    detail,
    onClose,
    onReviewed,
    reason,
    reasonRequired,
    storeId,
    submitting,
    t,
    toast,
  ])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
      style={{ background: 'rgba(0, 0, 0, 0.42)' }}
      onClick={(e) => {
        // Click-outside dismiss. Inner clicks stopPropagation below.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-3xl border backdrop-blur-md"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <h2
            className="truncate text-base font-bold"
            style={{ color: 'var(--ink)' }}
          >
            {detail?.name ?? t('admin.review_modal_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm"
            style={{ color: 'var(--muted)' }}
            aria-label={t('admin.review_close')}
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!detail ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {t('admin.review_loading')}
            </p>
          ) : (
            <>
              <StatusStrip detail={detail} />
              <BusinessFields detail={detail} />
              <DocumentList docs={docs} />
            </>
          )}
        </div>

        <footer
          className="flex flex-col gap-2.5 border-t px-5 py-3.5"
          style={{ borderColor: 'var(--hairline)' }}
        >
          {/* Action picker — three chips, calm tones. The reason
              textarea below is required for the two negative
              actions; the backend rejects empty reasons there. */}
          <div className="flex flex-wrap gap-2">
            <ActionChip
              tone="success"
              active={action === 'approve'}
              onClick={() => setAction('approve')}
              label={t('admin.review_action_approve')}
            />
            <ActionChip
              tone="warn"
              active={action === 'request_changes'}
              onClick={() => setAction('request_changes')}
              label={t('admin.review_action_changes')}
            />
            <ActionChip
              tone="danger"
              active={action === 'reject'}
              onClick={() => setAction('reject')}
              label={t('admin.review_action_reject')}
            />
          </div>

          {reasonRequired && (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('admin.review_reason_placeholder')}
              rows={3}
              maxLength={500}
              className="rounded-2xl border bg-transparent px-3 py-2 text-sm focus:outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text)',
                resize: 'vertical',
              }}
            />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('admin.review_cancel')}
            </button>
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={!canSubmit}
              className="flex-1 rounded-full border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: 'var(--primary)',
                background: 'var(--primary)',
                color: 'var(--card)',
              }}
            >
              {submitting ? t('admin.review_saving') : t('admin.review_save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function StatusStrip({ detail }: { detail: OwnerStore }) {
  const { t } = useI18n()
  return (
    <div
      className="rounded-2xl border px-3.5 py-2.5"
      style={{
        borderColor: 'var(--hairline)',
        background: 'var(--card-soft)',
      }}
    >
      <dl className="grid grid-cols-2 gap-2 text-[0.72rem]">
        <Field
          label={t('admin.review_field_status')}
          value={t(`admin.store_status_${detail.status}`) || detail.status}
        />
        <Field
          label={t('admin.review_field_plan')}
          value={detail.plan}
        />
        <Field
          label={t('admin.review_field_submitted_at')}
          value={
            detail.submittedAt
              ? new Date(detail.submittedAt).toLocaleString('ar-SA')
              : '—'
          }
        />
        <Field
          label={t('admin.review_field_reviewed_at')}
          value={
            detail.reviewedAt
              ? new Date(detail.reviewedAt).toLocaleString('ar-SA')
              : '—'
          }
        />
      </dl>
      {detail.rejectionReason && (
        <p
          className="mt-2 rounded-xl border px-2.5 py-1.5 text-[0.72rem]"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--card)',
            color: 'var(--text-soft)',
          }}
        >
          <span
            className="me-1 text-[0.6rem] font-semibold tracking-[0.18em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.review_previous_note')}
          </span>
          {detail.rejectionReason}
        </p>
      )}
    </div>
  )
}

function BusinessFields({ detail }: { detail: OwnerStore }) {
  const { t } = useI18n()
  return (
    <section className="mt-4">
      <h3
        className="text-[0.65rem] font-semibold tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {t('admin.review_section_business')}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[0.72rem]">
        <Field
          label={t('admin.review_field_legal_entity')}
          value={detail.legalEntityName || '—'}
        />
        <Field
          label={t('admin.review_field_country')}
          value={detail.countryOfRegistration || '—'}
        />
        <Field
          label={t('admin.review_field_cr')}
          value={detail.commercialRegistrationNumber || '—'}
          monospace
        />
        <Field
          label={t('admin.review_field_vat')}
          value={detail.vatNumber || '—'}
          monospace
        />
        <Field
          label={t('admin.review_field_contact_person')}
          value={detail.contactPerson || '—'}
        />
        <Field
          label={t('admin.review_field_contact_phone')}
          value={detail.contactPhone || '—'}
          monospace
        />
        <Field
          label={t('admin.review_field_contact_email')}
          value={detail.contactEmail || '—'}
          monospace
        />
        <Field
          label={t('admin.review_field_category')}
          value={detail.category || '—'}
        />
      </dl>
      {detail.deliveryZones && detail.deliveryZones.length > 0 && (
        <div className="mt-3">
          <p
            className="text-[0.6rem] font-semibold tracking-[0.18em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.review_field_zones')}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {detail.deliveryZones.map((z, idx) => (
              <li
                key={`${z.city}-${idx}`}
                className="rounded-full border px-2.5 py-0.5 text-[0.65rem]"
                style={{
                  borderColor: 'var(--hairline)',
                  background: 'var(--card-soft)',
                  color: 'var(--text-soft)',
                }}
              >
                {z.city}
                {z.districts && z.districts.length > 0
                  ? ` · ${z.districts.length}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function DocumentList({ docs }: { docs: StoreDocument[] | null }) {
  const { t } = useI18n()
  return (
    <section className="mt-4">
      <h3
        className="text-[0.65rem] font-semibold tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {t('admin.review_section_documents')}
      </h3>
      {docs === null ? (
        <p
          className="mt-2 text-[0.72rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('admin.review_loading')}
        </p>
      ) : docs.length === 0 ? (
        <p
          className="mt-2 text-[0.72rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('admin.review_no_documents')}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card-soft)',
              }}
            >
              <div className="min-w-0">
                <p
                  className="truncate text-[0.72rem] font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {/* The merchant-side doc slots are country-aware
                      (e.g. doc_license_ae). The admin always sees the
                      canonical type — no country gloss — so we go
                      through a flat type→label map keyed on the
                      stored type discriminator. */}
                  {t(adminDocLabelKey(d.type))}
                </p>
                <p
                  className="truncate text-[0.65rem]"
                  style={{ color: 'var(--muted)' }}
                  dir="ltr"
                >
                  {d.fileName || '—'} ·{' '}
                  {new Date(d.uploadedAt).toLocaleDateString('ar-SA')}
                </p>
              </div>
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full border px-3 py-1 text-[0.65rem] font-semibold underline-offset-4"
                style={{
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                  background: 'var(--card)',
                }}
              >
                {t('admin.review_doc_open')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Field({
  label,
  value,
  monospace,
}: {
  label: string
  value: string | null | undefined
  monospace?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt
        className="text-[0.6rem] font-semibold tracking-[0.18em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </dt>
      <dd
        className="mt-0.5 truncate text-[0.78rem]"
        style={{
          color: 'var(--text)',
          fontFamily: monospace ? 'ui-monospace, SFMono-Regular, monospace' : undefined,
        }}
        dir={monospace ? 'ltr' : undefined}
      >
        {value || '—'}
      </dd>
    </div>
  )
}

function ActionChip({
  tone,
  active,
  onClick,
  label,
}: {
  tone: 'success' | 'warn' | 'danger'
  active: boolean
  onClick: () => void
  label: string
}) {
  // Tone-to-color map. Same palette used by PendingApprovalBanner
  // on the merchant side, so the rejected/changes/approved triple
  // is consistent across the platform.
  const palette =
    tone === 'success'
      ? { color: '#1F9A6A' }
      : tone === 'warn'
        ? { color: '#E89B3A' }
        : { color: '#D55B6E' }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3.5 py-1.5 text-[0.72rem] font-semibold transition-colors"
      style={{
        borderColor: active ? palette.color : 'var(--border)',
        color: active ? palette.color : 'var(--text-soft)',
        background: active ? 'var(--ring)' : 'var(--card-soft)',
      }}
    >
      {label}
    </button>
  )
}
