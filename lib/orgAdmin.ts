'use client'

// Admin corporate API client — the ops plane (Pre-pilot screens).
//
// Route map (1:1 with apps/api src/corporate):
//   GET  /admin/orgs?status=                          → listAdminOrgs
//   GET  /admin/orgs/:orgId                           → getAdminOrg
//   POST /admin/orgs/:orgId/review                    → reviewOrg
//   GET  /admin/orgs/:orgId/campaigns                 → listAdminOrgCampaigns
//   GET  /admin/orgs/:orgId/campaigns/:id/report      → getAdminCampaignReport
//   POST /admin/orgs/:orgId/campaigns/:id/claim-links → exportClaimLinks
//   GET  /admin/stores-business?status=               → listBusinessProfiles
//   POST /admin/stores-business/:storeId/apply        → applyStoreBusiness
//   POST /admin/stores-business/:storeId/review       → reviewStoreBusiness
//
// Authorization is server-side: /admin/orgs/* needs org.review,
// /admin/stores-business/* needs store.review. A 403 here means the
// operator's ops role lacks the grant. Claim-link export ROTATES
// tokens (export IS the distribution event) — the UI must confirm
// before calling.

import { API_BASE } from './apiBase'

export class OrgAdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
  ) {
    super(message)
    this.name = 'OrgAdminApiError'
  }
}

async function authedFetch(
  accessToken: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!accessToken) throw new OrgAdminApiError('not_authenticated', 401)
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
    throw new OrgAdminApiError(
      body?.message ?? `request_failed_${res.status}`,
      res.status,
      body?.code ?? body?.message ?? null,
    )
  }
  return res
}

// ── Wire types ───────────────────────────────────────────────────

export type AdminOrg = {
  id: string
  legalName: string
  displayName: string
  displayNameAr: string | null
  crNumber: string | null
  vatNumber: string | null
  billingEmail: string | null
  status: string
  riskTier: string
  rejectionReason: string | null
  createdBy: string
  submittedAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  createdAt: string
}

export type AdminOrgDetail = AdminOrg & {
  seats: { userId: string; role: string; createdAt: string }[]
}

export type AdminOrgCampaign = {
  id: string
  name: string
  occasion: string | null
  status: string
  createdAt: string
  _count: { recipients: number; options: number }
}

export type AdminCampaignReport = {
  campaign: { id: string; name: string; status: string }
  recipients: number
  jobs: Record<string, number>
  claims: Record<string, number>
  pendingExpired: number
}

export type ClaimLinkExport = {
  campaign: { id: string; name: string }
  exported: number
  skippedFinalized: number
  skippedUnreachable: number
  links: { contactName: string; channel: string; claimUrl: string }[]
}

export type BusinessProfile = {
  id: string
  storeId: string
  status: string
  appliedAt: string
  reviewedAt: string | null
  reason: string | null
  store: { id: string; name: string; city: string; status: string }
}

// ── Orgs ─────────────────────────────────────────────────────────

export async function listAdminOrgs(
  token: string | null,
  status?: string,
): Promise<AdminOrg[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return (await authedFetch(token, `/admin/orgs${q}`)).json()
}

export async function getAdminOrg(
  token: string | null,
  orgId: string,
): Promise<AdminOrgDetail> {
  return (await authedFetch(token, `/admin/orgs/${orgId}`)).json()
}

export async function reviewOrg(
  token: string | null,
  orgId: string,
  action: 'approve' | 'reject' | 'request_changes',
  reason?: string,
): Promise<AdminOrg> {
  return (
    await authedFetch(token, `/admin/orgs/${orgId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    })
  ).json()
}

export async function listAdminOrgCampaigns(
  token: string | null,
  orgId: string,
): Promise<AdminOrgCampaign[]> {
  return (await authedFetch(token, `/admin/orgs/${orgId}/campaigns`)).json()
}

export async function getAdminCampaignReport(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<AdminCampaignReport> {
  return (
    await authedFetch(token, `/admin/orgs/${orgId}/campaigns/${campaignId}/report`)
  ).json()
}

export async function exportClaimLinks(
  token: string | null,
  orgId: string,
  campaignId: string,
): Promise<ClaimLinkExport> {
  return (
    await authedFetch(
      token,
      `/admin/orgs/${orgId}/campaigns/${campaignId}/claim-links`,
      { method: 'POST' },
    )
  ).json()
}

// ── Business eligibility (B1) ────────────────────────────────────

export async function listBusinessProfiles(
  token: string | null,
  status?: string,
): Promise<BusinessProfile[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return (await authedFetch(token, `/admin/stores-business${q}`)).json()
}

export async function applyStoreBusiness(
  token: string | null,
  storeId: string,
): Promise<BusinessProfile> {
  return (
    await authedFetch(token, `/admin/stores-business/${storeId}/apply`, {
      method: 'POST',
    })
  ).json()
}

export async function reviewStoreBusiness(
  token: string | null,
  storeId: string,
  action: 'approve' | 'reject' | 'suspend' | 'reinstate',
  reason?: string,
): Promise<BusinessProfile> {
  return (
    await authedFetch(token, `/admin/stores-business/${storeId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    })
  ).json()
}
