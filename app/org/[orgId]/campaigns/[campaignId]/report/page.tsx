import ReportView from './report-view'

// /org/[orgId]/campaigns/[campaignId]/report — the F7 funnel view
// (Console PR 6). Readable by EVERY active seat, viewer included —
// read-only reports are the viewer role's entire purpose.

type PageProps = { params: Promise<{ orgId: string; campaignId: string }> }

export default async function CampaignReportPage({ params }: PageProps) {
  const { orgId, campaignId } = await params
  return <ReportView orgId={orgId} campaignId={campaignId} />
}
