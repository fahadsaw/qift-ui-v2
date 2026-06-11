import CampaignDetailView from './campaign-detail'

// /org/[orgId]/campaigns/[campaignId] — campaign detail + draft
// flow (Console PR 5). Detail is admin/approver on the backend
// (the checker must see exactly what they approve); viewers get a
// calm 403 mapping. Approval actions + dispatch + report land in
// Console PR 6.

type PageProps = { params: Promise<{ orgId: string; campaignId: string }> }

export default async function CampaignDetailPage({ params }: PageProps) {
  const { orgId, campaignId } = await params
  return <CampaignDetailView orgId={orgId} campaignId={campaignId} />
}
