import RosterManager from './roster-manager'

// /org/[orgId]/roster — roster management (Console PR 4).
// Admin/owner surface: the backend's OrgRoleGuard enforces it;
// OrgShell hides the tab from other seats as UX.

type PageProps = { params: Promise<{ orgId: string }> }

export default async function OrgRosterPage({ params }: PageProps) {
  const { orgId } = await params
  return <RosterManager orgId={orgId} />
}
