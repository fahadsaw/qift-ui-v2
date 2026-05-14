'use client'

// Legacy merchant onboarding page. The original form here faked
// its submit (setTimeout → "success") and never called any API,
// which made it a confusing dead end for anyone who actually
// signed up through it. The real onboarding lives at
// /store-dashboard/new — backed by the createStore API and the
// proper auth bounce when the visitor isn't signed in.
//
// This page is preserved as a transparent redirect so:
//   - external / cached links to /merchant still funnel into the
//     real flow
//   - the login page's marketing card (linking here) keeps
//     working without a coordinated edit
//   - SEO doesn't lose the path
//
// The redirect runs client-side because the rest of the app uses
// the client-side `next/navigation` router. A server-side 308
// would also work but would require dropping 'use client' and
// switching to a route-level redirect in Next.js's metadata.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import PageContainer from '@/components/PageContainer'

export default function MerchantPage() {
  const router = useRouter()
  const { t } = useI18n()

  useEffect(() => {
    router.replace('/store-dashboard/new')
  }, [router])

  return (
    <PageContainer>
      <section className="pt-12 text-center">
        <p
          className="text-[0.85rem]"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('merchant.redirecting')}
        </p>
      </section>
    </PageContainer>
  )
}
