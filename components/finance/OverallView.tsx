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

interface TermCell {
  revenue: number
  tutorCost: number
  rent: number
  extras: number
  totalCosts: number
  profit: number
  projected: boolean
}

interface YearTotals {
  year: number
  terms: Record<number, TermCell>
  revenue: number
  tutorCost: number
  rent: number
  extras: number
  totalCosts: number
  profit: number
  margin: number
  anyProjected: boolean
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

export function OverallView() {
  const currentYear = new Date().getFullYear()
  const [startYear, setStartYear] = useState(currentYear)
  const [endYear,   setEndYear]   = useState(currentYear + 2)
  const [forecasts, setForecasts] = useState<Record<string, ForecastResp> | null>(null)
  const [loading,   setLoading]   = useState(true)
  // Bump this when local-storage expense edits should re-run aggregation
  const [expensesVersion] = useState(0)

  const years = useMemo(() => {
    const lo = Math.min(startYear, endYear)
    const hi = Math.max(startYear, endYear)
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  }, [startYear, endYear])

  useEffect(() => {
    setLoading(true)
    const keys = years.flatMap(y => [1, 2, 3, 4].map(t => ({ y, t, k: `${y}-${t}` })))
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
  }, [years])

  const aggregated: YearTotals[] = useMemo(() => {
    if (!forecasts) return []
    return years.map(year => {
      const terms: Record<number, TermCell> = {}
      let rev = 0, tut = 0, rent = 0, ext = 0
      let anyProjected = false
      for (const t of [1, 2, 3, 4]) {
        const f = forecasts[`${year}-${t}`]
        const saved = readSavedExpenses(year, t)
        const cellRevenue   = f?.revenue ?? 0
        const cellTutorCost = f?.tutorCost ?? 0
        const cellRent      = saved.rent ?? 0
        const cellExtras    = (saved.extras ?? []).reduce((s, e) => s + (e.amount || 0), 0)
        const cellTotal     = cellTutorCost + cellRent + cellExtras
        const cellProfit    = cellRevenue - cellTotal
        anyProjected = anyProjected || !!f?.projected
        terms[t] = {
          revenue:    cellRevenue,
          tutorCost:  cellTutorCost,
          rent:       cellRent,
          extras:     cellExtras,
          totalCosts: cellTotal,
          profit:     cellProfit,
          projected:  !!f?.projected,
        }
        rev  += cellRevenue
        tut  += cellTutorCost
        rent += cellRent
        ext  += cellExtras
      }
      const total = tut + rent + ext
      return {
        year,
        terms,
        revenue:    rev,
        tutorCost:  tut,
        rent,
        extras:     ext,
        totalCosts: total,
        profit:     rev - total,
        margin:     rev > 0 ? ((rev - total) / rev) * 100 : 0,
        anyProjected,
      }
    })
  }, [forecasts, years, expensesVersion])

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-gray-500 mt-0.5">
            Year-by-year P&amp;L. Past terms use real invoices + recorded sessions; future terms project from current
            enrolments using HSC-calendar rollover (drop Yr 12 at T4, juniors +1 at T1).
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 block mb-1">From</label>
            <select
              value={startYear}
              onChange={e => setStartYear(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              {Array.from({ length: 7 }, (_, i) => currentYear - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 block mb-1">To</label>
            <select
              value={endYear}
              onChange={e => setEndYear(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              {Array.from({ length: 7 }, (_, i) => currentYear - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
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
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"></th>
                {aggregated.map(y => (
                  <th key={y.year} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <div className="flex items-center justify-end gap-1.5">
                      {y.year}
                      {y.anyProjected && (
                        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700">P</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <Row label="Revenue"        value={y => y.revenue}    bold tone="emerald" rows={aggregated} />
              <SectionHeader label="Less: Cost of services" cols={aggregated.length + 1} />
              <Row label="Tutor costs"    value={y => -y.tutorCost} indent rows={aggregated} />
              <Row label="Rent"           value={y => -y.rent}      indent rows={aggregated} />
              <Row label="Other expenses" value={y => -y.extras}    indent rows={aggregated} />
              <Row label="Total costs"    value={y => -y.totalCosts} bold rows={aggregated} />
              <Row label="Net profit"     value={y => y.profit}     bold tone={pick => pick > 0 ? 'emerald' : 'rose'} rows={aggregated} />
              <Row label="Margin"         value={y => y.margin}     suffix="%" rows={aggregated} />
            </tbody>
          </table>
        </div>
      )}

      {!loading && aggregated.length > 0 && (
        <p className="text-[11px] text-gray-500">
          <span className="inline-block rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700 mr-1">P</span>
          = year includes at least one projected term. Rent and other expenses are pulled from the per-term entries you set in the Term view.
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
  label, value, rows, bold, indent, suffix, tone,
}: {
  label:   string
  value:   (y: YearTotals) => number
  rows:    YearTotals[]
  bold?:   boolean
  indent?: boolean
  suffix?: string
  tone?:   'emerald' | 'rose' | ((v: number) => 'emerald' | 'rose')
}) {
  return (
    <tr className="border-t border-gray-100">
      <td className={`px-4 py-2 ${bold ? 'font-semibold text-[#002F67]' : ''} ${indent ? 'pl-8 text-gray-600' : ''}`}>{label}</td>
      {rows.map(y => {
        const v = value(y)
        const computedTone = typeof tone === 'function' ? tone(v) : tone
        const toneCls =
          computedTone === 'emerald' ? 'text-emerald-700'
          : computedTone === 'rose'  ? 'text-rose-700'
          : ''
        return (
          <td key={y.year} className={`px-4 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${toneCls}`}>
            {suffix === '%'
              ? `${v.toFixed(1)}%`
              : fmtMoney(v)}
          </td>
        )
      })}
    </tr>
  )
}
