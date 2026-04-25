'use client'

import { useState, useEffect, useMemo } from 'react'
import { DollarSign, Users, Building2, Wallet, TrendingUp, Plus, X } from 'lucide-react'

const TUTOR_RATE = 40

interface ForecastData {
  year: number
  term: number
  tutorHours: number
  sessionCount: number
  revenue: number
  invoiceCount: number
}

interface ExtraExpense {
  id: string
  name: string
  amount: number
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function currentTerm(): number {
  const m = new Date().getMonth()
  if (m < 3) return 1
  if (m < 6) return 2
  if (m < 9) return 3
  return 4
}

export function FinanceView() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [term, setTerm] = useState(() => currentTerm())
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)

  // Editable expenses (persisted per term in localStorage)
  const storageKey = `exl-finance-${year}-T${term}`
  const [rent, setRent] = useState(0)
  const [extras, setExtras] = useState<ExtraExpense[]>([])

  // Load forecast data
  useEffect(() => {
    setLoading(true)
    fetch(`/api/finance/forecast?year=${year}&term=${term}`)
      .then(r => { if (r.ok) return r.json(); throw new Error('Failed to load forecast') })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, term])

  // Load saved expenses for this term
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setRent(parsed.rent ?? 0)
        setExtras(parsed.extras ?? [])
      } catch {
        setRent(0)
        setExtras([])
      }
    } else {
      setRent(0)
      setExtras([])
    }
  }, [storageKey])

  // Persist on change
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(storageKey, JSON.stringify({ rent, extras }))
  }, [storageKey, rent, extras])

  const tutorCost = (data?.tutorHours ?? 0) * TUTOR_RATE
  const extrasTotal = useMemo(() => extras.reduce((s, e) => s + (e.amount || 0), 0), [extras])
  const totalCosts = tutorCost + rent + extrasTotal
  const revenue = data?.revenue ?? 0
  const profit = revenue - totalCosts
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  function addExtra() {
    setExtras(prev => [...prev, { id: crypto.randomUUID(), name: '', amount: 0 }])
  }

  function updateExtra(id: string, patch: Partial<ExtraExpense>) {
    setExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  function removeExtra(id: string) {
    setExtras(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[#002F67]">Financial Forecast</h1>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
          >
            {[year - 1, year, year + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={term}
            onChange={e => setTerm(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
          >
            {[1, 2, 3, 4].map(t => (
              <option key={t} value={t}>Term {t}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Top row — KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Revenue"
              value={fmtMoney(revenue)}
              sub={`${data?.invoiceCount ?? 0} invoice${data?.invoiceCount === 1 ? '' : 's'}`}
              icon={DollarSign}
              tone="emerald"
            />
            <KpiCard
              label="Tutor Costs"
              value={fmtMoney(tutorCost)}
              sub={`${(data?.tutorHours ?? 0).toFixed(1)} hrs × $${TUTOR_RATE}`}
              icon={Users}
              tone="amber"
            />
            <KpiCard
              label="Rent"
              value={fmtMoney(rent)}
              sub="Term cost"
              icon={Building2}
              tone="blue"
            />
            <KpiCard
              label="Other Expenses"
              value={fmtMoney(extrasTotal)}
              sub={`${extras.length} item${extras.length === 1 ? '' : 's'}`}
              icon={Wallet}
              tone="violet"
            />
          </div>

          {/* Profit card — full width, prominent */}
          <div className={`rounded-2xl border p-6 shadow-sm ${
            profit >= 0
              ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/40 border-emerald-200'
              : 'bg-gradient-to-r from-rose-50 to-rose-100/40 border-rose-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  profit >= 0 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
                }`}>
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Profit</p>
                  <p className="text-[11px] text-gray-500">Revenue − all costs</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {fmtMoney(profit)}
                </p>
                <p className="text-xs text-gray-500">{margin.toFixed(1)}% margin</p>
              </div>
            </div>
          </div>

          {/* Editable inputs */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Rent */}
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-gray-800">Rent</h2>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={rent || ''}
                  onChange={e => setRent(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-7 pr-3 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                />
              </div>
            </div>

            {/* Other expenses */}
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-violet-600" />
                  <h2 className="text-sm font-semibold text-gray-800">Other Expenses</h2>
                </div>
                <button
                  onClick={addExtra}
                  className="flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {extras.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No additional expenses. Click "Add" to include one.</p>
                )}
                {extras.map(e => (
                  <div key={e.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={e.name}
                      onChange={ev => updateExtra(e.id, { name: ev.target.value })}
                      placeholder="Name (e.g. Internet, Software)"
                      className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                    />
                    <div className="relative w-32">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                      <input
                        type="number"
                        value={e.amount || ''}
                        onChange={ev => updateExtra(e.id, { amount: Number(ev.target.value) || 0 })}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-2 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                      />
                    </div>
                    <button
                      onClick={() => removeExtra(e.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string
  sub: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'emerald' | 'amber' | 'blue' | 'violet'
}

const TONE_STYLES: Record<KpiCardProps['tone'], string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700',
  amber:   'bg-amber-500/10 text-amber-700',
  blue:    'bg-blue-500/10 text-blue-700',
  violet:  'bg-violet-500/10 text-violet-700',
}

function KpiCard({ label, value, sub, icon: Icon, tone }: KpiCardProps) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONE_STYLES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>
    </div>
  )
}
