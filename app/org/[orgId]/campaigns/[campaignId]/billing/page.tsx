import BillingView from './billing-view'

// /org/[orgId]/campaigns/[campaignId]/billing — Track B4 / PE-15.
// The two legal documents (Qift service invoice + merchant goods
// invoice) and the computed billing summary, read-only, from the
// existing org-scoped routes (admin + approver seats server-side).

type PageProps = { params: Promise<{ orgId: string; campaignId: string }> }

export default async function CampaignBillingPage({ params }: PageProps) {
  const { orgId, campaignId } = await params
  return <BillingView orgId={orgId} campaignId={campaignId} />
}
