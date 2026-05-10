'use client'

// Single-zone editor row. Used by the merchant onboarding flow
// (/store-dashboard/new) AND by the live coverage editor at
// /store-dashboard/coverage. Both writers PATCH the same
// { city, districts? } payload built via buildZonePayload().
import { useI18n } from '@/lib/i18n'
import {
  COUNTRIES_LIST,
  getLocationConfig,
  getTierOptions,
} from '@/lib/locations'
import type { ZoneDraft } from '@/lib/zoneDraft'

export default function ZoneEditor({
  zone,
  canRemove,
  onChange,
  onRemove,
}: {
  zone: ZoneDraft
  canRemove: boolean
  onChange: (next: ZoneDraft) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const config = getLocationConfig(zone.country)
  const tier1Options = config ? getTierOptions(zone.country, 1, {}) : []
  const tier2Options =
    config && zone.region
      ? getTierOptions(zone.country, 2, { tier1: zone.region })
      : []
  const tier3Options =
    config && zone.region && zone.city
      ? getTierOptions(zone.country, 3, {
          tier1: zone.region,
          tier2: zone.city,
        })
      : []

  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border p-3"
      style={{ borderColor: 'var(--border)', background: 'var(--card-soft)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--muted)' }}
        >
          {t('merchant.zone_label')}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[0.7rem] font-medium"
            style={{ color: '#D55B6E' }}
          >
            {t('merchant.remove_zone')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={zone.country}
          onChange={(e) =>
            onChange({
              ...zone,
              country: e.target.value,
              region: '',
              city: '',
              districts: [],
            })
          }
          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          {COUNTRIES_LIST.filter((c) => c.code !== 'OTHER').map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name.ar}
            </option>
          ))}
        </select>
        <select
          value={zone.region}
          onChange={(e) =>
            onChange({
              ...zone,
              region: e.target.value,
              city: '',
              districts: [],
            })
          }
          disabled={tier1Options.length === 0}
          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">{t('merchant.region_placeholder')}</option>
          {tier1Options.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={zone.city}
          onChange={(e) =>
            onChange({ ...zone, city: e.target.value, districts: [] })
          }
          disabled={tier2Options.length === 0}
          className="col-span-2 rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="">{t('merchant.city_placeholder')}</option>
          {tier2Options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {tier3Options.length > 0 && zone.city && (
        <div>
          <span
            className="text-[0.65rem] font-semibold tracking-wide"
            style={{ color: 'var(--muted)' }}
          >
            {t('merchant.districts_optional')}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tier3Options.map((d) => {
              const checked = zone.districts.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...zone,
                      districts: checked
                        ? zone.districts.filter((x) => x !== d)
                        : [...zone.districts, d],
                    })
                  }
                  className="rounded-full border px-2.5 py-1 text-[0.7rem] transition-colors"
                  style={{
                    borderColor: checked ? 'transparent' : 'var(--border)',
                    background: checked ? 'var(--primary)' : 'var(--card)',
                    color: checked ? '#fff' : 'var(--text-soft)',
                    fontWeight: checked ? 600 : 500,
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
