'use client'

// Members manager (Console PR 3) — the owner's seat console.
//
// Mirrors the backend contract exactly (CF PR 7a):
//   * add by @qiftUsername with role admin | approver | viewer
//     ('owner' is never grantable — not even offered);
//   * an active seat can't be re-added (409 member_already_seated);
//   * revoke is soft and owner-irrevocable; role changes are
//     revoke-then-re-add, so the UI says exactly that;
//   * a purged member renders with a null username.
//
// The maker–checker note matters commercially: without a seated
// APPROVER, no campaign can ever be approved (the creator is
// SoD-blocked) — so the empty state nudges the owner to seat one.

import { useCallback, useEffect, useState } from 'react'
import Field from '@/components/Field'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  addMember,
  listMembers,
  revokeMember,
  OrgApiError,
  type OrgMember,
  type OrgRole,
} from '@/lib/org'
import OrgShell from '../org-shell'

const GRANTABLE: Exclude<OrgRole, 'owner'>[] = ['admin', 'approver', 'viewer']

export default function MembersManager({ orgId }: { orgId: string }) {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth.accessToken

  const [members, setMembers] = useState<OrgMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<Exclude<OrgRole, 'owner'>>('approver')
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  const errText = useCallback(
    (e: unknown) => {
      const code = e instanceof OrgApiError ? (e.code ?? 'generic') : 'generic'
      const key = `org.members.err.${code}`
      const translated = t(key)
      return translated === key ? t('org.err.generic') : translated
    },
    [t],
  )

  const load = useCallback(async () => {
    if (!token) return
    try {
      setMembers(await listMembers(token, orgId))
      setError(null)
    } catch (e) {
      setError(errText(e))
    }
  }, [token, orgId, errText])

  useEffect(() => {
    // False positive: load() is async — setState happens post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !username.trim()) return
    setBusy(true)
    setError(null)
    try {
      await addMember(token, orgId, { qiftUsername: username.trim(), role })
      setUsername('')
      await load()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  const onRevoke = async (seatId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await revokeMember(token, orgId, seatId)
      await load()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
      setConfirmRevoke(null)
    }
  }

  const hasApprover = members?.some((m) => m.role === 'approver') ?? true

  return (
    <OrgShell orgId={orgId} active="members">
      {() => (
        <>
          {!hasApprover && (
            <div
              className="mb-4 rounded-xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                color: 'var(--text-soft)',
              }}
            >
              {t('org.members.no_approver_note')}
            </div>
          )}

          {/* ── Seats ── */}
          <div className="flex flex-col gap-2">
            {members === null && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {t('org.loading')}
              </p>
            )}
            {members?.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-2xl p-4"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {m.qiftUsername ? `@${m.qiftUsername}` : t('org.members.purged')}
                  </p>
                  <p className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
                    {t(`org.role.${m.role}`)}
                    {' · '}
                    {new Date(m.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {m.role !== 'owner' &&
                  (confirmRevoke === m.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void onRevoke(m.id)}
                        disabled={busy}
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                        style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        {t('org.members.revoke_confirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(null)}
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {t('org.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(m.id)}
                      className="text-xs underline-offset-2 hover:underline"
                      style={{ color: 'var(--muted)' }}
                    >
                      {t('org.members.revoke')}
                    </button>
                  ))}
              </div>
            ))}
          </div>

          {error && (
            <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          {/* ── Add seat ── */}
          <form
            onSubmit={(e) => void onAdd(e)}
            className="mt-6 flex flex-col gap-4 rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {t('org.members.add_title')}
            </p>
            <Field
              label={t('org.members.f_username')}
              requiredMark
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              dirOverride="ltr"
              helper={t('org.members.f_username_help')}
            />
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold tracking-[0.2em]"
                style={{ color: 'var(--muted)' }}
              >
                {t('org.members.f_role')}
              </label>
              <div role="radiogroup" className="grid grid-cols-3 gap-2">
                {GRANTABLE.map((r) => {
                  const active = role === r
                  return (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setRole(r)}
                      className="rounded-xl border px-2 py-2 text-sm font-medium"
                      style={{
                        borderColor: active
                          ? 'color-mix(in srgb, var(--primary) 60%, transparent)'
                          : 'var(--border)',
                        background: active
                          ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                          : 'var(--card)',
                        color: active ? 'var(--ink)' : 'var(--text-soft)',
                      }}
                    >
                      {t(`org.role.${r}`)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-[0.7rem]" style={{ color: 'var(--muted-2)' }}>
                {t(`org.members.role_help.${role}`)}
              </p>
            </div>
            <PrimaryButton type="submit" disabled={busy || !username.trim()} loading={busy}>
              {t('org.members.add_submit')}
            </PrimaryButton>
            <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
              {t('org.members.role_change_note')}
            </p>
          </form>

          <div className="mt-4">
            <SecondaryButton href={`/org/${orgId}`}>{t('org.back')}</SecondaryButton>
          </div>
        </>
      )}
    </OrgShell>
  )
}
