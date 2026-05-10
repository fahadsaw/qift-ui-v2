'use client'

// Merchant-facing shipment manager. Opens from the order list when
// the merchant taps "Manage shipping" — they can pick a provider,
// enter the tracking number, and append events as the package
// moves. The receiver/sender see a read-only timeline derived from
// the same Shipment + ShipmentEvent rows on /gifts/:id.
//
// This component handles ONLY the merchant write side. Read-only
// rendering for buyer/receiver lives elsewhere.

import { useEffect, useState } from 'react'
import {
  appendShipmentEvent,
  getOrderShipment,
  upsertOrderShipment,
  type ShippingProvider,
  type StoreShipmentResponse,
} from '@/lib/storesApi'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

const SHIPMENT_STATUSES = [
  'registered',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
] as const
type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export default function OrderShipmentModal({
  giftId,
  accessToken,
  providers,
  onClose,
  onSaved,
}: {
  giftId: string
  accessToken: string
  providers: ShippingProvider[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [data, setData] = useState<StoreShipmentResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [eventStatus, setEventStatus] =
    useState<ShipmentStatus>('in_transit')
  const [eventNote, setEventNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await getOrderShipment(accessToken, giftId)
      if (cancelled) return
      setData(r)
      if (r?.shipment) {
        setProvider(r.shipment.provider)
        setTrackingNumber(r.shipment.trackingNumber ?? '')
      } else if (r?.legacyCarrier && providers.some((p) => p.nameAr === r.legacyCarrier)) {
        const p = providers.find((q) => q.nameAr === r.legacyCarrier)
        if (p) setProvider(p.code)
        if (r.legacyTrackingNumber) setTrackingNumber(r.legacyTrackingNumber)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, giftId, providers])

  const onSaveTracking = async () => {
    if (!provider || saving) return
    setSaving(true)
    try {
      await upsertOrderShipment(accessToken, giftId, {
        provider,
        trackingNumber: trackingNumber.trim() || undefined,
      })
      const refreshed = await getOrderShipment(accessToken, giftId)
      setData(refreshed)
      toast.show(t('shipment.saved_toast'))
      onSaved()
    } catch {
      toast.show(t('shipment.save_failed'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const onAppendEvent = async () => {
    if (!data?.shipment || saving) return
    setSaving(true)
    try {
      const refreshed = await appendShipmentEvent(accessToken, giftId, {
        status: eventStatus,
        note: eventNote.trim() || undefined,
      })
      if (refreshed) setData(refreshed)
      setEventNote('')
      toast.show(t('shipment.event_added_toast'))
      onSaved()
    } catch {
      toast.show(t('shipment.event_failed'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-6 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border p-5 backdrop-blur-md"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-bold tracking-tight"
            style={{ color: 'var(--ink)' }}
          >
            {t('shipment.modal_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[0.7rem] font-medium"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('common.close')}
          </button>
        </div>

        {loading ? (
          <p
            className="mt-3 text-[0.72rem]"
            style={{ color: 'var(--muted)' }}
          >
            {t('common.loading')}
          </p>
        ) : (
          <>
            {/* Provider + tracking number */}
            <div className="mt-3 flex flex-col gap-2">
              <label
                className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--muted)' }}
              >
                {t('shipment.provider_label')}
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-medium"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                <option value="">
                  {t('shipment.provider_placeholder')}
                </option>
                {providers.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.nameAr}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={t('shipment.tracking_placeholder')}
                className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button
                type="button"
                onClick={() => void onSaveTracking()}
                disabled={!provider || saving}
                className="qift-press rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                }}
              >
                {data?.shipment
                  ? t('shipment.update_tracking')
                  : t('shipment.save_tracking')}
              </button>
            </div>

            {/* Event timeline + add new event */}
            {data?.shipment && (
              <div className="mt-5">
                <label
                  className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('shipment.timeline_label')}
                </label>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {data.shipment.events.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-xl border px-3 py-2 text-[0.72rem]"
                      style={{
                        borderColor: 'var(--hairline)',
                        background: 'var(--card-soft)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <strong
                          className="font-bold"
                          style={{ color: 'var(--ink)' }}
                        >
                          {t(`shipment.status_${ev.status}`)}
                        </strong>
                        <span style={{ color: 'var(--muted)' }}>
                          {new Date(ev.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      {ev.note && (
                        <p
                          className="mt-0.5"
                          style={{ color: 'var(--text-soft)' }}
                        >
                          {ev.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-col gap-2">
                  <label
                    className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--muted)' }}
                  >
                    {t('shipment.add_event_label')}
                  </label>
                  <select
                    value={eventStatus}
                    onChange={(e) =>
                      setEventStatus(e.target.value as ShipmentStatus)
                    }
                    className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-medium"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    {SHIPMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`shipment.status_${s}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={eventNote}
                    onChange={(e) => setEventNote(e.target.value)}
                    placeholder={t('shipment.event_note_placeholder')}
                    className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void onAppendEvent()}
                    disabled={saving}
                    className="qift-press rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--card-soft)',
                      color: 'var(--primary)',
                    }}
                  >
                    {t('shipment.add_event_cta')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
