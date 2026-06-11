import CampaignsList from './campaigns-list'

// /org/[orgId]/campaigns — campaign list + create (Console PR 5).
// List is every-seat (counts only, no recipient PII); drafting is
// admin/owner (backend-enforced, UI-hinted).

type PageProps = { params: Promise<{ orgId: string }> }

export default async function OrgCampaignsPage({ params }: PageProps) {
  const { orgId } = await params
  return <CampaignsList orgId={orgId} />
}
