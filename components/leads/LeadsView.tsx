'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RefreshCcw, AlertTriangle } from 'lucide-react'

interface LeadRow {
  id:                  number
  createdAt:           string
  formType:            string
  parentName:          string | null
  studentName:         string | null
  email:               string
  phone:               string | null
  yearLevel:           number | null
  subjects:            string | null
  stage:               string
  owner:               { id: number; name: string } | null
  closedReason:        string | null
  eventCount:          number
  outboundCount:       number
  inboundCount:        number
  firstResponseMs:     number | null
  contactRecencyMs:    number
  engagementRecencyMs: number
}

type Temperature = 'warm' | 'cooling' | 'cold' | 'stale' | 'closed'

function temperatureFor(row: LeadRow): Temperature {
  if (row.stage === 'CLOSED_LOST' || row.stage === 'ENROLLED') return 'closed'
  const days = row.engagementRecencyMs / 86_400_000
  if (days <= 3)  return 'warm'
  if (days <= 7)  return 'cooling'
  if (days <= 14) return 'cold'
  return 'stale'
}

const TEMP_STYLES: Record<Temperature, { pill: string; label: string }> = {
  warm:    { pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Warm' },
  cooling: { pill: 'bg-amber-100 text-amber-800 border-amber-200',        label: 'Cooling' },
  cold:    { pill: 'bg-rose-100 text-rose-800 border-rose-200',           label: 'Cold' },
  stale:   { pill: 'bg-gray-200 text-gray-700 border-gray-300',           label: 'Stale' },
  closed:  { pill: 'bg-slate-100 text-slate-500 border-slate-200',        label: 'Closed' },
}

const STAGE_LABEL: Record<string, string> = {
  NEW:            'New',
  CONTACTED:      'Contacted',
  TRIAL_BOOKED:   'Trial booked',
  TRIAL_ATTENDED: 'Trial sat',
  ENROLLED:       'Enrolled',
  CLOSED_LOST:    'Closed lost',
  WAITLIST:       'Waitlist',
}

function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  const min = ms / 60_000
  if (min < 60)   return `${min.toFixed(0)}m`
  const hr = min / 60
  if (hr < 24)    return `${hr.toFixed(1)}h`
  const d = hr / 24
  return `${d.toFixed(1)}d`
}

function fmtBusinessHoursRough(ms: number | null): string {
  // Not a real business-hours calc — use elapsed hours and mark as ✓/✗ against
  // a 4hr target. Kept intentionally simple for v1.
  if (ms == null) return '—'
  return fmtMs(ms)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function LeadsView() {
  const [leads, setLeads]     = useState<LeadRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [temp, setTemp]       = useState<'all' | Temperature>('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/leads', { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      setLeads(await res.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/leads/ingest?sinceDays=30', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const summary = useMemo(() => {
    if (!leads) return null
    const counts: Record<Temperature, number> = { warm: 0, cooling: 0, cold: 0, stale: 0, closed: 0 }
    let firstRespSum = 0, firstRespN = 0, firstRespWithin4h = 0
    for (const l of leads) {
      counts[temperatureFor(l)]++
      if (l.firstResponseMs != null) {
        firstRespSum += l.firstResponseMs
        firstRespN++
        if (l.firstResponseMs <= 4 * 3600_000) firstRespWithin4h++
      }
    }
    return {
      counts,
      firstResponseAvg: firstRespN ? firstRespSum / firstRespN : null,
      first4h: firstRespN ? (firstRespWithin4h / firstRespN) * 100 : null,
      firstRespN,
      total: leads.length,
    }
  }, [leads])

  const visible = useMemo(() => {
    if (!leads) return []
    const filtered = temp === 'all' ? leads : leads.filter(l => temperatureFor(l) === temp)
    return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [leads, temp])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#002F67]">Leads</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Website contact-form submissions and their reply timelines. Auto-ingested from admin@ Gmail.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#011f42] disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Ingesting…' : 'Refresh from Gmail'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile label="Total"    value={String(summary.total)}                     onClick={() => setTemp('all')}     active={temp === 'all'} />
          <KpiTile label="Warm"     value={String(summary.counts.warm)}    tone="emerald" onClick={() => setTemp('warm')}    active={temp === 'warm'} />
          <KpiTile label="Cooling"  value={String(summary.counts.cooling)} tone="amber"   onClick={() => setTemp('cooling')} active={temp === 'cooling'} />
          <KpiTile label="Cold"     value={String(summary.counts.cold)}    tone="rose"    onClick={() => setTemp('cold')}    active={temp === 'cold'} />
          <KpiTile label="Stale"    value={String(summary.counts.stale)}   tone="slate"   onClick={() => setTemp('stale')}   active={temp === 'stale'} />
          <KpiTile
            label="Avg 1st reply"
            value={fmtMs(summary.firstResponseAvg)}
            sub={summary.first4h != null ? `${summary.first4h.toFixed(0)}% ≤4hr` : undefined}
          />
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Loading leads…</div>
      ) : leads && leads.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">
          No leads ingested yet. Click <strong>Refresh from Gmail</strong> to import recent contact-form submissions.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5">Temp</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Form</th>
                <th className="px-4 py-2.5">Received</th>
                <th className="px-4 py-2.5">Stage</th>
                <th className="px-4 py-2.5 text-right">1st reply</th>
                <th className="px-4 py-2.5 text-right">Their reply</th>
                <th className="px-4 py-2.5 text-right">Since inbound</th>
                <th className="px-4 py-2.5 text-right">Since contact</th>
                <th className="px-4 py-2.5 text-right">Events</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {visible.map(l => {
                const t = temperatureFor(l)
                const style = TEMP_STYLES[t]
                const displayName = l.studentName ?? l.parentName ?? l.email
                // "Their reply" heuristic: time between latest outbound and next inbound
                // — approximated as engagement-recency − contact-recency when there was
                // a more recent outbound. Kept simple until we track pairs explicitly.
                const theirReplyMs = l.inboundCount > 1
                  ? null // we don't have per-turn data yet
                  : null
                return (
                  <tr key={l.id} className="border-t border-gray-100 hover:bg-blue-50/40">
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.pill}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/leads/${l.id}`} className="text-[#002F67] font-medium hover:underline">
                        {displayName}
                      </Link>
                      {l.yearLevel != null && <span className="ml-1 text-xs text-gray-400">Yr{l.yearLevel}</span>}
                      <div className="text-[11px] text-gray-500">{l.email}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 capitalize">{l.formType}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                    <td className="px-4 py-2 text-xs">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                        {STAGE_LABEL[l.stage] ?? l.stage}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${l.firstResponseMs == null ? 'text-rose-700 font-medium' : ''}`}>
                      {fmtBusinessHoursRough(l.firstResponseMs)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                      {theirReplyMs != null ? fmtMs(theirReplyMs) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMs(l.engagementRecencyMs)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmtMs(l.contactRecencyMs)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                      {l.outboundCount}↗ {l.inboundCount}↘
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KpiTile({ label, value, sub, tone, onClick, active }: {
  label: string
  value: string
  sub?: string
  tone?: 'emerald' | 'amber' | 'rose' | 'slate'
  onClick?: () => void
  active?: boolean
}) {
  const toneCls =
    tone === 'emerald' ? 'text-emerald-700'
    : tone === 'amber' ? 'text-amber-700'
    : tone === 'rose'  ? 'text-rose-700'
    : tone === 'slate' ? 'text-slate-600'
    : 'text-[#002F67]'
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition-all ${
        active ? 'border-[#002F67] ring-1 ring-[#002F67]/30' : 'border-gray-200 hover:border-gray-300'
      }`}
      disabled={!onClick}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </button>
  )
}
