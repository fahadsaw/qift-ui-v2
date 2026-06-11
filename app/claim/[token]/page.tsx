import type { Metadata } from 'next'
import ClaimFlow from './claim-flow'

// Public corporate-claim route. The recipient holds a one-time link
// (distributed manually in the concierge pilot) and NEVER registers.
//
// F1 RULE (Corporate Core v2): nothing identifying may render before
// OTP verification — so this server shell fetches NOTHING. The
// metadata below is fully generic on purpose: no recipient, no
// company, no gift. All staging happens client-side in ClaimFlow,
// which only ever receives identifying data from the backend AFTER
// the OTP possession proof.
//
// noindex: claim links are private one-time URLs; they must never
// end up in a search index even if someone posts one publicly.

export const metadata: Metadata = {
  title: 'هدية بانتظارك · Qift',
  description: 'لديك هدية بانتظار الاستلام عبر قِفت.',
  robots: { index: false, follow: false },
}

type PageProps = {
  params: Promise<{ token: string }>
}

export default async function ClaimPage({ params }: PageProps) {
  const { token } = await params
  return <ClaimFlow token={token} />
}
