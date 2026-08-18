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
  theirReplyMs:        number | null
  waitingForReplyMs:   number | null
  contactRecencyMs:    number
  engagementRecencyMs: number
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

const STAGE_OPTIONS = ['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'ENROLLED', 'WAITLIST', 'CLOSED_LOST'] as const

const STAGE_PILL: Record<string, string> = {
  NEW:            'bg-gray-100 text-gray-700 hover:bg-gray-200',
  CONTACTED:      'bg-blue-100 text-blue-800 hover:bg-blue-200',
  TRIAL_BOOKED:   'bg-violet-100 text-violet-800 hover:bg-violet-200',
  TRIAL_ATTENDED: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
  ENROLLED:       'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  WAITLIST:       'bg-amber-100 text-amber-800 hover:bg-amber-200',
  CLOSED_LOST:    'bg-slate-100 text-slate-600 hover:bg-slate-200',
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
    let firstRespSum = 0, firstRespN = 0, firstRespWithin4h = 0, noReply = 0, closed = 0
    for (const l of leads) {
      if (l.stage === 'CLOSED_LOST' || l.stage === 'ENROLLED') closed++
      if (l.firstResponseMs != null) {
        firstRespSum += l.firstResponseMs
        firstRespN++
        if (l.firstResponseMs <= 4 * 3600_000) firstRespWithin4h++
      } else if (l.stage !== 'CLOSED_LOST') {
        noReply++
      }
    }
    return {
      total: leads.length,
      open: leads.length - closed,
      noReply,
      firstResponseAvg: firstRespN ? firstRespSum / firstRespN : null,
      first4h: firstRespN ? (firstRespWithin4h / firstRespN) * 100 : null,
    }
  }, [leads])

  const OPEN_STAGES   = new Set(['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED'])
  const CLOSED_STAGES = new Set(['ENROLLED', 'CLOSED_LOST', 'WAITLIST'])

  const { openLeads, closedLeads } = useMemo(() => {
    const sorted = leads
      ? [...leads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : []
    return {
      openLeads:   sorted.filter(l => OPEN_STAGES.has(l.stage)),
      closedLeads: sorted.filter(l => CLOSED_STAGES.has(l.stage)),
    }
  }, [leads])

  const onStageChange = (id: number, next: string) =>
    setLeads(prev => prev?.map(x => x.id === id ? { ...x, stage: next } : x) ?? prev)

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="Total leads" value={String(summary.total)} />
          <KpiTile label="Open" value={String(summary.open)} />
          <KpiTile
            label="Avg 1st reply"
            value={fmtMs(summary.firstResponseAvg)}
            sub={summary.first4h != null ? `${summary.first4h.toFixed(0)}% ≤4hr` : undefined}
          />
          <KpiTile
            label="No reply sent"
            value={String(summary.noReply)}
            tone={summary.noReply > 0 ? 'rose' : undefined}
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
        <>
          <LeadsTable
            title="Open"
            subtitle="New, Contacted, Trial booked, Trial sat"
            rows={openLeads}
            onStageChange={onStageChange}
          />
          <LeadsTable
            title="Closed"
            subtitle="Enrolled, Waitlist, Closed lost"
            rows={closedLeads}
            onStageChange={onStageChange}
          />
        </>
      )}
    </div>
  )
}

function LeadsTable({ title, subtitle, rows, onStageChange }: {
  title:    string
  subtitle: string
  rows:     LeadRow[]
  onStageChange: (id: number, next: string) => void
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-[#002F67]">{title}</h2>
        <span className="text-xs text-gray-500">{rows.length} · {subtitle}</span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-400 italic">
          Nothing here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
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
              {rows.map(l => {
                const displayName = l.studentName ?? l.parentName ?? l.email
                return (
                  <tr key={l.id} className="border-t border-gray-100 hover:bg-blue-50/40">
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
                      <StageCell leadId={l.id} stage={l.stage} onChange={next => onStageChange(l.id, next)} />
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${l.firstResponseMs == null ? 'text-rose-700 font-medium' : ''}`}>
                      {fmtBusinessHoursRough(l.firstResponseMs)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {l.theirReplyMs != null ? (
                        <span>{fmtMs(l.theirReplyMs)}</span>
                      ) : l.waitingForReplyMs != null ? (
                        <span className="text-gray-400 italic">waiting {fmtMs(l.waitingForReplyMs)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
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
    </section>
  )
}

function StageCell({ leadId, stage, onChange }: {
  leadId: number
  stage: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function pick(next: string) {
    setOpen(false)
    if (next === stage) return
    const prev = stage
    onChange(next)  // optimistic
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      onChange(prev)  // revert on failure
      alert('Failed to update stage')
    } finally {
      setSaving(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = () => setOpen(false)
    // defer so the opening click doesn't immediately close
    const t = window.setTimeout(() => document.addEventListener('click', onDoc), 0)
    return () => { window.clearTimeout(t); document.removeEventListener('click', onDoc) }
  }, [open])

  return (
    <span className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${STAGE_PILL[stage] ?? STAGE_PILL.NEW} disabled:opacity-50`}
      >
        {STAGE_LABEL[stage] ?? stage}
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 opacity-60">
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 0 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {STAGE_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => pick(opt)}
              className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${opt === stage ? 'font-semibold text-[#002F67]' : 'text-gray-700'}`}
            >
              {STAGE_LABEL[opt]}
            </button>
          ))}
        </div>
      )}
    </span>
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
