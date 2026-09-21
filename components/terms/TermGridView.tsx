'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Cell {
  id:         number
  classId:    number
  weekNumber: number | null
  date:       string
  cancelled:  boolean
  startTime:  string
  endTime:    string
  staffId:    number | null
  staff:      { id: number; name: string } | null
}
interface Row {
  classId:   number
  subject:   string
  yearLevel: number
  staff:     string
  dayOfWeek: number | null
  startTime: string | null
  endTime:   string | null
  cells:     (Cell | null)[]
}
interface TermData {
  term: {
    id: number; name: string; year: number; termNumber: number; startDate: string; weeks: number
  }
  grid: Row[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function TermGridView({ termId }: { termId: number }) {
  const [data, setData]       = useState<TermData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/terms/${termId}`, { cache: 'no-store' })
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
  }, [termId])

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Loading…</div>
  if (!data)   return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Term not found.</div>

  const { term, grid } = data

  return (
    <div className="space-y-5">
      <Link href="/terms" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#002F67]">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to terms
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-[#002F67]">{term.name}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          W1 begins {new Date(term.startDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {term.weeks} weeks · {grid.length} classes
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5 min-w-[220px]">Class</th>
              {Array.from({ length: term.weeks }, (_, i) => (
                <th key={i} className="px-2 py-2.5 text-center min-w-[88px]">W{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {grid.map(row => (
              <tr key={row.classId} className="border-t border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-gray-100">
                  <Link href={`/classes/${row.classId}`} className="text-[#002F67] font-medium hover:underline text-sm">
                    Yr{row.yearLevel} {row.subject}
                  </Link>
                  <div className="text-[11px] text-gray-500">
                    {row.staff} · {row.dayOfWeek != null ? DAYS[row.dayOfWeek] : '?'} {row.startTime}–{row.endTime}
                  </div>
                </td>
                {row.cells.map((cell, i) => {
                  const effectiveStaff = cell?.staff?.name ?? row.staff
                  const isCover = !!cell?.staff && cell.staff.name !== row.staff
                  return (
                    <td key={i} className="px-2 py-2 text-center border-l border-gray-100 first:border-l-0 align-top">
                      {cell ? (
                        <Link
                          href={`/classes/${row.classId}`}
                          className={`inline-flex flex-col items-center rounded px-1.5 py-1 leading-tight transition-colors ${
                            cell.cancelled
                              ? 'bg-gray-100 text-gray-400 line-through'
                              : 'bg-blue-50 text-[#002F67] hover:bg-blue-100'
                          }`}
                          title={`Session #${cell.id}${cell.cancelled ? ' (cancelled)' : ''}${isCover ? ' — cover' : ''}`}
                        >
                          <span className="text-[11px] tabular-nums">{fmtDay(cell.date)}</span>
                          <span className={`text-[10px] mt-0.5 ${
                            cell.cancelled ? 'text-gray-400' : isCover ? 'text-amber-700 font-medium' : 'text-[#002F67]/60'
                          }`}>
                            {effectiveStaff.split(' ')[0]}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500">
        Blue = scheduled · grey strike-through = cancelled · em-dash = no session (class didn't exist that week or was mid-term added).
        Click a cell or the class name to jump to the class detail page.
      </p>
    </div>
  )
}
