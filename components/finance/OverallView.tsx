'use client'

import { useEffect, useMemo, useState } from 'react'

interface ForecastResp {
  year: number
  term: number
  tutorCost: number
  revenue: number
  projected?: boolean
}

interface ExtraExpense {
  id: string
  name: string
  amount: number
}

interface SavedExpenses {
  rent?: number
  extras?: ExtraExpense[]
}

interface TermColumn {
  year:       number
  term:       number
  revenue:    number
  tutorCost:  number
  rent:       number
  extras:     number
  totalCosts: number
  profit:     number
  margin:     number
  projected:  boolean
}

// We only started using the OS from T2 2026, so T1 2026 has no real data.
// Skip anything strictly before this point in the Overall view.
const DATA_START_YEAR = 2026
const DATA_START_TERM = 2
function isBeforeDataStart(year: number, term: number) {
  return year < DATA_START_YEAR || (year === DATA_START_YEAR && term < DATA_START_TERM)
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function readSavedExpenses(year: number, term: number): SavedExpenses {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(`exl-finance-${year}-T${term}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function compareTerm(a: { year: number; term: number }, b: { year: number; term: number }) {
  return (a.year * 4 + a.term) - (b.year * 4 + b.term)
}

function termsBetween(from: { year: number; term: number }, to: { year: number; term: number }) {
  const lo = compareTerm(from, to) <= 0 ? from : to
  const hi = compareTerm(from, to) <= 0 ? to   : from
  const out: { year: number; term: number }[] = []
  let cur = { ...lo }
  while (compareTerm(cur, hi) <= 0) {
    out.push({ ...cur })
    cur = cur.term < 4 ? { year: cur.year, term: cur.term + 1 } : { year: cur.year + 1, term: 1 }
  }
  return out
}

export function OverallView() {
  const currentYear = new Date().getFullYear()
  const [startYear, setStartYear] = useState(DATA_START_YEAR)
  const [startTerm, setStartTerm] = useState(DATA_START_TERM)
  const [endYear,   setEndYear]   = useState(currentYear + 1)
  const [endTerm,   setEndTerm]   = useState(4)
  const [forecasts, setForecasts] = useState<Record<string, ForecastResp> | null>(null)
  const [loading,   setLoading]   = useState(true)

  const visibleTerms = useMemo(
    () => termsBetween({ year: startYear, term: startTerm }, { year: endYear, term: endTerm })
              .filter(p => !isBeforeDataStart(p.year, p.term)),
    [startYear, startTerm, endYear, endTerm],
  )

  useEffect(() => {
    setLoading(true)
    const keys = visibleTerms.map(p => ({ y: p.year, t: p.term, k: `${p.year}-${p.term}` }))
    Promise.all(keys.map(({ y, t, k }) =>
      fetch(`/api/finance/forecast?year=${y}&term=${t}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => [k, d as ForecastResp | null] as const)
        .catch(() => [k, null] as const)
    )).then(rows => {
      const map: Record<string, ForecastResp> = {}
      for (const [k, d] of rows) if (d) map[k] = d
      setForecasts(map)
      setLoading(false)
    })
  }, [visibleTerms])

  const columns: TermColumn[] = useMemo(() => {
    if (!forecasts) return []
    const raw = visibleTerms.map(({ year, term }) => {
      const f     = forecasts[`${year}-${term}`]
      const saved = readSavedExpenses(year, term)
      return {
        year, term, f, saved,
        savedRent: saved.rent ?? null,
      }
    })
    // Carry forward the most recent recorded rent into projected terms that
    // don't have a per-term entry yet.
    let lastKnownRent = 0
    return raw.map(({ year, term, f, saved, savedRent }) => {
      if (savedRent != null) lastKnownRent = savedRent
      const revenue   = f?.revenue ?? 0
      const tutorCost = f?.tutorCost ?? 0
      const projected = !!f?.projected
      const rent = savedRent != null
        ? savedRent
        : projected ? lastKnownRent : 0
      const extras    = (saved.extras ?? []).reduce((s, e) => s + (e.amount || 0), 0)
      const totalCosts = tutorCost + rent + extras
      const profit     = revenue - totalCosts
      const margin     = revenue > 0 ? (profit / revenue) * 100 : 0
      return {
        year, term, revenue, tutorCost, rent, extras,
        totalCosts, profit, margin,
        projected,
      }
    })
  }, [forecasts, visibleTerms])

  // Totals row across the full visible window
  const totals = useMemo(() => {
    const z = { revenue: 0, tutorCost: 0, rent: 0, extras: 0, totalCosts: 0, profit: 0 }
    columns.forEach(c => {
      z.revenue    += c.revenue
      z.tutorCost  += c.tutorCost
      z.rent       += c.rent
      z.extras     += c.extras
      z.totalCosts += c.totalCosts
      z.profit     += c.profit
    })
    const margin = z.revenue > 0 ? (z.profit / z.revenue) * 100 : 0
    return { ...z, margin }
  }, [columns])

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
          Income statement, term-by-term. Past terms use real invoices + recorded sessions; future terms project from
          current enrolments using the HSC-calendar rollover (drop Yr 12 at T4, juniors +1 at T1).
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 block mb-1">From</label>
            <div className="flex gap-1">
              <select
                value={startYear}
                onChange={e => setStartYear(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              >
                {Array.from({ length: 7 }, (_, i) => currentYear - 2 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={startTerm}
                onChange={e => setStartTerm(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              >
                {[1, 2, 3, 4].map(t => (
                  <option key={t} value={t}>T{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 block mb-1">To</label>
            <div className="flex gap-1">
              <select
                value={endYear}
                onChange={e => setEndYear(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              >
                {Array.from({ length: 7 }, (_, i) => currentYear - 2 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={endTerm}
                onChange={e => setEndTerm(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              >
                {[1, 2, 3, 4].map(t => (
                  <option key={t} value={t}>T{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"></th>
                {columns.map(c => (
                  <th key={`${c.year}-${c.term}`}
                      className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <span>{c.year}T{c.term}</span>
                      {c.projected && (
                        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700">P</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[#002F67] whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <Row label="Revenue"        pick={c => c.revenue}    bold tone="emerald" cols={columns} totalValue={totals.revenue} />
              <SectionHeader label="Less: Cost of services" cols={columns.length + 2} />
              <Row label="Tutor costs"    pick={c => -c.tutorCost} indent cols={columns} totalValue={-totals.tutorCost} />
              <Row label="Rent"           pick={c => -c.rent}      indent cols={columns} totalValue={-totals.rent} />
              <Row label="Other expenses" pick={c => -c.extras}    indent cols={columns} totalValue={-totals.extras} />
              <Row label="Total costs"    pick={c => -c.totalCosts} bold cols={columns} totalValue={-totals.totalCosts} />
              <Row label="Net profit"     pick={c => c.profit}     bold tone={v => v > 0 ? 'emerald' : 'rose'} cols={columns} totalValue={totals.profit} />
              <Row label="Margin"         pick={c => c.margin}     suffix="%" cols={columns} totalValue={totals.margin} />
            </tbody>
          </table>
        </div>
      )}

      {!loading && columns.length > 0 && (
        <p className="text-[11px] text-gray-500">
          <span className="inline-block rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700 mr-1">P</span>
          = projected term. Rent and other expenses are pulled from the per-term entries you set in the Term view.
        </p>
      )}
    </div>
  )
}

// ── Row helpers ────────────────────────────────────────────────────────────

function SectionHeader({ label, cols }: { label: string; cols: number }) {
  return (
    <tr className="border-t border-gray-100">
      <td colSpan={cols} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</td>
    </tr>
  )
}

function Row({
  label, pick, cols, totalValue, bold, indent, suffix, tone,
}: {
  label:      string
  pick:       (c: TermColumn) => number
  cols:       TermColumn[]
  totalValue: number
  bold?:      boolean
  indent?:    boolean
  suffix?:    string
  tone?:      'emerald' | 'rose' | ((v: number) => 'emerald' | 'rose')
}) {
  const fmt = (v: number) => suffix === '%' ? `${v.toFixed(1)}%` : fmtMoney(v)
  const totalTone = typeof tone === 'function' ? tone(totalValue) : tone
  const totalToneCls =
    totalTone === 'emerald' ? 'text-emerald-700'
    : totalTone === 'rose'  ? 'text-rose-700'
    : ''
  return (
    <tr className="border-t border-gray-100">
      <td className={`sticky left-0 z-10 bg-white px-4 py-2 ${bold ? 'font-semibold text-[#002F67]' : ''} ${indent ? 'pl-8 text-gray-600' : ''}`}>
        {label}
      </td>
      {cols.map(c => {
        const v = pick(c)
        const cellTone = typeof tone === 'function' ? tone(v) : tone
        const toneCls =
          cellTone === 'emerald' ? 'text-emerald-700'
          : cellTone === 'rose'  ? 'text-rose-700'
          : ''
        return (
          <td key={`${c.year}-${c.term}`} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''} ${toneCls}`}>
            {fmt(v)}
          </td>
        )
      })}
      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold border-l border-gray-200 ${totalToneCls}`}>
        {fmt(totalValue)}
      </td>
    </tr>
  )
}
