import MembersManager from './members-manager'

// /org/[orgId]/members — seat management (Console PR 3).
// Owner-only: the backend's OrgRoleGuard enforces it; OrgShell hides
// the tab from non-owners as UX.

type PageProps = { params: Promise<{ orgId: string }> }

export default async function OrgMembersPage({ params }: PageProps) {
  const { orgId } = await params
  return <MembersManager orgId={orgId} />
}
