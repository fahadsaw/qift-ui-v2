'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { SITE_ORIGIN } from '@/lib/siteOrigin'
import {
  publishGiftPost,
  unpublishGiftPost,
  fetchMyGiftPostByGift,
  giftPostShareUrl,
  GiftPostError,
  type BackendGiftPostRow,
} from '@/lib/giftPosts'

// Publish / share CTA card rendered on /gifts/[id].
//
// V1 scope (do not extend):
//   - Sender-only entry point. The receiver-side CTA is a future
//     surface; we keep this component flexible by accepting `direction`,
//     but the parent only renders it for the sender today.
//   - Two states: not published → "Share this gift" CTA; published →
//     copy-link button + unpublish.
//   - Visibility toggle is intentionally absent in V1 — defaults to
//     'public'. The setVisibility endpoint exists for future opt-in.
//
// Privacy reminder (also enforced server-side via buildGiftPostView):
//   the public /p/<slug> page renders an anonymous identity by
//   default. Sharing does NOT reveal sender or recipient identity to
//   third parties.
export default function GiftPostPublishCard({
  giftId,
  direction,
  giftStatus,
}: {
  giftId: string
  direction: 'sent' | 'received'
  giftStatus: string
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const [post, setPost] = useState<BackendGiftPostRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<
    'publish' | 'unpublish' | 'copy' | null
  >(null)

  // Discover whether this gift already has a (V1: sender-owned) post.
  // Single targeted GET so the CTA renders with the right copy on
  // first paint — no full-wall scan, no race with the publish click.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!accessToken) {
        if (!cancelled) setLoading(false)
        return
      }
      try {
        const row = await fetchMyGiftPostByGift({ accessToken, giftId })
        if (cancelled) return
        setPost(row)
      } catch {
        // Non-fatal — the CTA still works; just no pre-population.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, giftId])

  // V1 doesn't ship publishing for surprise gifts before delivery —
  // the receiver hasn't experienced the reveal yet, sharing would
  // spoil it. We keep the receiver-side post unpublishable here too
  // for symmetry. Once status === 'delivered' the gate lifts.
  const tooEarly =
    giftStatus !== 'delivered' && giftStatus !== 'address_confirmed'

  if (!accessToken) return null

  const onPublish = async () => {
    if (!accessToken || pending) return
    setPending('publish')
    try {
      const row = await publishGiftPost({ accessToken, giftId })
      setPost(row)
      toast.show(t('gift_posts.toast_published'))
    } catch (err) {
      const msg =
        err instanceof GiftPostError && err.message
          ? err.message
          : t('gift_posts.toast_publish_failed')
      toast.show(msg)
    } finally {
      setPending(null)
    }
  }

  const onUnpublish = async () => {
    if (!accessToken || !post || pending) return
    setPending('unpublish')
    try {
      const row = await unpublishGiftPost({ accessToken, postId: post.id })
      setPost(row)
      toast.show(t('gift_posts.toast_unpublished'))
    } catch {
      toast.show(t('gift_posts.toast_publish_failed'))
    } finally {
      setPending(null)
    }
  }

  const onCopy = async () => {
    if (!post?.publicSlug || pending) return
    setPending('copy')
    const url = giftPostShareUrl(SITE_ORIGIN, post.publicSlug)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        // Fallback for older browsers / non-secure contexts.
        const textArea = document.createElement('textarea')
        textArea.value = url
        textArea.setAttribute('readonly', '')
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      toast.show(t('gift_posts.toast_link_copied'))
    } catch {
      toast.show(t('gift_posts.toast_copy_failed'))
    } finally {
      setPending(null)
    }
  }

  if (loading) {
    return (
      <Card className="mt-4">
        <div className="h-5 w-1/2 animate-pulse rounded-md bg-gray-200/40" />
        <div className="mt-3 h-3 w-3/4 animate-pulse rounded-md bg-gray-200/40" />
      </Card>
    )
  }

  const published = post !== null && post.publishedAt !== null

  return (
    <Card className="mt-4">
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg"
          style={{
            background: 'var(--surface-soft)',
            color: 'var(--text)',
          }}
        >
          {published ? '🌟' : '✨'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {published
              ? t('gift_posts.published_title')
              : t('gift_posts.publish_title')}
          </div>
          <p
            className="mt-1 text-xs leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {published
              ? t('gift_posts.published_body')
              : direction === 'sent'
                ? t('gift_posts.publish_body_sender')
                : t('gift_posts.publish_body_receiver')}
          </p>

          {!published && tooEarly && (
            <p
              className="mt-2 text-xs"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('gift_posts.publish_locked_until_delivered')}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!published && (
              <button
                type="button"
                onClick={() => void onPublish()}
                disabled={pending !== null || tooEarly}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  boxShadow: 'var(--shadow-cta)',
                }}
              >
                {pending === 'publish'
                  ? t('gift_posts.publishing')
                  : t('gift_posts.publish_cta')}
              </button>
            )}
            {published && (
              <>
                <button
                  type="button"
                  onClick={() => void onCopy()}
                  disabled={pending !== null}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: 'var(--primary)',
                    color: '#fff',
                    boxShadow: 'var(--shadow-cta)',
                  }}
                >
                  {pending === 'copy'
                    ? t('gift_posts.copying')
                    : t('gift_posts.copy_link')}
                </button>
                <button
                  type="button"
                  onClick={() => void onUnpublish()}
                  disabled={pending !== null}
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  {pending === 'unpublish'
                    ? t('gift_posts.unpublishing')
                    : t('gift_posts.unpublish')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

