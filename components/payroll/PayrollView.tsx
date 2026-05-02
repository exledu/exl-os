'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, DollarSign, Clock, Users } from 'lucide-react'

interface SessionLine {
  sessionId: number
  date:      string
  startTime: string
  endTime:   string
  className: string
  students:  number
  hours:     number
  rate:      number
  pay:       number
  isCover:   boolean
}
interface TutorBreakdown {
  staffId:    number | null
  name:       string
  sessions:   SessionLine[]
  totalHours: number
  totalPay:   number
}
interface PayrollData {
  start:        string
  end:          string
  sessionCount: number
  totalHours:   number
  totalPay:     number
  breakdown:    TutorBreakdown[]
}

// Anchor: 2026-04-20 (Mon). Each fortnight is 14 days starting from anchor.
const ANCHOR_UTC = Date.UTC(2026, 3, 20) // April = month 3

function fmtMoney(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtShortDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fortnightStartFor(date: Date): string {
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const diffDays = Math.floor((today - ANCHOR_UTC) / 86_400_000)
  const periodsBack = Math.floor(diffDays / 14)
  const start = new Date(ANCHOR_UTC + periodsBack * 14 * 86_400_000)
  return start.toISOString().slice(0, 10)
}

function buildFortnightOptions(currentStart: string, count = 12): string[] {
  // Build current + previous (count-1) fortnights, plus next 1 (so admin can preview)
  const [y, m, d] = currentStart.split('-').map(Number)
  const baseUtc = Date.UTC(y, m - 1, d)
  const opts: string[] = []
  for (let i = -1; i < count; i++) {
    const t = baseUtc - i * 14 * 86_400_000
    opts.push(new Date(t).toISOString().slice(0, 10))
  }
  // Sorted desc (most recent first), already is since we went i=-1 (future) first
  return opts
}

function fortnightLabel(start: string): string {
  const [y, m, d] = start.split('-').map(Number)
  const startUtc = Date.UTC(y, m - 1, d)
  const endUtc = startUtc + 13 * 86_400_000
  const startStr = new Date(startUtc).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const endStr   = new Date(endUtc).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

export function PayrollView() {
  const [start, setStart] = useState<string>(() => fortnightStartFor(new Date()))
  const [data, setData] = useState<PayrollData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number | string>>(new Set())

  const options = useMemo(() => buildFortnightOptions(fortnightStartFor(new Date())), [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/payroll?start=${start}`)
      .then(r => { if (r.ok) return r.json(); throw new Error() })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [start])

  function toggle(key: number | string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#002F67]">Payroll</h1>
          <p className="text-sm text-gray-500">Fortnightly tutor compensation. Rate scales with class size: $40/hr (1–2 students) up to $48/hr (6+ students, capped).</p>
        </div>
        <select
          value={start}
          onChange={e => setStart(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
        >
          {options.map(s => (
            <option key={s} value={s}>{fortnightLabel(s)}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="rounded-xl bg-white border border-gray-100 p-6 text-sm text-gray-500">Loading…</div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard icon={DollarSign} label="Total Pay" value={fmtMoney(data.totalPay)} tone="emerald" />
            <KpiCard icon={Clock}      label="Total Hours" value={`${data.totalHours.toFixed(1)} hrs`} tone="blue" />
            <KpiCard icon={Users}      label="Sessions" value={String(data.sessionCount)} tone="violet" />
          </div>

          <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 font-semibold">
              {fmtDate(data.start)} → {fmtDate(data.end)}
            </div>

            {data.breakdown.length === 0 && (
              <div className="p-6 text-sm text-gray-500">No sessions in this fortnight.</div>
            )}

            <div className="divide-y divide-gray-100">
              {data.breakdown.map(t => {
                const key = t.staffId ?? '__none__'
                const isOpen = expanded.has(key)
                return (
                  <div key={key}>
                    <button
                      onClick={() => toggle(key)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-gray-400" />
                        : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="flex-1 font-medium text-gray-900">{t.name}</span>
                      <span className="text-xs text-gray-500 tabular-nums">{t.sessions.length} sessions</span>
                      <span className="text-xs text-gray-500 tabular-nums w-20 text-right">{t.totalHours.toFixed(1)} hrs</span>
                      <span className="font-semibold text-[#002F67] tabular-nums w-24 text-right">{fmtMoney(t.totalPay)}</span>
                    </button>

                    {isOpen && (
                      <div className="bg-gray-50/60 px-4 py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 text-left">
                              <th className="py-1 font-medium">Date</th>
                              <th className="py-1 font-medium">Time</th>
                              <th className="py-1 font-medium">Class</th>
                              <th className="py-1 font-medium text-right">Students</th>
                              <th className="py-1 font-medium text-right">Hrs</th>
                              <th className="py-1 font-medium text-right">Rate</th>
                              <th className="py-1 font-medium text-right">Pay</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-700">
                            {t.sessions.map(s => (
                              <tr key={s.sessionId} className="border-t border-gray-200/70">
                                <td className="py-1.5">{fmtShortDate(s.date)}</td>
                                <td className="py-1.5 tabular-nums">{s.startTime}–{s.endTime}</td>
                                <td className="py-1.5">
                                  {s.className}
                                  {s.isCover && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">cover</span>}
                                </td>
                                <td className="py-1.5 tabular-nums text-right">{s.students}</td>
                                <td className="py-1.5 tabular-nums text-right">{s.hours.toFixed(1)}</td>
                                <td className="py-1.5 tabular-nums text-right">${s.rate}/hr</td>
                                <td className="py-1.5 tabular-nums text-right font-medium">{fmtMoney(s.pay)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone: 'emerald' | 'blue' | 'violet'
}) {
  const toneCls = {
    emerald: 'bg-emerald-500/10 text-emerald-700',
    blue:    'bg-blue-500/10 text-blue-700',
    violet:  'bg-violet-500/10 text-violet-700',
  }[tone]
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-4 flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-[#002F67]">{value}</p>
      </div>
    </div>
  )
}
