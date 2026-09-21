'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Calendar, X } from 'lucide-react'

interface TermRow {
  id:         number
  name:       string
  year:       number
  termNumber: number
  startDate:  string
  weeks:      number
  createdAt:  string
  _count:     { sessions: number }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TermsView() {
  const [terms, setTerms]         = useState<TermRow[] | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/terms', { cache: 'no-store' })
      if (res.ok) setTerms(await res.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#002F67]">Terms</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Shared 10-week calendar. Creating a term seeds W1–W10 sessions for every non-archived recurring class.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#011f42]"
        >
          <Plus className="h-3.5 w-3.5" />
          New term
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Loading…</div>
      ) : terms && terms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No terms yet. Click <strong>New term</strong> to create your first one — pick the Monday of Week 1 and the system will seed sessions for every class across the next 10 weeks.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {terms?.map(t => (
            <Link
              key={t.id}
              href={`/terms/${t.id}`}
              className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-[#002F67]/30 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold text-[#002F67]">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    W1 starts {fmtDate(t.startDate)} · {t.weeks} weeks
                  </div>
                </div>
                <Calendar className="h-4 w-4 text-gray-400 group-hover:text-[#002F67]" />
              </div>
              <div className="mt-3 text-xs text-gray-500 tabular-nums">
                {t._count.sessions} session{t._count.sessions === 1 ? '' : 's'}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTermModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
          onError={setError}
        />
      )}
    </div>
  )
}

interface ClassOption {
  id: number
  subject: { name: string }
  yearLevel: { level: number }
  staff: { id: number; name: string }
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CreateTermModal({ onClose, onCreated, onError }: {
  onClose: () => void
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const now = new Date()
  const [year, setYear]             = useState(now.getFullYear())
  const [termNumber, setTermNumber] = useState<number>(4)
  const [startDate, setStartDate]   = useState<string>('')
  const [weeks, setWeeks]           = useState<number>(10)
  const [saving, setSaving]         = useState(false)
  const [classes, setClasses]       = useState<ClassOption[]>([])
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  const [increment, setIncrement]   = useState<Set<number>>(new Set())
  const [loadingClasses, setLoadingClasses] = useState(true)

  const name = `T${termNumber} ${year}`

  // Fetch all non-archived recurring classes; default all to selected.
  useEffect(() => {
    (async () => {
      setLoadingClasses(true)
      try {
        const res = await fetch('/api/classes?archived=false', { cache: 'no-store' })
        if (res.ok) {
          const all = (await res.json()) as ClassOption[]
          const recurring = all.filter(c => c.dayOfWeek != null && c.startTime && c.endTime)
          // Sort by yearLevel desc then subject
          recurring.sort((a, b) =>
            (b.yearLevel.level - a.yearLevel.level) ||
            a.subject.name.localeCompare(b.subject.name)
          )
          setClasses(recurring)
          setSelected(new Set(recurring.map(c => c.id)))
        }
      } finally { setLoadingClasses(false) }
    })()
  }, [])

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(prev => prev.size === classes.length ? new Set() : new Set(classes.map(c => c.id)))
  }
  function toggleIncrement(id: number) {
    setIncrement(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, year, termNumber, startDate, weeks,
          classIds:          Array.from(selected),
          incrementYearIds:  Array.from(increment).filter(id => selected.has(id)),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        onError(j.error ?? 'Failed to create term')
      } else {
        onCreated()
      }
    } finally {
      setSaving(false)
    }
  }

  const allSelected = selected.size === classes.length && classes.length > 0
  const noneSelected = selected.size === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-lg max-h-[90vh] rounded-2xl bg-white p-5 shadow-xl flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#002F67]">New term</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">Year</span>
              <input
                type="number"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">Term #</span>
              <select
                value={termNumber}
                onChange={e => setTermNumber(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">W1 start (Monday)</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">Weeks</span>
              <input
                type="number"
                value={weeks}
                onChange={e => setWeeks(Number(e.target.value))}
                min={1} max={20}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </label>
          </div>
        </div>

        {/* Class picker */}
        <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-200 text-xs">
            <span className="font-semibold text-gray-600 uppercase tracking-wide">Include classes</span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-[#002F67] hover:underline"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="overflow-y-auto max-h-64">
            {loadingClasses ? (
              <div className="p-4 text-xs text-gray-400 text-center">Loading…</div>
            ) : classes.length === 0 ? (
              <div className="p-4 text-xs text-gray-400 text-center">No recurring classes found.</div>
            ) : (
              classes.map(c => {
                const canIncrement = c.yearLevel.level < 12
                const incrementActive = increment.has(c.id) && selected.has(c.id)
                return (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 border-t first:border-t-0 border-gray-100 text-sm hover:bg-blue-50/40">
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="rounded"
                      />
                      <span className="flex-1 flex items-center gap-2 min-w-0">
                        <span className={`truncate ${incrementActive ? 'text-emerald-800 font-medium' : 'text-gray-800'}`}>
                          Yr{c.yearLevel.level}
                          {incrementActive && <> → <span className="font-semibold">Yr{c.yearLevel.level + 1}</span></>}
                          {' '}{c.subject.name}
                        </span>
                        <span className="text-xs text-gray-400 truncate">
                          {c.staff.name} · {c.dayOfWeek != null ? DAYS[c.dayOfWeek] : '?'} {c.startTime}
                        </span>
                      </span>
                    </label>
                    {canIncrement && (
                      <button
                        type="button"
                        onClick={() => toggleIncrement(c.id)}
                        disabled={!selected.has(c.id)}
                        title={`Bump to Yr${c.yearLevel.level + 1} before seeding`}
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border transition-colors ${
                          incrementActive
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-30'
                        }`}
                      >
                        {incrementActive ? '↗ +1yr' : '+1yr'}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <div className="bg-gray-50 border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-500">
            {selected.size} of {classes.length} classes selected
          </div>
        </div>

        <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2 text-xs text-[#002F67]/80 mt-3">
          Will create <strong>{name}</strong> and seed <strong>{selected.size * weeks}</strong> sessions ({selected.size} classes × {weeks} weeks).
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            type="submit"
            disabled={saving || !startDate || noneSelected}
            className="rounded-lg bg-[#002F67] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create term'}
          </button>
        </div>
      </form>
    </div>
  )
}
