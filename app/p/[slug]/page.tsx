import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import { SITE_ORIGIN } from '@/lib/siteOrigin'
import { fetchGiftPostBySlug } from '@/lib/giftPosts'
import GiftPostPublicView from './public-view'

// Public share route for a published GiftPost.
//
// Anyone with the link can land here — no JWT required (the backend
// guards via OptionalJwtAuthGuard and the buildGiftPostView helper
// masks identity by default). Authenticated viewers get the 👍
// toggle; anonymous viewers see the count but can't interact.
//
// V1 scope (do not extend):
//   - This page is the ONLY public gift-post surface besides the
//     /u/<username>/giftwall.
//   - No comments rendered or fetched.
//   - No related-post rail / "more from this user" feed.
//
// Privacy:
//   The backend returns an already-masked payload. Identity fields
//   are either populated (when revealSender / revealRecipient is on)
//   or null (default). We do not re-derive identity here. The OG
//   image generation also uses the masked payload — the share
//   preview never reveals more than the masked card itself shows.
//
// Caching:
//   This page is rendered fresh on each request because the post
//   could be unpublished or deactivated between renders. Once a
//   slug-revalidation strategy lands we can move to ISR; for V1
//   the dynamic rendering is the safe default.

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await fetchGiftPostBySlug({ slug })
  if (!post) {
    return { title: 'Qift' }
  }
  const isDeactivated = post.deactivatedAt !== null
  const safeProduct = isDeactivated ? 'Qift' : post.productName
  const sender = post.senderName ?? post.senderUsername ?? 'A Qift gifter'
  const receiver =
    post.receiverName ?? post.receiverUsername ?? 'a recipient'
  // Title: "<product> — on Qift". Description carries the masked
  // identity line. Both already privacy-masked server-side.
  const title = isDeactivated ? 'Qift' : `${safeProduct} · Qift`
  const description = isDeactivated
    ? 'هذه الهدية لم تعد متاحة.'
    : `${sender} → ${receiver}`
  const canonical = `${SITE_ORIGIN}/p/${slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
      siteName: 'Qift',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function PostBySlugPage({ params }: PageProps) {
  const { slug } = await params
  const post = await fetchGiftPostBySlug({ slug })
  if (!post) notFound()
  return (
    <PageContainer size="md">
      <GiftPostPublicView post={post} />
    </PageContainer>
  )
}
