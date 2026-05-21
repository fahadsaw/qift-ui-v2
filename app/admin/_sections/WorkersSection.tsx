'use client'

// Phase 7 internal-canary console — Workers / Notification
// Operations section inside the admin System tab.
//
// SCOPE DISCIPLINE
//
// Every button here maps 1:1 to a real endpoint in
// apps/api/src/admin/admin-workers.controller.ts. No fake
// buttons. No controls for features that aren't built. Things
// architecturally prepared but not implemented yet (SMS, email,
// cron, public rollout, AI timing, marketing notifications) are
// surfaced as STATUS ONLY in the readiness matrix at the bottom
// of this view — never as controls.
//
// SAFETY
//
//   - Dry-run buttons stay enabled always (they write nothing).
//   - Real-run buttons disable when the corresponding activation
//     flag is OFF (the backend still gates server-side; the UI
//     just matches the operator's mental model).
//   - The force-clear stale-claim button requires the operator
//     to type a confirmation phrase. It's the only destructive
//     action in the surface.
//   - All actions go through AdminGuard server-side; this UI is
//     a convenience layer, not the authorisation boundary.
//
// The readiness matrix at the bottom answers "what's actually
// real?" so an operator opening this page for the first time
// doesn't conclude that anything beyond what's wired here is
// already shipped.

import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/Card'
import Skeleton from '@/components/Skeleton'
import {
  AdminWorkersApiError,
  cleanupStaleClaims,
  fetchWorkersStatus,
  runDigest,
  runReminders,
  type DigestCadenceOverride,
  type LastActionResult,
  type WorkerStatusSnapshot,
} from '@/lib/adminWorkers'
import { useToast } from '@/lib/toast'

// The literal phrase the operator must type to release the
// destructive force-clear path. Intentionally a small Arabic +
// English combo so an accidental Cmd-A → enter can't fire it.
const FORCE_CLEAR_PHRASE = 'force clear'

export function WorkersSection({
  accessToken,
}: {
  accessToken: string | null
}) {
  const toast = useToast()
  const [status, setStatus] = useState<WorkerStatusSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<LastActionResult | null>(null)
  const [forceClearOpen, setForceClearOpen] = useState(false)

  // Manual-refresh path used by the action handlers + the
  // refresh button. Kept as useCallback so the action handlers
  // close over a stable reference. The initial-load path lives
  // inside its own useEffect with the cancellation-IIFE pattern
  // (avoids the React 19 set-state-in-effect rule that fires when
  // setState lives inside a useCallback called from an effect).
  const loadStatus = useCallback(
    async (manualRefresh: boolean) => {
      if (!accessToken) return
      if (manualRefresh) setRefreshing(true)
      try {
        const snap = await fetchWorkersStatus(accessToken)
        setStatus(snap)
      } catch (err) {
        if (err instanceof AdminWorkersApiError && err.status === 401) {
          toast.show('Session expired — refresh the page.', { tone: 'error' })
        } else {
          toast.show('Failed to load worker status.', { tone: 'error' })
        }
      } finally {
        setLoading(false)
        if (manualRefresh) setRefreshing(false)
      }
    },
    [accessToken, toast],
  )

  // Initial load on mount / on accessToken change. Inlined IIFE
  // with a cancelled-flag — same pattern the other admin sections
  // use to satisfy React 19's set-state-in-effect rule.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const snap = await fetchWorkersStatus(accessToken)
        if (cancelled) return
        setStatus(snap)
      } catch (err) {
        if (cancelled) return
        if (err instanceof AdminWorkersApiError && err.status === 401) {
          toast.show('Session expired — refresh the page.', { tone: 'error' })
        } else {
          toast.show('Failed to load worker status.', { tone: 'error' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, toast])

  // Action handlers — each runs the corresponding endpoint,
  // stores the result for display, refreshes the status snapshot,
  // and surfaces a calm toast. Errors land in the toast lane and
  // also leave the previous result on screen so the operator
  // doesn't lose context.
  const handleRunReminders = async (dryRun: boolean) => {
    if (busy) return
    setBusy('reminders')
    try {
      const result = await runReminders(accessToken, { dryRun })
      setLastResult({ kind: 'reminders', dryRun, result })
      toast.show(
        dryRun
          ? 'Reminder worker dry-run complete.'
          : 'Reminder worker run complete.',
      )
      await loadStatus(false)
    } catch (err) {
      toast.show(failureMessage(err), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const handleRunDigest = async (
    dryRun: boolean,
    cadenceOverride: DigestCadenceOverride,
  ) => {
    if (busy) return
    setBusy('digest')
    try {
      const result = await runDigest(accessToken, { dryRun, cadenceOverride })
      setLastResult({ kind: 'digest', dryRun, cadenceOverride, result })
      toast.show(
        dryRun
          ? 'Digest worker dry-run complete.'
          : 'Digest worker run complete.',
      )
      await loadStatus(false)
    } catch (err) {
      toast.show(failureMessage(err), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const handleCleanup = async (
    dryRun: boolean,
    forceClear: boolean,
  ): Promise<void> => {
    if (busy) return
    setBusy('cleanup')
    try {
      const result = await cleanupStaleClaims(accessToken, {
        dryRun,
        forceClear,
      })
      setLastResult({ kind: 'cleanup', result })
      toast.show(
        dryRun
          ? 'Cleanup preview complete.'
          : forceClear
            ? 'Stale claims force-cleared.'
            : 'Stale claims marked failed.',
      )
      await loadStatus(false)
    } catch (err) {
      toast.show(failureMessage(err), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" rounded="2xl" />

  return (
    <div className="flex flex-col gap-3">
      {/* Section header + manual refresh. The whole point of this
          view is "what's the state right now?" — refresh button
          surfaces that the snapshot is a moment-in-time read. */}
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className="text-sm font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          Phase 7 Workers Console
        </h3>
        <button
          type="button"
          onClick={() => void loadStatus(true)}
          disabled={refreshing || !!busy}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-medium transition-colors disabled:opacity-50"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      {status && <StatusCard status={status} />}

      {status && (
        <ReminderActionCard
          status={status}
          busy={busy === 'reminders'}
          onRun={handleRunReminders}
        />
      )}

      {status && (
        <DigestActionCard
          status={status}
          busy={busy === 'digest'}
          onRun={handleRunDigest}
        />
      )}

      {status && (
        <CleanupActionCard
          status={status}
          busy={busy === 'cleanup'}
          onSafeRecovery={() => handleCleanup(false, false)}
          onDryRun={() => handleCleanup(true, false)}
          onRequestForceClear={() => setForceClearOpen(true)}
        />
      )}

      {lastResult && <LastResultCard result={lastResult} />}

      <ReadinessMatrix />

      {forceClearOpen && (
        <ForceClearDialog
          busy={busy === 'cleanup'}
          onCancel={() => setForceClearOpen(false)}
          onConfirm={async () => {
            await handleCleanup(false, true)
            setForceClearOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ── Status snapshot card ────────────────────────────────────────

function StatusCard({ status }: { status: WorkerStatusSnapshot }) {
  const flags = status.flags
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h4
          className="text-sm font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          Snapshot
        </h4>
        <span
          className="text-[0.65rem] font-mono"
          style={{ color: 'var(--muted)' }}
        >
          {new Date(status.asOf).toLocaleString()}
        </span>
      </div>

      {/* Activation + rollout flag chips. Green = ON, gray = OFF.
          Push has the inverted default (default ON) but renders
          the same way — the kill-switch semantics live in the
          runbook, not in chip colour. */}
      <div className="mt-3">
        <div
          className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          Activation flags
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FlagChip
            label="Reminder firing"
            on={flags.occasionReminderFiringEnabled}
          />
          <FlagChip label="Digest worker" on={flags.digestWorkerEnabled} />
          <FlagChip label="Push delivery" on={flags.pushDeliveryEnabled} />
          <FlagChip
            label="Email delivery"
            on={flags.emailDeliveryEnabled}
            disabledHint="not implemented"
          />
          <FlagChip
            label="SMS delivery"
            on={flags.smsDeliveryEnabled}
            disabledHint="not implemented"
          />
          <FlagChip
            label="Dry-run"
            on={flags.reminderDryRun}
            tone="info"
          />
        </div>
      </div>

      {/* Rollout shape — allowlist + sample-percent. Plain prose
          rendering. No edit affordance (env-var only). */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Row label="Allowlist" mono>
          {flags.reminderAllowlist.length === 0
            ? 'empty — no allowlist gate'
            : `${flags.reminderAllowlist.length} userId${flags.reminderAllowlist.length === 1 ? '' : 's'}`}
        </Row>
        <Row label="Sample percent" mono>
          {flags.reminderUserSamplePercent === 100
            ? '100% (no sample gate)'
            : `${flags.reminderUserSamplePercent}%`}
        </Row>
      </div>

      {/* Queue health. Orange when non-zero — the early-warning
          colour the runbook references. */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MetricTile
          label="Stale claims"
          value={status.queue.staleClaims}
          warn={status.queue.staleClaims > 0}
          hint=">24h old"
        />
        <MetricTile
          label="Pending digest"
          value={status.queue.pendingDigest}
          warn={status.queue.pendingDigest > 50}
          hint="awaiting digest worker"
        />
      </div>

      {/* Last-24h firing breakdown by status. */}
      <div className="mt-4">
        <div
          className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          Last 24h firings
        </div>
        {Object.keys(status.last24h.firingsByStatus).length === 0 ? (
          <div
            className="text-xs"
            style={{ color: 'var(--text-soft)' }}
          >
            No firings recorded.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(status.last24h.firingsByStatus).map(
              ([statusName, count]) => (
                <StatusCountChip
                  key={statusName}
                  status={statusName}
                  count={count}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* Most-recent firing — the operator's "did the worker run
          at all?" canary. Null is the early-warning. */}
      <div className="mt-4">
        <Row label="Most recent firing">
          {status.mostRecentFiring ? (
            <span style={{ color: 'var(--ink)' }}>
              {new Date(status.mostRecentFiring.firedAt).toLocaleString()}{' '}
              <span
                className="ml-1 font-mono text-[0.7rem]"
                style={{ color: 'var(--muted)' }}
              >
                ({status.mostRecentFiring.status})
              </span>
            </span>
          ) : (
            <span
              className="text-xs"
              style={{ color: 'var(--text-soft)' }}
            >
              No firing in the last 7 days — has the worker been
              triggered?
            </span>
          )}
        </Row>
      </div>
    </Card>
  )
}

// ── Action: reminder worker ─────────────────────────────────────

function ReminderActionCard({
  status,
  busy,
  onRun,
}: {
  status: WorkerStatusSnapshot
  busy: boolean
  onRun: (dryRun: boolean) => Promise<void> | void
}) {
  const realEnabled = status.flags.occasionReminderFiringEnabled
  return (
    <Card>
      <ActionHeader title="Reminder worker" />
      <p
        className="mt-1 text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        Reads enabled OccasionReminder rows and dispatches via the
        orchestrator. Real-run honours quiet hours, budgets,
        per-user opt-outs, allowlist + sample-percent. Dry-run logs
        candidates without writing or sending anything.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton
          onClick={() => onRun(true)}
          disabled={busy}
          variant="secondary"
        >
          {busy ? 'Running…' : 'Run dry-run'}
        </ActionButton>
        <ActionButton
          onClick={() => onRun(false)}
          disabled={busy || !realEnabled}
          variant="primary"
          title={
            realEnabled
              ? undefined
              : 'Set QIFT_OCCASION_REMINDER_FIRING_ENABLED=true to enable.'
          }
        >
          {busy ? 'Running…' : 'Run real'}
        </ActionButton>
        {!realEnabled && (
          <Hint>
            Real run disabled — reminder firing flag is off.
          </Hint>
        )}
      </div>
    </Card>
  )
}

// ── Action: digest worker ───────────────────────────────────────

function DigestActionCard({
  status,
  busy,
  onRun,
}: {
  status: WorkerStatusSnapshot
  busy: boolean
  onRun: (
    dryRun: boolean,
    cadenceOverride: DigestCadenceOverride,
  ) => Promise<void> | void
}) {
  const realEnabled = status.flags.digestWorkerEnabled
  const [cadence, setCadence] = useState<DigestCadenceOverride>(null)
  return (
    <Card>
      <ActionHeader title="Digest worker" />
      <p
        className="mt-1 text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        Bundles queued (pushDeliveredAt=null) notifications per user
        into a single calm summary push. Excludes prior digest
        summaries (recursion guard). Weekly users fire only on UTC
        Monday unless overridden.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          className="text-[0.7rem] font-medium"
          style={{ color: 'var(--text-soft)' }}
        >
          Cadence:
        </label>
        <select
          value={cadence ?? ''}
          onChange={(e) =>
            setCadence(
              e.target.value === ''
                ? null
                : (e.target.value as DigestCadenceOverride),
            )
          }
          disabled={busy}
          className="rounded-full border px-3 py-1 text-[0.7rem]"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
          }}
        >
          <option value="">use stored frequency</option>
          <option value="force_daily">force_daily</option>
          <option value="force_weekly">force_weekly</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton
          onClick={() => onRun(true, cadence)}
          disabled={busy}
          variant="secondary"
        >
          {busy ? 'Running…' : 'Run dry-run'}
        </ActionButton>
        <ActionButton
          onClick={() => onRun(false, cadence)}
          disabled={busy || !realEnabled}
          variant="primary"
          title={
            realEnabled
              ? undefined
              : 'Set QIFT_DIGEST_WORKER_ENABLED=true to enable.'
          }
        >
          {busy ? 'Running…' : 'Run real'}
        </ActionButton>
        {!realEnabled && (
          <Hint>Real run disabled — digest worker flag is off.</Hint>
        )}
      </div>
    </Card>
  )
}

// ── Action: stale-claim cleanup ─────────────────────────────────

function CleanupActionCard({
  status,
  busy,
  onDryRun,
  onSafeRecovery,
  onRequestForceClear,
}: {
  status: WorkerStatusSnapshot
  busy: boolean
  onDryRun: () => Promise<void> | void
  onSafeRecovery: () => Promise<void> | void
  onRequestForceClear: () => void
}) {
  const staleCount = status.queue.staleClaims
  return (
    <Card>
      <ActionHeader title="Stale claim cleanup" />
      <p
        className="mt-1 text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        Recovers ReminderFiring rows stuck in claimed status more
        than 24h. Safe recovery transitions them to failed and keeps
        the (reminderId, occurrenceAt) unique constraint engaged —
        no duplicate fire possible, but that occurrence is lost.
        Force-clear deletes the rows so a future worker run can
        re-fire. Use force-clear only with evidence the orchestrator
        never actually ran.
      </p>

      <div
        className="mt-3 rounded-2xl border p-2.5 text-[0.7rem]"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
          color: 'var(--text-soft)',
        }}
      >
        Current stale-claim count:{' '}
        <span
          className="font-semibold"
          style={{
            color: staleCount > 0 ? '#E89B3A' : 'var(--ink)',
          }}
        >
          {staleCount}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton
          onClick={onDryRun}
          disabled={busy}
          variant="secondary"
        >
          {busy ? 'Working…' : 'Preview (dry-run)'}
        </ActionButton>
        <ActionButton
          onClick={onSafeRecovery}
          disabled={busy || staleCount === 0}
          variant="primary"
        >
          {busy ? 'Working…' : 'Safe recovery'}
        </ActionButton>
        <ActionButton
          onClick={onRequestForceClear}
          disabled={busy || staleCount === 0}
          variant="danger"
        >
          Force clear…
        </ActionButton>
        {staleCount === 0 && (
          <Hint>No stale claims — nothing to recover.</Hint>
        )}
      </div>
    </Card>
  )
}

// ── Force-clear confirmation dialog ─────────────────────────────

function ForceClearDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [typed, setTyped] = useState('')
  const matched = typed.trim().toLowerCase() === FORCE_CLEAR_PHRASE
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'color-mix(in srgb, var(--bg-base) 75%, transparent)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-3xl border p-5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h4
          className="text-sm font-bold"
          style={{ color: 'var(--ink)' }}
        >
          Force-clear stale claims
        </h4>
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          This DELETES stale claimed rows. The unique constraint
          releases and the next worker run will re-fire those
          (reminderId, occurrenceAt) pairs. If the orchestrator
          actually ran for any of them before crashing, the user
          will receive a duplicate push. Use only when you have
          evidence the orchestrator never ran (logs show claim
          insert succeeded but no orchestrator-returned line).
        </p>
        <label
          className="mt-3 block text-[0.7rem] font-semibold"
          style={{ color: 'var(--text-soft)' }}
        >
          To confirm, type{' '}
          <span
            className="font-mono"
            style={{ color: 'var(--ink)' }}
          >
            {FORCE_CLEAR_PHRASE}
          </span>{' '}
          below:
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={FORCE_CLEAR_PHRASE}
          className="mt-2 w-full rounded-2xl border px-3 py-2 text-sm"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface)',
            color: 'var(--ink)',
          }}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <ActionButton
            onClick={onCancel}
            disabled={busy}
            variant="secondary"
          >
            Cancel
          </ActionButton>
          <ActionButton
            onClick={() => void onConfirm()}
            disabled={busy || !matched}
            variant="danger"
          >
            {busy ? 'Clearing…' : 'Force clear'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

// ── Last action result ──────────────────────────────────────────

function LastResultCard({ result }: { result: LastActionResult }) {
  return (
    <Card>
      <ActionHeader title="Last action result" />
      <div
        className="mt-2 rounded-2xl border p-3 font-mono text-[0.7rem] leading-relaxed"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
          color: 'var(--text-soft)',
        }}
      >
        {result.kind === 'reminders' && (
          <>
            <ResultLine label="action">
              reminder.run ({result.dryRun ? 'dry-run' : 'real'})
            </ResultLine>
            <ResultLine label="ran">{String(result.result.ran)}</ResultLine>
            {result.result.skippedReason && (
              <ResultLine label="skippedReason">
                {result.result.skippedReason}
              </ResultLine>
            )}
            <ResultLine label="considered">
              {result.result.considered}
            </ResultLine>
            <ResultLine label="inWindow">{result.result.inWindow}</ResultLine>
            <ResultLine label="fired">{result.result.fired}</ResultLine>
            <ResultLine label="digested">{result.result.digested}</ResultLine>
            <ResultLine label="suppressed">
              {result.result.suppressed}
            </ResultLine>
            <ResultLine label="errors">{result.result.errors}</ResultLine>
            <ResultLine label="filteredAllowlist">
              {result.result.filteredAllowlist}
            </ResultLine>
            <ResultLine label="filteredSamplePercent">
              {result.result.filteredSamplePercent}
            </ResultLine>
            <ResultLine label="filteredDryRun">
              {result.result.filteredDryRun}
            </ResultLine>
            <ResultLine label="staleClaims">
              {result.result.staleClaims}
            </ResultLine>
          </>
        )}
        {result.kind === 'digest' && (
          <>
            <ResultLine label="action">
              digest.run ({result.dryRun ? 'dry-run' : 'real'}
              {result.cadenceOverride
                ? `, ${result.cadenceOverride}`
                : ''}
              )
            </ResultLine>
            <ResultLine label="ran">{String(result.result.ran)}</ResultLine>
            {result.result.skippedReason && (
              <ResultLine label="skippedReason">
                {result.result.skippedReason}
              </ResultLine>
            )}
            <ResultLine label="usersConsidered">
              {result.result.usersConsidered}
            </ResultLine>
            <ResultLine label="usersDigested">
              {result.result.usersDigested}
            </ResultLine>
            <ResultLine label="rowsConsumed">
              {result.result.rowsConsumed}
            </ResultLine>
            <ResultLine label="filteredCadence">
              {result.result.filteredCadence}
            </ResultLine>
            <ResultLine label="filteredDryRun">
              {result.result.filteredDryRun}
            </ResultLine>
            <ResultLine label="errors">{result.result.errors}</ResultLine>
          </>
        )}
        {result.kind === 'cleanup' && (
          <>
            <ResultLine label="action">
              cleanupStaleClaims (
              {result.result.dryRun ? 'dry-run' : 'real'}
              {result.result.forceClear ? ', force-clear' : ''})
            </ResultLine>
            <ResultLine label="staleHoursOld">
              {result.result.staleHoursOld}
            </ResultLine>
            <ResultLine label="considered">
              {result.result.considered}
            </ResultLine>
            <ResultLine label="recovered">
              {result.result.recovered}
            </ResultLine>
            <ResultLine label="cleared">{result.result.cleared}</ResultLine>
            <ResultLine label="errors">{result.result.errors}</ResultLine>
            {result.result.sampleIds.length > 0 && (
              <ResultLine label="sampleIds">
                {result.result.sampleIds.join(', ')}
              </ResultLine>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

// ── Phase 7 readiness matrix ────────────────────────────────────

function ReadinessMatrix() {
  return (
    <Card>
      <ActionHeader title="Phase 7 readiness matrix" />
      <p
        className="mt-1 text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        What is real today vs. prepared vs. not built. The actions
        above only wire into items in the first column.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ReadinessColumn
          title="Implemented now"
          tone="ok"
          items={[
            'Notification orchestrator',
            'Per-category budgets + caps',
            'Quiet hours',
            'Per-user preferences UI',
            'Reminder worker',
            'Digest worker',
            'Admin manual triggers',
            'Worker status snapshot',
            'Stale-claim cleanup (safe + force-clear)',
            'Surprise-mask producer helper',
            'Push deep-link allow-list',
          ]}
        />
        <ReadinessColumn
          title="Prepared, not active"
          tone="warn"
          items={[
            'Reminder firing activation flag (default OFF)',
            'Digest worker activation flag (default OFF)',
            'Push kill-switch (default ON)',
            'SMS provider seam (no adapter)',
            'Email provider seam (no adapter)',
            'External-provider abstraction',
            'Sample-percent rollout gates (idle at 100%)',
          ]}
        />
        <ReadinessColumn
          title="Not built yet"
          tone="muted"
          items={[
            'Cron / scheduled worker runs',
            'Real SMS provider integration',
            'Real email provider integration',
            'Public rollout',
            'Marketing notifications',
            'Recommendation notifications',
            'AI notification timing',
            'Full telemetry dashboard',
            'Multi-party gifting notifications',
          ]}
        />
      </div>
    </Card>
  )
}

function ReadinessColumn({
  title,
  tone,
  items,
}: {
  title: string
  tone: 'ok' | 'warn' | 'muted'
  items: string[]
}) {
  const borderColor =
    tone === 'ok'
      ? 'color-mix(in srgb, #4ade80 35%, transparent)'
      : tone === 'warn'
        ? 'color-mix(in srgb, #E89B3A 35%, transparent)'
        : 'var(--border)'
  const headerColor =
    tone === 'ok' ? '#4ade80' : tone === 'warn' ? '#E89B3A' : 'var(--muted)'
  return (
    <div
      className="rounded-2xl border p-3"
      style={{
        borderColor,
        background: 'var(--card-soft)',
      }}
    >
      <div
        className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider"
        style={{ color: headerColor }}
      >
        {title}
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((it) => (
          <li
            key={it}
            className="text-[0.7rem] leading-snug"
            style={{ color: 'var(--text-soft)' }}
          >
            • {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Small atoms ─────────────────────────────────────────────────

function ActionHeader({ title }: { title: string }) {
  return (
    <h4
      className="text-sm font-semibold"
      style={{ color: 'var(--ink)' }}
    >
      {title}
    </h4>
  )
}

function Row({
  label,
  children,
  mono,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <div
      className="rounded-2xl border p-2.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
      }}
    >
      <div
        className="text-[0.6rem] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </div>
      <div
        className={`mt-0.5 text-xs${mono ? ' font-mono' : ''}`}
        style={{ color: 'var(--ink)' }}
      >
        {children}
      </div>
    </div>
  )
}

function MetricTile({
  label,
  value,
  warn,
  hint,
}: {
  label: string
  value: number
  warn?: boolean
  hint?: string
}) {
  return (
    <div
      className="rounded-2xl border p-3"
      style={{
        borderColor: warn
          ? 'color-mix(in srgb, #E89B3A 50%, transparent)'
          : 'var(--border)',
        background: warn
          ? 'color-mix(in srgb, #E89B3A 10%, var(--surface-2))'
          : 'var(--surface-2)',
      }}
    >
      <div
        className="text-[0.6rem] font-semibold uppercase tracking-wider"
        style={{ color: warn ? '#E89B3A' : 'var(--muted)' }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-xl font-bold"
        style={{
          color: warn ? '#E89B3A' : 'var(--ink)',
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          className="mt-0.5 text-[0.6rem]"
          style={{ color: 'var(--muted)' }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

function FlagChip({
  label,
  on,
  disabledHint,
  tone,
}: {
  label: string
  on: boolean
  disabledHint?: string
  tone?: 'info'
}) {
  const palette = on
    ? tone === 'info'
      ? {
          border: 'color-mix(in srgb, #60a5fa 40%, transparent)',
          background: 'color-mix(in srgb, #60a5fa 12%, var(--surface-2))',
          color: '#60a5fa',
        }
      : {
          border: 'color-mix(in srgb, #4ade80 40%, transparent)',
          background: 'color-mix(in srgb, #4ade80 12%, var(--surface-2))',
          color: '#4ade80',
        }
    : {
        border: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-medium"
      style={palette}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: palette.color, opacity: on ? 1 : 0.4 }}
      />
      {label}: {on ? 'on' : 'off'}
      {!on && disabledHint && (
        <span
          className="ml-1 text-[0.6rem]"
          style={{ color: 'var(--muted)' }}
        >
          ({disabledHint})
        </span>
      )}
    </span>
  )
}

function StatusCountChip({
  status,
  count,
}: {
  status: string
  count: number
}) {
  const palette =
    status === 'sent'
      ? { border: '#4ade80', color: '#4ade80' }
      : status === 'failed'
        ? { border: '#ef4444', color: '#ef4444' }
        : status === 'claimed'
          ? { border: '#E89B3A', color: '#E89B3A' }
          : { border: 'var(--border)', color: 'var(--text-soft)' }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-medium"
      style={{
        borderColor: `color-mix(in srgb, ${palette.border} 40%, transparent)`,
        background: 'var(--card-soft)',
        color: palette.color,
      }}
    >
      <span>{status}</span>
      <span
        className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold"
        style={{
          background: `color-mix(in srgb, ${palette.border} 18%, transparent)`,
          color: palette.color,
        }}
      >
        {count}
      </span>
    </span>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant: 'primary' | 'secondary' | 'danger'
  title?: string
}) {
  const palette =
    variant === 'primary'
      ? {
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          color: '#fff',
          border: 'transparent',
        }
      : variant === 'danger'
        ? {
            background: 'color-mix(in srgb, #ef4444 12%, var(--card))',
            color: '#ef4444',
            border: 'color-mix(in srgb, #ef4444 40%, transparent)',
          }
        : {
            background: 'var(--card-soft)',
            color: 'var(--text-soft)',
            border: 'var(--border)',
          }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.7rem] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: palette.background,
        color: palette.color,
        borderColor: palette.border,
      }}
    >
      {children}
    </button>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center text-[0.65rem]"
      style={{ color: 'var(--muted)' }}
    >
      {children}
    </span>
  )
}

function ResultLine({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span style={{ color: 'var(--muted)' }}>{label}</span>{' '}
      <span style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

// ── Error formatting ────────────────────────────────────────────

function failureMessage(err: unknown): string {
  if (err instanceof AdminWorkersApiError) {
    if (err.status === 401) return 'Session expired — refresh the page.'
    if (err.status === 403) return 'Admin access required.'
    return `Request failed (${err.status}).`
  }
  return 'Action failed.'
}
