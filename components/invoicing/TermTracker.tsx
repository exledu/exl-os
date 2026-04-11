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

  // Build lookup: "studentId-year-term" → aggregate status + list of invoice ids
  // grey = no non-void invoices, yellow = 1+ sent/draft (not all paid), green = all paid
  type CellData = { status: 'none' | 'sent' | 'paid'; invoiceIds: number[] }

  const invoiceLookup = useMemo(() => {
    const map = new Map<string, TrackerInvoice[]>()
    for (const inv of invoices) {
      if (inv.year == null || inv.term == null || inv.status === 'VOID') continue
      const key = `${inv.studentId}-${inv.year}-${inv.term}`
      const arr = map.get(key) ?? []
      arr.push(inv)
      map.set(key, arr)
    }
    // Convert to aggregate status
    const result = new Map<string, CellData>()
    for (const [key, invs] of map) {
      const nonVoid = invs.filter(i => i.status !== 'VOID')
      if (nonVoid.length === 0) {
        result.set(key, { status: 'none', invoiceIds: [] })
      } else if (nonVoid.every(i => i.status === 'PAID')) {
        result.set(key, { status: 'paid', invoiceIds: nonVoid.map(i => i.id) })
      } else {
        result.set(key, { status: 'sent', invoiceIds: nonVoid.filter(i => i.status === 'SENT').map(i => i.id) })
      }
    }
    return result
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

  // Mark all SENT invoices in a cell as paid
  async function markAllPaid(invoiceIds: number[]) {
    if (updating || invoiceIds.length === 0) return
    setUpdating(invoiceIds[0])

    // Optimistic update
    setInvoices(prev =>
      prev.map(inv => invoiceIds.includes(inv.id) ? { ...inv, status: 'PAID' } : inv)
    )

    try {
      const results = await Promise.all(
        invoiceIds.map(id =>
          fetch(`/api/invoices/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'PAID' }),
          })
        )
      )
      if (results.some(r => !r.ok)) {
        // Revert all on any error
        setInvoices(prev =>
          prev.map(inv => invoiceIds.includes(inv.id) ? { ...inv, status: 'SENT' } : inv)
        )
      }
    } catch {
      setInvoices(prev =>
        prev.map(inv => invoiceIds.includes(inv.id) ? { ...inv, status: 'SENT' } : inv)
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
                  const cell = invoiceLookup.get(key)
                  const cellStatus = cell?.status ?? 'none'
                  const isUpdating = cell && cell.invoiceIds.length > 0 && updating === cell.invoiceIds[0]

                  return (
                    <td
                      key={col.label}
                      className="px-3 py-3 border-b border-gray-100"
                    >
                      <div className="flex items-center justify-center">
                        {/* No invoices — grey */}
                        {cellStatus === 'none' && (
                          <div className="h-9 w-full rounded-lg bg-gray-100" />
                        )}

                        {/* 1+ sent but not all paid — yellow with checkbox */}
                        {cellStatus === 'sent' && (
                          <button
                            onClick={() => cell && markAllPaid(cell.invoiceIds)}
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

                        {/* All paid — green with check */}
                        {cellStatus === 'paid' && (
                          <div className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                            <Check className="h-4 w-4 text-emerald-600" />
                            <span className="text-[10px] font-medium text-emerald-700">PAID</span>
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
