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

  const name = `T${termNumber} ${year}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, year, termNumber, startDate, weeks }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#002F67]">New term</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
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

          <label className="block text-sm">
            <span className="block text-xs text-gray-500 mb-1">W1 start (Monday)</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </label>

          <label className="block text-sm">
            <span className="block text-xs text-gray-500 mb-1">Weeks</span>
            <input
              type="number"
              value={weeks}
              onChange={e => setWeeks(Number(e.target.value))}
              min={1} max={20}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </label>

          <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2 text-xs text-[#002F67]/80">
            Will create: <strong>{name}</strong>. Every non-archived recurring class gets {weeks} weekly sessions starting from the day-of-week its schedule specifies, offset from the W1 Monday.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            type="submit"
            disabled={saving || !startDate}
            className="rounded-lg bg-[#002F67] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create term'}
          </button>
        </div>
      </form>
    </div>
  )
}
