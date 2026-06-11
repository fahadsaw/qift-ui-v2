'use client'

// Roster manager (Console PR 4) — mirrors the CF PR 2 backend
// contract:
//
//   * CSV in (file upload or paste), validated server-side. The
//     ADDRESS-COLUMN REJECTION is rendered as a first-class privacy
//     explainer naming the offending columns — the company learns
//     the rule ("never send us addresses"), not just an error.
//   * Per-row skips come back with line numbers + stable reasons;
//     all are rendered so a partial import is never mistaken for a
//     full one. Ignored (unmapped) columns are listed too.
//   * Contacts list (active / archived toggle), two-step archive.
//   * Role-aware: OrgShell already gates the tab to owner/admin; a
//     direct URL hit by another seat gets the backend's 403, mapped
//     to a calm message.

import { useCallback, useEffect, useRef, useState } from 'react'
import PrimaryButton from '@/components/PrimaryButton'
import SecondaryButton from '@/components/SecondaryButton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  archiveContact,
  importRoster,
  listContacts,
  OrgApiError,
  type OrgContact,
  type RosterImportResult,
} from '@/lib/org'
import OrgShell from '../org-shell'

const SKIP_REASONS = new Set([
  'name_missing',
  'channel_missing',
  'phone_invalid',
  'email_invalid',
  'duplicate_in_file',
  'duplicate_existing',
])

const FILE_REJECTIONS = new Set([
  'roster_headers_unusable',
  'roster_empty',
  'roster_too_many_rows',
  'roster_file_too_large',
  'roster_csv_required',
  'org_not_approved',
])

export default function RosterManager({ orgId }: { orgId: string }) {
  const { t } = useI18n()
  const auth = useAuth()
  const token = auth.accessToken
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [contacts, setContacts] = useState<OrgContact[] | null>(null)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [result, setResult] = useState<RosterImportResult | null>(null)
  // The address-column rejection, with the offending column names.
  const [rejectedColumns, setRejectedColumns] = useState<string[] | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null)

  const load = useCallback(
    async (which: 'active' | 'archived') => {
      if (!token) return
      try {
        const res = await listContacts(token, orgId, { status: which })
        setContacts(res.items)
        setError(null)
        setForbidden(false)
      } catch (e) {
        if (e instanceof OrgApiError && e.status === 403) setForbidden(true)
        else setError(t('org.err.generic'))
      }
    },
    [token, orgId, t],
  )

  useEffect(() => {
    // False positive: load() is async — setState happens post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(view)
  }, [load, view])

  const runImport = async (csv: string) => {
    if (busy || !csv.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    setRejectedColumns(null)
    try {
      const res = await importRoster(token, orgId, csv)
      setResult(res)
      setCsvText('')
      setShowPaste(false)
      await load(view)
    } catch (e) {
      if (e instanceof OrgApiError) {
        if (e.code === 'roster_address_columns_forbidden') {
          const cols = (e.body as { columns?: string[] } | null)?.columns ?? []
          setRejectedColumns(cols)
        } else if (e.code && FILE_REJECTIONS.has(e.code)) {
          setError(t(`org.roster.err.${e.code}`))
        } else {
          setError(t('org.err.generic'))
        }
      } else {
        setError(t('org.err.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await runImport(await file.text())
  }

  const onArchive = async (contactId: string) => {
    if (busy) return
    setBusy(true)
    try {
      await archiveContact(token, orgId, contactId)
      await load(view)
    } catch {
      setError(t('org.err.generic'))
    } finally {
      setBusy(false)
      setConfirmArchive(null)
    }
  }

  return (
    <OrgShell orgId={orgId} active="roster">
      {() =>
        forbidden ? (
          <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
            {t('org.roster.forbidden')}
          </p>
        ) : (
          <>
            {/* ── Import ── */}
            <div
              className="rounded-2xl p-5"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('org.roster.import_title')}
              </p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('org.roster.import_help')}
              </p>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--muted-2)' }}>
                {t('org.roster.no_address_note')}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void onFile(e)}
              />
              <div className="mt-4 flex flex-col gap-2">
                <PrimaryButton
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  loading={busy}
                >
                  {t('org.roster.upload_cta')}
                </PrimaryButton>
                {!showPaste ? (
                  <button
                    type="button"
                    onClick={() => setShowPaste(true)}
                    className="text-xs underline-offset-2 hover:underline"
                    style={{ color: 'var(--muted)' }}
                  >
                    {t('org.roster.paste_toggle')}
                  </button>
                ) : (
                  <>
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      rows={5}
                      dir="ltr"
                      placeholder={'name,email,phone\n...'}
                      className="w-full rounded-xl border p-3 font-mono text-xs"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface-2)',
                        color: 'var(--ink)',
                      }}
                    />
                    <SecondaryButton onClick={() => void runImport(csvText)}>
                      {t('org.roster.paste_submit')}
                    </SecondaryButton>
                  </>
                )}
              </div>

              {/* Address-column rejection — the privacy gate, explained. */}
              {rejectedColumns && (
                <div
                  className="mt-4 rounded-xl px-4 py-3 text-sm leading-relaxed"
                  style={{
                    background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                    color: 'var(--text-soft)',
                  }}
                >
                  <p className="font-semibold" style={{ color: 'var(--danger)' }}>
                    {t('org.roster.address_rejected_title')}
                  </p>
                  <p className="mt-1">{t('org.roster.address_rejected_body')}</p>
                  {rejectedColumns.length > 0 && (
                    <p className="mt-2 font-mono text-xs" dir="ltr">
                      {rejectedColumns.join(' · ')}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
              )}

              {/* Import result: counts + every skipped row. */}
              {result && (
                <div
                  className="mt-4 rounded-xl px-4 py-3 text-sm"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                    color: 'var(--text-soft)',
                  }}
                >
                  <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                    {t('org.roster.result_imported')}: {result.imported}
                    {result.skipped.length > 0 &&
                      ` · ${t('org.roster.result_skipped')}: ${result.skipped.length}`}
                  </p>
                  {result.ignoredColumns.length > 0 && (
                    <p className="mt-1 text-xs">
                      {t('org.roster.result_ignored_columns')}:{' '}
                      <span className="font-mono" dir="ltr">
                        {result.ignoredColumns.join(', ')}
                      </span>
                    </p>
                  )}
                  {result.skipped.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                      {result.skipped.map((row) => (
                        <li key={`${row.line}-${row.reason}`}>
                          {t('org.roster.line')} {row.line} —{' '}
                          {SKIP_REASONS.has(row.reason)
                            ? t(`org.roster.skip.${row.reason}`)
                            : row.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* ── Contacts ── */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {t('org.roster.list_title')}
                  {contacts ? ` (${contacts.length})` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setView(view === 'active' ? 'archived' : 'active')}
                  className="text-xs underline-offset-2 hover:underline"
                  style={{ color: 'var(--muted)' }}
                >
                  {view === 'active'
                    ? t('org.roster.show_archived')
                    : t('org.roster.show_active')}
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {contacts === null && (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    {t('org.loading')}
                  </p>
                )}
                {contacts?.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    {view === 'active'
                      ? t('org.roster.empty')
                      : t('org.roster.empty_archived')}
                  </p>
                )}
                {contacts?.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-2xl p-4"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        {c.fullName}
                      </p>
                      <p className="truncate text-[0.7rem]" style={{ color: 'var(--muted)' }} dir="ltr">
                        {[c.phone, c.email].filter(Boolean).join(' · ')}
                        {c.department ? ` · ${c.department}` : ''}
                      </p>
                    </div>
                    {view === 'active' &&
                      (confirmArchive === c.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void onArchive(c.id)}
                            disabled={busy}
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          >
                            {t('org.roster.archive_confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchive(null)}
                            className="text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            {t('org.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmArchive(c.id)}
                          className="text-xs underline-offset-2 hover:underline"
                          style={{ color: 'var(--muted)' }}
                        >
                          {t('org.roster.archive')}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )
      }
    </OrgShell>
  )
}
