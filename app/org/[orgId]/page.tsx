import OrgDashboard from './dashboard'

// /org/[orgId] — company console dashboard (Console PR 3). Server
// shell only; all data is viewer-scoped client-side (the org plane
// is JWT-authenticated, nothing to render server-side).

type PageProps = { params: Promise<{ orgId: string }> }

export default async function OrgDetailPage({ params }: PageProps) {
  const { orgId } = await params
  return <OrgDashboard orgId={orgId} />
}
