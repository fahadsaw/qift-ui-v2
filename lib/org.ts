'use client'

// Corporate org-plane API client (Console PR 2).
//
// Typed surface over the /org/* backend (apps/api src/corporate/*).
// Authorisation is enforced server-side by OrgRoleGuard: tenant
// scoping + seat roles live there; this client is a convenience
// layer, not the boundary. A 404 on an org route can mean "no such
// org" OR "you hold no seat" — the backend deliberately doesn't
// distinguish (anti-enumeration), so the UI shouldn't either.
//
// Covers the full org plane so console PRs share one client:
// orgs + seats (PR 7a) + roster (PR 2) + campaigns/dispatch
// (PRs 3–4) + reports (PR 6, F7-collapsed).

import { API_BASE } from './apiBase'

export class OrgApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
    // Full parsed error body — some rejections carry structured
    // extras (e.g. roster_address_columns_forbidden lists the
    // offending `columns` so the UI can name them).
    public readonly body: unknown = null,
  ) {
    super(message)
    this.name = 'OrgApiError'
  }
}

async function authedFetch(
  accessToken: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!accessToken) throw new OrgApiError('not_authenticated', 401)
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      code?: string
      message?: string
    } | null
    throw new OrgApiError(
      body?.message ?? `request_failed_${res.status}`,
      res.status,
      body?.code ?? body?.message ?? null,
      body,
    )
  }
  return res
}

// ── Wire types (Prisma rows verbatim; dates are ISO strings) ─────

export type OrgRole = 'owner' | 'admin' | 'approver' | 'viewer'

export type OrgStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'suspended'

export type Org = {
  id: string
  legalName: string
  displayName: string
  displayNameAr: string | null
  crNumber: string | null
  vatNumber: string | null
  billingEmail: string | null
  billingAddress: string | null
  status: OrgStatus
  rejectionReason: string | null
  submittedAt: string | null
  createdAt: string
}

export type MyOrg = Org & { myRole: OrgRole }

export type OrgMember = {
  id: string
  userId: string
  role: OrgRole
  qiftUsername: string | null
  invitedBy: string | null
  acceptedAt: string | null
  createdAt: string
}

export type OrgContact = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  department: string | null
  employeeRef: string | null
  status: 'active' | 'archived'
  importBatchId: string | null
  purgeAfter: string
  createdAt: string
}

export type RosterImportResult = {
  batchId: string
  imported: number
  skipped: { line: number; reason: string }[]
  ignoredColumns: string[]
}

export type CampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'changes_requested'
  | 'dispatching'
  | 'completed'
  | 'cancelled'

export type Campaign = {
  id: string
  name: string
  occasion: string | null
  message: string | null
  status: CampaignStatus
  createdBy: string
  submittedAt: string | null
  approvedAt: string | null
  reviewNote: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export type CampaignListItem = Campaign & {
  _count: { recipients: number; options: number }
}

export type CampaignDetail = Campaign & {
  options: {
    id: string
    productId: string
    approvalSnapshot: {
      productId?: string
      productName?: string
      price?: number
      imageUrl?: string | null
      category?: string
      storeId?: string
      storeName?: string
    } | null
    snapshotAt: string | null
  }[]
  recipients: {
    id: string
    contactId: string
    contact: {
      fullName: string
      department: string | null
      status: string
    } | null
  }[]
}

export type CampaignReport = {
  campaign: Pick<
    Campaign,
    'id' | 'name' | 'occasion' | 'status' | 'submittedAt' | 'approvedAt' | 'createdAt'
  >
  recipients: number
  dispatched: number
  gifts: {
    issued: number
    claimed: number
    pending: number
    didNotParticipate: number
  }
}

export type DispatchStatus = {
  campaignStatus: CampaignStatus
  jobs: Record<string, number>
}

// ── Orgs ─────────────────────────────────────────────────────────

export async function myOrgs(token: string | null): Promise<MyOrg[]> {
  return (await authedFetch(token, '/org/mine')).json()
}

export async function createOrg(
  token: string | null,
  body: {
    legalName: string
    displayName: string
    displayNameAr?: string
    crNumber?: string
    vatNumber?: string
    billingEmail?: string
  },
): Promise<Org> {
  return (
    await authedFetch(token, '/org', { method: 'POST', body: JSON.stringify(body) })
  ).json()
}

export async function getOrg(token: string | null, orgId: string): Promise<Org> {
  return (await authedFetch(token, `/org/${orgId}`)).json()
}

export async function submitOrg(token: string | null, orgId: string): Promise<Org> {
  return (
    await authedFetch(token, `/org/${orgId}/submit`, { method: 'POST' })
  ).json()
}

// ── Members (owner-only) ─────────────────────────────────────────

export async function listMembers(
  token: string | null,
  orgId: string,
): Promise<OrgMember[]> {
  return (await authedFetch(token, `/org/${orgId}/members`)).json()
}

export async function addMember(
  token: string | null,
  orgId: string,
  body: { qiftUsername: string; role: Exclude<OrgRole, 'owner'> },
): Promise<OrgMember> {
  return (
    await authedFetch(token, `/org/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).json()
}

export async function revokeMember(
  token: string | null,
  orgId: string,
  seatId: string,
): Promise<{ ok: boolean }> {
  return (
    await authedFetch(token, `/org/${orgId}/members/${seatId}`, {
      method: 'DELETE',
    })
  ).json()
}

// ── Roster (admin seats) ─────────────────────────────────────────

export async function importRoster(
  token: string | null,
  orgId: string,
  csv: string,
): Promise<RosterImportResult> {
  return (
    await authedFetch(token, `/org/${orgId}/contacts/import`, {
      method: 'POST',
      body: JSON.stringify({ csv }),
    })
  ).json()
}

export async function listContacts(
  token: string | null,
  orgId: string,
  opts: { status?: 'active' | 'archived'; cursor?: string } = {},
): Promise<{ items: OrgContact[]; nextCursor: string | null }> {
  const q = new URLSearchParams()
  if (opts.status) q.set('status', opts.status)
  if (opts.cursor) q.set('cursor', opts.cursor)
  const qs = q.toString()
  return (
    await authedFetch(token, `/org/${orgId}/contacts${qs ? `?${qs}` : ''}`)
  ).json()
}

export async function archiveContact(
  token: string | null,
  orgId: string,
  contactId: string,
): Promise<{ ok: boolean }> {
  return (
    await authedFetch(token, `/org/${orgId}/contacts/${contactId}/archive`, {
      method: 'PATCH',
    })
  ).json()
}

// ── Campaigns ────────────────────────────────────────────────────

export async function listCampaigns(
  token: string | null,
  orgId: string,
): Promise<CampaignListItem[]> {
  return (await authedFetch(token, `/org/${orgId}/campaigns`)).json()
}

export async function getCampaign(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<CampaignDetail> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}`)
  ).json()
}

export async function createCampaign(
  token: string | null,
  orgId: string,
  body: { name: string; occasion?: string; message?: string },
): Promise<Campaign> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).json()
}

export async function updateCampaign(
  token: string | null,
  orgId: string,
  campaignId: string,
  body: { name?: string; occasion?: string; message?: string },
): Promise<Campaign> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).json()
}

export async function setGiftOption(
  token: string | null,
  orgId: string,
  campaignId: string,
  productId: string,
): Promise<{ ok: boolean }> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/gift-option`, {
      method: 'PUT',
      body: JSON.stringify({ productId }),
    })
  ).json()
}

export async function addCampaignRecipients(
  token: string | null,
  orgId: string,
  campaignId: string,
  contactIds: string[],
): Promise<{ added: number; skipped: number }> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/recipients`, {
      method: 'POST',
      body: JSON.stringify({ contactIds }),
    })
  ).json()
}

export async function removeCampaignRecipient(
  token: string | null,
  orgId: string,
  campaignId: string,
  recipientId: string,
): Promise<{ ok: boolean }> {
  return (
    await authedFetch(
      token,
      `/org/${orgId}/campaigns/${campaignId}/recipients/${recipientId}`,
      { method: 'DELETE' },
    )
  ).json()
}

export async function submitCampaign(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<Campaign> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/submit`, {
      method: 'POST',
    })
  ).json()
}

export async function approveCampaign(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<Campaign> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/approve`, {
      method: 'POST',
    })
  ).json()
}

export async function requestCampaignChanges(
  token: string | null,
  orgId: string,
  campaignId: string,
  note: string,
): Promise<Campaign> {
  return (
    await authedFetch(
      token,
      `/org/${orgId}/campaigns/${campaignId}/request-changes`,
      { method: 'POST', body: JSON.stringify({ note }) },
    )
  ).json()
}

export async function cancelCampaign(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<Campaign> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/cancel`, {
      method: 'POST',
    })
  ).json()
}

export async function dispatchCampaign(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<{ ok: boolean; jobs: number }> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/dispatch`, {
      method: 'POST',
    })
  ).json()
}

export async function getDispatchStatus(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<DispatchStatus> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/dispatch-status`)
  ).json()
}

export async function getCampaignReport(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<CampaignReport> {
  return (
    await authedFetch(token, `/org/${orgId}/campaigns/${campaignId}/report`)
  ).json()
}

// ── Role helpers (UI hints only — the backend is the boundary) ───

export function canManageSeats(role: OrgRole): boolean {
  return role === 'owner'
}
export function canDraftCampaigns(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}
export function canApproveCampaigns(role: OrgRole): boolean {
  return role === 'owner' || role === 'approver'
}
export function canManageRoster(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}
