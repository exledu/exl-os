'use client'

import { useEffect, useState } from 'react'
import {
  CalendarDays,
  Users,
  FlaskConical,
  ShieldAlert,
  Receipt,
} from 'lucide-react'

interface TermPayment {
  year: number
  term: number
  total: number
  paid: number
  sent: number
  draft: number
}

interface KpiData {
  todaysClasses: number
  studentsToday: number
  trialsToday: number
  unresolvedIssues: number
  seatsAvailable: number
  totalClasses: number
  atRiskStudents: number
  termPayments: TermPayment[]
}

const KPIS: {
  key: keyof KpiData
  label: string
  icon: React.ElementType
  colour: string       // icon bg
  accent: string       // text highlight when non-zero
  format?: (v: number, d: KpiData) => string
}[] = [
  {
    key: 'todaysClasses',
    label: "Today's Classes",
    icon: CalendarDays,
    colour: 'bg-blue-50 text-[#002F67]',
    accent: 'text-[#002F67]',
  },
  {
    key: 'studentsToday',
    label: 'Students Today',
    icon: Users,
    colour: 'bg-teal-50 text-teal-700',
    accent: 'text-teal-700',
  },
  {
    key: 'trialsToday',
    label: 'Trials Today',
    icon: FlaskConical,
    colour: 'bg-purple-50 text-[#704471]',
    accent: 'text-[#704471]',
  },
  {
    key: 'atRiskStudents',
    label: 'At-Risk Students',
    icon: ShieldAlert,
    colour: 'bg-rose-50 text-rose-700',
    accent: 'text-rose-700',
  },
]

export function KpiStrip() {
  const [data, setData] = useState<KpiData | null>(null)

  useEffect(() => {
    // Send the browser's local date so the server matches @db.Date correctly
    const localToday = new Date().toISOString().slice(0, 10)
    fetch(`/api/dashboard/kpis?today=${localToday}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
  }, [])

  if (!data) {
    // Skeleton
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm animate-pulse">
            <div className="h-4 w-16 bg-gray-100 rounded mb-3" />
            <div className="h-7 w-10 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {KPIS.map(({ key, label, icon: Icon, colour, accent, format }) => {
        const value = data[key]
        const display = format ? format(value, data) : String(value)

        return (
          <div
            key={key}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`rounded-lg p-1.5 ${colour}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-tight">
                {label}
              </span>
            </div>
            <p className={`text-2xl font-bold ${value > 0 ? accent : 'text-gray-300'}`}>
              {display}
            </p>
          </div>
        )
      })}

      {/* Term Payment KPI cards */}
      {data.termPayments.map(tp => (
        <div
          key={`${tp.year}-${tp.term}`}
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg p-1.5 bg-indigo-50 text-indigo-700">
              <Receipt className="h-3.5 w-3.5" />
            </div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-tight">
              {tp.year} T{tp.term}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Green circles = PAID */}
            {Array.from({ length: tp.paid }).map((_, i) => (
              <div key={`p${i}`} className="h-5 w-5 rounded-full bg-emerald-400" />
            ))}
            {/* Yellow circles = SENT */}
            {Array.from({ length: tp.sent }).map((_, i) => (
              <div key={`s${i}`} className="h-5 w-5 rounded-full bg-amber-300" />
            ))}
            {/* Grey circles = DRAFT */}
            {Array.from({ length: tp.draft }).map((_, i) => (
              <div key={`d${i}`} className="h-5 w-5 rounded-full bg-gray-200" />
            ))}
          </div>
        </div>
      ))}

      {/* Placeholder cards if fewer than 2 terms */}
      {data.termPayments.length === 0 && Array.from({ length: 2 }).map((_, i) => (
        <div key={`empty-${i}`} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg p-1.5 bg-indigo-50 text-indigo-700">
              <Receipt className="h-3.5 w-3.5" />
            </div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-tight">
              Invoices
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-300">—</p>
        </div>
      ))}
      {data.termPayments.length === 1 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg p-1.5 bg-indigo-50 text-indigo-700">
              <Receipt className="h-3.5 w-3.5" />
            </div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-tight">
              Invoices
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-300">—</p>
        </div>
      )}
    </div>
  )
}
