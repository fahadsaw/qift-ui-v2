'use client'

// Merchant document upload page.
//
// Operational gap before this page: merchants finished the 4-step
// /store-dashboard/new form, the Store row was created, but there
// was no UI surface to upload the verification documents the admin
// needs to approve them — so every closed-beta merchant got stuck
// in "pending" forever. The backend has had POST /media/store-
// document since onboarding-v2 landed; the helper exists in
// lib/storesApi.ts; only the UI was missing.
//
// This page is the merchant-facing companion to the admin review
// modal (app/admin/_components/MerchantReviewModal.tsx). It:
//
//   1. Resolves which Store the viewer owns. Multi-store owners pick
//      via the chip row at the top; single-store owners auto-select.
//   2. Reads the store's `countryOfRegistration` and asks
//      lib/businessDocs.ts which document slots apply
//      (commercial_registration / vat_certificate / business_license
//      / owner_id / other, with required-flags varying per country).
//   3. For each slot, lists every previously-uploaded document of
//      that type with a view link + delete button. The "Required"
//      and "Optional" labels make the bare minimum unmistakable.
//   4. Single tap → file picker → upload via uploadStoreDocument
//      (multipart). On success, the list refreshes; failures show
//      a calm toast and leave the slot empty.
//
// PRIVACY
//
// Documents contain sensitive business data (CR numbers, owner
// IDs). The backend stores them under an unguessable R2 key + gates
// the list/upload/delete endpoints to the owner + admins. This page
// renders the fileUrl as an external link — modern browsers will
// open / download the document directly. The link is bearer-token-
// free; security comes from the R2 unguessable key (same model as
// gift media).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { getBusinessDocConfig, type DocumentSlot } from '@/lib/businessDocs'
import {
  deleteStoreDocument,
  getOwnerStore,
  listMyStores,
  listStoreDocuments,
  uploadStoreDocument,
  type ApiStore,
  type OwnerStore,
  type StoreDocument,
} from '@/lib/storesApi'

// "other" is a multi-row free-form slot — every supporting document
// the merchant wants to attach beyond the canonical four. We don't
// dedupe by type for this slot.
const OTHER_SLOT: DocumentSlot = {
  type: 'other',
  labelKey: 'merchant.doc_other',
  required: false,
  hintKey: 'merchant.doc_other_hint',
}

export default function MerchantDocumentsPage() {
  const router = useRouter()
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()
  const ready = useSimulatedReady(120)

  const [stores, setStores] = useState<ApiStore[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OwnerStore | null>(null)
  const [docs, setDocs] = useState<StoreDocument[] | null>(null)
  // Per-slot pending state — keyed by the slot's `type` (with the
  // "other" slot identified by its synthetic key) so multiple slots
  // can upload independently without flashing each other's spinners.
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Auth gate. Same convention as the rest of /store-dashboard/* —
  // bounce unauthenticated visitors back to login with a return path.
  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?next=/store-dashboard/documents')
    }
  }, [isAuthenticated, router])

  // Resolve which stores the viewer owns. Single-store owners
  // auto-select; multi-store owners get a chip picker at the top.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      const list = await listMyStores(accessToken)
      if (cancelled) return
      setStores(list)
      if (list.length === 1 && !activeId) setActiveId(list[0].id)
      else if (list.length > 0 && !activeId) setActiveId(list[0].id)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, activeId])

  // Fetch the owner-side rich projection (status, rejection reason,
  // countryOfRegistration) for the active store. Drives the slot
  // list AND the calm review-state banner at the top.
  const refresh = useCallback(async () => {
    if (!accessToken || !activeId) return
    const [d, list] = await Promise.all([
      getOwnerStore(accessToken, activeId),
      listStoreDocuments(accessToken, activeId),
    ])
    setDetail(d)
    setDocs(list)
  }, [accessToken, activeId])

  useEffect(() => {
    // Async IIFE keeps the setState calls inside refresh() out of
    // the synchronous effect body — same pattern used by the other
    // /store-dashboard pages to satisfy react-hooks/set-state-in-
    // effect.
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  // Slot list = canonical slots from the country config + the
  // free-form "other" bucket. Merchants registered in a country we
  // haven't tailored fall through to the OTHER config which itself
  // already includes an `other` slot — we de-dupe so the bucket
  // doesn't render twice.
  const slots = useMemo<DocumentSlot[]>(() => {
    const country = detail?.countryOfRegistration ?? null
    const config = getBusinessDocConfig(country)
    const hasOther = config.documents.some((s) => s.type === 'other')
    return hasOther ? config.documents : [...config.documents, OTHER_SLOT]
  }, [detail?.countryOfRegistration])

  const docsByType = useMemo(() => {
    const map = new Map<string, StoreDocument[]>()
    for (const d of docs ?? []) {
      const arr = map.get(d.type) ?? []
      arr.push(d)
      map.set(d.type, arr)
    }
    return map
  }, [docs])

  const onUpload = useCallback(
    async (slot: DocumentSlot, file: File) => {
      if (!accessToken || !activeId) return
      setUploading((u) => ({ ...u, [slot.type]: true }))
      try {
        await uploadStoreDocument(accessToken, {
          storeId: activeId,
          type: slot.type,
          file,
        })
        toast.show(t('merchant.docs_upload_success'))
        await refresh()
      } catch {
        // Backend rejects via MIME / size / ownership — surface a
        // single calm toast; the file input is reset by the input's
        // own onChange handler so the user can retry without
        // re-picking.
        toast.show(t('merchant.docs_upload_failed'), { tone: 'error' })
      } finally {
        setUploading((u) => ({ ...u, [slot.type]: false }))
      }
    },
    [accessToken, activeId, refresh, t, toast],
  )

  const onDelete = useCallback(
    async (doc: StoreDocument) => {
      if (!accessToken) return
      setDeletingId(doc.id)
      try {
        await deleteStoreDocument(accessToken, doc.id)
        toast.show(t('merchant.docs_deleted'))
        await refresh()
      } catch {
        toast.show(t('merchant.docs_delete_failed'), { tone: 'error' })
      } finally {
        setDeletingId(null)
      }
    },
    [accessToken, refresh, t, toast],
  )

  if (!ready || isAuthenticated !== true) {
    return (
      <PageContainer size="md">
        <section className="pt-5">
          <Skeleton className="h-32 w-full" rounded="2xl" />
        </section>
      </PageContainer>
    )
  }

  // Empty-state: no stores → guide the user to /store-dashboard/new.
  if (stores.length === 0) {
    return (
      <PageContainer size="md">
        <section className="pt-5">
          <PageHeading
            badge={<Badge>{t('store.badge')}</Badge>}
            line1={t('merchant.docs_title_1')}
            gradient={t('merchant.docs_title_2')}
            subtitle={t('merchant.docs_empty_no_store')}
            size="sm"
          />
          <div className="mt-6">
            <Link
              href="/store-dashboard/new"
              className="inline-flex rounded-2xl border px-5 py-3 text-sm font-semibold"
              style={{
                borderColor: 'var(--primary)',
                color: 'var(--primary)',
                background: 'var(--card-soft)',
              }}
            >
              {t('merchant.cta_start_application')}
            </Link>
          </div>
        </section>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('store.badge')}</Badge>}
          line1={t('merchant.docs_title_1')}
          gradient={t('merchant.docs_title_2')}
          subtitle={t('merchant.docs_subtitle')}
          size="sm"
        />

        {/* Multi-store chip picker. Hidden for single-store owners. */}
        {stores.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className="rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold"
                style={{
                  borderColor:
                    s.id === activeId ? 'var(--primary)' : 'var(--border)',
                  background:
                    s.id === activeId ? 'var(--ring)' : 'var(--card-soft)',
                  color:
                    s.id === activeId ? 'var(--primary)' : 'var(--text-soft)',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Review-state banner: rejection reason / changes_requested
            note rendered prominently so the merchant knows WHY they
            need to add or replace docs. */}
        <ReviewStateBanner detail={detail} />

        {/* Slot list. Each slot owns its own file input + list of
            already-uploaded files. Required slots are visually
            heavier; optional slots calmer. */}
        <ul className="mt-5 flex flex-col gap-4">
          {slots.map((slot) => (
            <li key={slot.type}>
              <SlotCard
                slot={slot}
                existing={docsByType.get(slot.type) ?? []}
                uploading={uploading[slot.type] === true}
                deletingId={deletingId}
                onUpload={(f) => void onUpload(slot, f)}
                onDelete={(d) => void onDelete(d)}
              />
            </li>
          ))}
        </ul>

        <p
          className="mt-6 text-center text-[0.72rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('merchant.docs_back_link_prefix')}{' '}
          <Link
            href="/store-dashboard"
            className="font-medium underline-offset-4 hover:underline"
            style={{ color: 'var(--ink)' }}
          >
            {t('merchant.docs_back_link')}
          </Link>
        </p>
      </section>
    </PageContainer>
  )
}

// Renders the rejection reason (rejected) or change-request note
// (changes_requested) when present. Empty for approved / pending
// stores — those don't need a callout on this page.
function ReviewStateBanner({ detail }: { detail: OwnerStore | null }) {
  const { t } = useI18n()
  if (!detail) return null
  const status = detail.status
  if (status !== 'rejected' && status !== 'changes_requested') return null
  const isRejected = status === 'rejected'
  const tone = isRejected
    ? { color: '#D55B6E', glow: 'rgba(220, 90, 110, 0.10)' }
    : { color: '#E89B3A', glow: 'rgba(232, 155, 58, 0.12)' }
  return (
    <div
      role="status"
      className="mt-4 rounded-2xl border p-4 backdrop-blur-md"
      style={{
        borderColor: `color-mix(in srgb, ${tone.color} 35%, var(--border))`,
        background: `linear-gradient(135deg, ${tone.glow} 0%, var(--card) 100%)`,
      }}
    >
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
        {t(
          isRejected
            ? 'merchant.banner_rejected_title'
            : 'merchant.banner_changes_title',
        )}
      </p>
      {detail.rejectionReason && (
        <p
          className="mt-1.5 text-[0.78rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {detail.rejectionReason}
        </p>
      )}
    </div>
  )
}

function SlotCard({
  slot,
  existing,
  uploading,
  deletingId,
  onUpload,
  onDelete,
}: {
  slot: DocumentSlot
  existing: StoreDocument[]
  uploading: boolean
  deletingId: string | null
  onUpload: (file: File) => void
  onDelete: (doc: StoreDocument) => void
}) {
  const { t } = useI18n()
  // Stable input id so the visible button-styled <label> can target
  // the file input without rendering it. Keyed on the slot type so
  // multiple slots on one page never share an id.
  const inputId = `doc-upload-${slot.type}`

  return (
    <div
      className="rounded-3xl border p-4 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {t(slot.labelKey)}
          </h3>
          <p
            className="mt-0.5 text-[0.72rem]"
            style={{ color: 'var(--muted)' }}
          >
            {t(slot.hintKey)}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
          style={{
            borderColor: slot.required ? 'var(--primary)' : 'var(--border)',
            color: slot.required ? 'var(--primary)' : 'var(--muted)',
            background: 'var(--card-soft)',
          }}
        >
          {t(slot.required ? 'merchant.doc_required' : 'merchant.doc_optional')}
        </span>
      </div>

      {existing.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {existing.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card-soft)',
              }}
            >
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-[0.78rem] font-medium underline-offset-4 hover:underline"
                style={{ color: 'var(--ink)' }}
              >
                {d.fileName || t('merchant.doc_unnamed')}
              </a>
              <button
                type="button"
                onClick={() => onDelete(d)}
                disabled={deletingId === d.id}
                className="shrink-0 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: 'var(--border)',
                  color: '#D55B6E',
                  background: 'var(--card)',
                }}
              >
                {t('merchant.docs_delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <label
          htmlFor={inputId}
          aria-disabled={uploading}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold"
          style={{
            borderColor: 'var(--primary)',
            color: 'var(--primary)',
            background: 'var(--card-soft)',
            opacity: uploading ? 0.6 : 1,
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading
            ? t('merchant.docs_uploading')
            : existing.length > 0
              ? t('merchant.docs_add_another')
              : t('merchant.docs_upload')}
        </label>
        <input
          id={inputId}
          type="file"
          // Backend allow-list: PDF + the same image set we accept
          // on avatars (PNG/JPEG/WebP/HEIC). The `accept` attribute
          // is a hint to the OS file picker, not a security gate —
          // the server re-validates the MIME on every upload.
          accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
          disabled={uploading}
          // Hidden input; the visible label-button above is the
          // actual affordance. Using `srOnly` keeps it focus-
          // navigable for keyboard users.
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Reset the input value AFTER reading the file so picking
            // the same filename twice in a row still fires onChange.
            e.target.value = ''
            if (file) onUpload(file)
          }}
        />
        <span
          className="text-[0.65rem]"
          style={{ color: 'var(--muted)' }}
        >
          {t('merchant.docs_accept_hint')}
        </span>
      </div>
    </div>
  )
}
