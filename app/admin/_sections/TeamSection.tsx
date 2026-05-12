'use client'

// Team / RBAC management. Per-user ops-role assignment.
//
// Lists admins (User.role === 'admin'), shows their current ops-role
// assignments, and lets an operator with `user.assign_ops_role`
// grant / revoke roles. The server-side OpsRoleGuard is
// authoritative — operators without permission see toast errors
// on mutate. The frontend gating here is a UX shortcut only.

import { useCallback, useEffect, useState } from 'react'
import Skeleton from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { OPS_ROLES } from '@/lib/opsRoles'
import type { AdminUser } from '../_types'

export function TeamSection({
  accessToken,
}: {
  accessToken: string | null
}) {
  const { t } = useI18n()
  const [admins, setAdmins] = useState<AdminUser[] | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const url = new URL(`${API_BASE}/admin/users`)
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled) return
        if (!res.ok) {
          setAdmins([])
          return
        }
        const list = (await res.json()) as AdminUser[]
        setAdmins(list.filter((u) => u.role === 'admin'))
      } catch {
        if (!cancelled) setAdmins([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  if (admins === null)
    return <Skeleton className="h-24 w-full" rounded="2xl" />
  if (admins.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
        {t('admin.team_empty')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        className="text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.team_intro')}
      </p>
      <ul className="flex flex-col gap-2">
        {admins.map((u) => (
          <TeamMemberCard key={u.id} user={u} accessToken={accessToken} />
        ))}
      </ul>
    </div>
  )
}

function TeamMemberCard({
  user,
  accessToken,
}: {
  user: AdminUser
  accessToken: string | null
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [roles, setRoles] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    try {
      const res = await fetch(
        `${API_BASE}/admin/users/${encodeURIComponent(user.id)}/ops-roles`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) {
        setRoles([])
        return
      }
      const list = (await res.json()) as { role: string }[]
      setRoles(list.map((r) => r.role))
    } catch {
      setRoles([])
    }
  }, [accessToken, user.id])

  useEffect(() => {
    // Wrap in IIFE so setState in refresh() doesn't fire
    // synchronously from the effect body.
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  const onToggle = async (role: string, currentlyOn: boolean) => {
    if (!accessToken || busy) return
    setBusy(true)
    try {
      const url = currentlyOn
        ? `${API_BASE}/admin/users/${encodeURIComponent(user.id)}/ops-roles/revoke`
        : `${API_BASE}/admin/users/${encodeURIComponent(user.id)}/ops-roles`
      const res = await fetch(url, {
        method: currentlyOn ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        toast.show(t('admin.action_failed'), { tone: 'error' })
        return
      }
      await refresh()
      toast.show(
        currentlyOn ? t('admin.role_revoked') : t('admin.role_granted'),
      )
    } catch {
      toast.show(t('admin.action_failed'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className="rounded-2xl border p-3 backdrop-blur-md"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <p
        className="text-sm font-bold"
        style={{ color: 'var(--ink)' }}
      >
        @{user.qiftUsername}
      </p>
      <p
        className="mt-0.5 text-xs"
        style={{ color: 'var(--muted)' }}
      >
        {user.fullName ?? '—'}
      </p>
      {roles === null ? (
        <Skeleton className="mt-2 h-6 w-full" rounded="full" />
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {OPS_ROLES.map((r) => {
            const on = roles.includes(r)
            return (
              <button
                key={r}
                type="button"
                onClick={() => void onToggle(r, on)}
                disabled={busy}
                title={t(`admin.ops_role_${r}_desc`)}
                className="rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors disabled:opacity-60"
                style={{
                  borderColor: on ? 'transparent' : 'var(--border)',
                  background: on
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: on ? '#fff' : 'var(--text-soft)',
                }}
              >
                {t(`admin.ops_role_${r}`)}
              </button>
            )
          })}
        </div>
      )}
    </li>
  )
}
