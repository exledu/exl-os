'use client'

import { useState, useEffect, useMemo } from 'react'
import { Check, Square, Loader2, Search } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface TrackerStudent {
  id: number
  name: string
  lastName: string | null
  yearLevel: { level: number }
}

interface TrackerInvoice {
  id: number
  studentId: number
  year: number | null
  term: number | null
  status: string
  total: number
}

interface TermColumn {
  year: number
  term: number
  label: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = { PAID: 4, SENT: 3, DRAFT: 2, VOID: 1 }

function generateTermColumns(startYear: number, startTerm: number, count: number): TermColumn[] {
  const cols: TermColumn[] = []
  let y = startYear
  let t = startTerm
  for (let i = 0; i < count; i++) {
    cols.push({ year: y, term: t, label: `${y} T${t}` })
    t++
    if (t > 4) { t = 1; y++ }
  }
  return cols
}

function fullName(s: { name: string; lastName: string | null }) {
  return s.lastName ? `${s.name} ${s.lastName}` : s.name
}

// ── Component ────────────────────────────────────────────────────────────────

export function TermTracker() {
  const [students, setStudents]   = useState<TrackerStudent[]>([])
  const [invoices, setInvoices]   = useState<TrackerInvoice[]>([])
  const [loading, setLoading]     = useState(true)
  const [updating, setUpdating]   = useState<number | null>(null) // invoice id being updated
  const [search, setSearch]       = useState('')

  // Load data
  useEffect(() => {
    fetch('/api/invoices/tracker')
      .then(r => r.json())
      .then(data => {
        setStudents(data.students)
        setInvoices(data.invoices)
      })
      .finally(() => setLoading(false))
  }, [])

  // Generate term columns — start from current term, show 8 terms
  const termColumns = useMemo(() => {
    const now = new Date()
    const m = now.getMonth()
    const startTerm = m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4
    return generateTermColumns(now.getFullYear(), startTerm, 8)
  }, [])

  // Build lookup: "studentId-year-term" → best invoice
  const invoiceLookup = useMemo(() => {
    const map = new Map<string, TrackerInvoice>()
    for (const inv of invoices) {
      if (inv.year == null || inv.term == null) continue
      const key = `${inv.studentId}-${inv.year}-${inv.term}`
      const existing = map.get(key)
      if (!existing || (STATUS_PRIORITY[inv.status] ?? 0) > (STATUS_PRIORITY[existing.status] ?? 0)) {
        map.set(key, inv)
      }
    }
    return map
  }, [invoices])

  // Filter students by search
  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      (s.lastName ?? '').toLowerCase().includes(q) ||
      `yr ${s.yearLevel.level}`.includes(q)
    )
  })

  // Mark as paid
  async function markPaid(invoice: TrackerInvoice) {
    if (invoice.status !== 'SENT' || updating) return
    setUpdating(invoice.id)

    // Optimistic update
    setInvoices(prev =>
      prev.map(inv => inv.id === invoice.id ? { ...inv, status: 'PAID' } : inv)
    )

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID' }),
      })
      if (!res.ok) {
        // Revert on error
        setInvoices(prev =>
          prev.map(inv => inv.id === invoice.id ? { ...inv, status: 'SENT' } : inv)
        )
      }
    } catch {
      // Revert on error
      setInvoices(prev =>
        prev.map(inv => inv.id === invoice.id ? { ...inv, status: 'SENT' } : inv)
      )
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
        />
      </div>

      {/* Grid */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-auto max-h-[calc(100vh-180px)]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 bg-[#002F67] px-5 py-3 text-left text-xs font-semibold text-white min-w-[220px]">
                Student
              </th>
              {termColumns.map(col => (
                <th
                  key={col.label}
                  className="bg-[#002F67] px-3 py-3 text-center text-xs font-semibold text-white min-w-[110px]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((student, rowIdx) => (
              <tr
                key={student.id}
                className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
              >
                {/* Student name — sticky left */}
                <td className={`sticky left-0 z-10 px-5 py-3 border-b border-gray-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <p className="text-sm font-medium text-gray-800 truncate">{fullName(student)}</p>
                  <p className="text-[11px] text-gray-500">Yr {student.yearLevel.level}</p>
                </td>

                {/* Term cells */}
                {termColumns.map(col => {
                  const key = `${student.id}-${col.year}-${col.term}`
                  const inv = invoiceLookup.get(key)
                  const status = inv?.status ?? null
                  const isUpdating = inv && updating === inv.id

                  return (
                    <td
                      key={col.label}
                      className="px-3 py-3 border-b border-gray-100"
                    >
                      <div className="flex items-center justify-center">
                        {/* No invoice — grey */}
                        {!status && (
                          <div className="h-9 w-full rounded-lg bg-gray-100" />
                        )}

                        {/* DRAFT — grey with label */}
                        {status === 'DRAFT' && (
                          <div className="flex h-9 w-full items-center justify-center rounded-lg bg-gray-200">
                            <span className="text-[10px] font-medium text-gray-500">DRAFT</span>
                          </div>
                        )}

                        {/* SENT — yellow with checkbox */}
                        {status === 'SENT' && (
                          <button
                            onClick={() => inv && markPaid(inv)}
                            disabled={!!isUpdating}
                            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 transition-all hover:bg-amber-100 hover:border-amber-300 cursor-pointer disabled:cursor-wait"
                          >
                            {isUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                            ) : (
                              <>
                                <Square className="h-4 w-4 text-amber-500" />
                                <span className="text-[10px] font-medium text-amber-700">SENT</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* PAID — green with check */}
                        {status === 'PAID' && (
                          <div className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                            <Check className="h-4 w-4 text-emerald-600" />
                            <span className="text-[10px] font-medium text-emerald-700">PAID</span>
                          </div>
                        )}

                        {/* VOID — red strikethrough */}
                        {status === 'VOID' && (
                          <div className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-red-50 border border-red-200">
                            <span className="text-[10px] font-medium text-red-400 line-through">VOID</span>
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={termColumns.length + 1} className="px-5 py-12 text-center text-sm text-gray-400">
                  No students found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
