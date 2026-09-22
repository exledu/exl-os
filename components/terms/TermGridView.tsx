'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, User, MapPin, Users, CalendarClock, Ban, Trash2, Archive, Pencil, Plus, UserPlus, Repeat, ChevronLeft, ChevronRight, ChevronDown, PlusCircle, UsersRound, Mail, Phone, ArrowLeft } from 'lucide-react'
import { CreateTermModal } from './TermsView'
import { InlineLoading } from '@/components/ui/spinner'

// ── Types ────────────────────────────────────────────────────────────────

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
  staffId:   number
  dayOfWeek: number | null
  startTime: string | null
  endTime:   string | null
  archived:  boolean
  cells:     (Cell | null)[]
}
interface TermData {
  term: { id: number; name: string; year: number; termNumber: number; startDate: string; weeks: number }
  grid: Row[]
}
interface ClassDetail {
  id: number
  subjectId:   number
  yearLevelId: number
  archived:  boolean
  subject:   { id: number; name: string }
  yearLevel: { id: number; level: number }
  staff:     { id: number; name: string }
  room:      { id: number; name: string } | null
  maxCapacity: number
  isRecurring: boolean
  dayOfWeek: number | null
  startTime: string | null
  endTime:   string | null
  enrolments: { student: { id: number; name: string; lastName: string | null } }[]
}
interface SessionDetail {
  id: number
  date: string
  startTime: string
  endTime: string
  cancelled: boolean
  originalDate: string | null
  attendanceReminderLevel: number
  parentEmailsSentAt: string | null
  yearLevel: { level: number } | null
  term: { id: number; name: string } | null
  staffId: number | null
  staff: { id: number; name: string } | null
  class: {
    id: number
    isRecurring: boolean
    subject: { name: string }
    yearLevel: { level: number }
    staff: { id: number; name: string }
    room: { id: number; name: string } | null
    _count: { enrolments: number }
    enrolments: {
      enrolledAt: string
      student: { id: number; name: string; lastName: string | null }
    }[]
  }
  attendances: {
    present: boolean
    notifiedAbsent: boolean
    homework: string | null
    student: { id: number; name: string; lastName: string | null }
  }[]
  trials: { student: { id: number; name: string; lastName: string | null } }[]
}

interface StaffOpt   { id: number; name: string }
interface StaffFull  {
  id: number
  name: string
  email: string | null
  phone: string | null
  roles: string[]
  classes: number             // non-archived recurring, with sessions in THIS term
  totalStudents: number
  avgStudentsPerClass: number
  sessionsThisTerm: number    // effective teacher (covers included)
  hoursThisTerm: number
  payThisTerm: number
}
interface RoomOpt    { id: number; name: string }
interface SubjectOpt { id: number; name: string }
interface StudentOpt {
  id: number
  name: string
  lastName: string | null
  yearLevel: { level: number }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOMEWORK_CYCLE = ['UNATTEMPTED', 'INCOMPLETE', 'SATISFACTORY', 'EXCELLENT'] as const
type HomeworkStatus = typeof HOMEWORK_CYCLE[number]

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Main view ────────────────────────────────────────────────────────────

export function TermGridView({ termId }: { termId: number }) {
  const [data, setData]       = useState<TermData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<
    | { kind: 'class';   id: number }
    | { kind: 'session'; id: number }
    | null
  >(null)

  // Split the invalidation counters. gridTick refetches the whole class×week
  // matrix (only when structural changes happen — session cancel/delete, class
  // schedule edits, archive). Attendance saves don't touch the grid, so we
  // don't waste a fetch on them.
  const [gridTick, setGridTick] = useState(0)
  const reloadGrid = () => setGridTick(t => t + 1)

  // Detail caches so reopening a modal is instant. We serve cached data
  // immediately, then refetch in the background to freshen.
  const [classCache,   setClassCache]   = useState<Map<number, ClassDetail>>(new Map())
  const [sessionCache, setSessionCache] = useState<Map<number, SessionDetail>>(new Map())
  const setClassCached   = (id: number, d: ClassDetail)   => setClassCache(prev   => new Map(prev).set(id, d))
  const setSessionCached = (id: number, d: SessionDetail) => setSessionCache(prev => new Map(prev).set(id, d))

  const [lookups, setLookups] = useState<{
    staff:      StaffOpt[]
    rooms:      RoomOpt[]
    subjects:   SubjectOpt[]
    yearLevels: { id: number; level: number }[]
  } | null>(null)
  useEffect(() => {
    (async () => {
      const [staff, rooms, subjects, yearLevels] = await Promise.all([
        fetch('/api/staff').then(r => r.ok ? r.json() : []),
        fetch('/api/rooms').then(r => r.ok ? r.json() : []),
        fetch('/api/subjects').then(r => r.ok ? r.json() : []),
        fetch('/api/year-levels').then(r => r.ok ? r.json() : []),
      ])
      setLookups({ staff, rooms, subjects, yearLevels })
    })()
  }, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [createTermOpen, setCreateTermOpen] = useState(false)
  const [createTermError, setCreateTermError] = useState<string | null>(null)
  const [staffPanelOpen, setStaffPanelOpen] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)
  const router = useRouter()

  // Ordered list of every term so we can compute prev/next relative to this one.
  const [allTerms, setAllTerms] = useState<{ id: number; startDate: string; name: string }[]>([])
  useEffect(() => {
    fetch('/api/terms')
      .then(r => r.ok ? r.json() : [])
      .then((rows: { id: number; startDate: string; name: string }[]) => {
        rows.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
        setAllTerms(rows)
      })
  }, [gridTick])

  useEffect(() => {
    (async () => {
      // Only show the "Loading…" spinner on the first load. Subsequent grid
      // refreshes keep the stale data visible.
      if (!data) setLoading(true)
      try {
        const q = showArchived ? '?includeArchived=1' : ''
        const res = await fetch(`/api/terms/${termId}${q}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, gridTick, showArchived])

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8"><InlineLoading label="Loading term…" /></div>
  if (!data)   return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Term not found.</div>

  const { term, grid } = data

  const curIdx = allTerms.findIndex(t => t.id === termId)
  const prevTerm = curIdx > 0 ? allTerms[curIdx - 1] : null
  const nextTerm = curIdx >= 0 && curIdx < allTerms.length - 1 ? allTerms[curIdx + 1] : null

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => prevTerm && router.push(`/terms/${prevTerm.id}`)}
            disabled={!prevTerm}
            title={prevTerm ? `Previous: ${prevTerm.name}` : 'No earlier term'}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#002F67]">{term.name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              W1 begins {fmtDateLong(term.startDate)} · {term.weeks} weeks · {grid.length} classes
            </p>
          </div>
          {nextTerm ? (
            <button
              onClick={() => router.push(`/terms/${nextTerm.id}`)}
              title={`Next: ${nextTerm.name}`}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => setCreateTermOpen(true)}
              title="Create next term"
              className="inline-flex items-center justify-center rounded-lg border border-dashed border-[#002F67] bg-white p-2 text-[#002F67] hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // Clear any staff filter every time the toggle is pressed, whether
              // opening (start on the list) or closing (grid returns to all classes).
              setSelectedStaffId(null)
              setStaffPanelOpen(v => !v)
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
              staffPanelOpen
                ? 'border-[#002F67] bg-blue-50 text-[#002F67]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title="Open staff panel"
          >
            <UsersRound className="h-3.5 w-3.5" /> Staff
          </button>
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
              showArchived
                ? 'border-[#002F67] bg-blue-50 text-[#002F67]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title="Include archived classes in the grid"
          >
            <Archive className="h-3.5 w-3.5" /> {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#011f42]"
          >
            <Plus className="h-3.5 w-3.5" /> New class
          </button>
        </div>
      </div>

      {createTermError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{createTermError}</div>
      )}

      <div className={staffPanelOpen ? 'flex gap-4 items-start' : ''}>
        {staffPanelOpen && (
          <aside className="w-72 shrink-0">
            <StaffPanel
              termId={termId}
              selectedStaffId={selectedStaffId}
              onSelect={setSelectedStaffId}
              onClose={() => { setStaffPanelOpen(false); setSelectedStaffId(null) }}
            />
          </aside>
        )}

        <div className={staffPanelOpen ? 'flex-1 min-w-0 space-y-4' : ''}>
        <div className={`overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm`}>
        <table className="text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2.5 min-w-[260px] whitespace-nowrap shadow-[2px_0_0_-1px_rgb(229_231_235)]">Class</th>
              {Array.from({ length: term.weeks }, (_, i) => (
                <th key={i} className="px-2 py-2.5 text-center min-w-[88px]">W{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {grid.filter(r => selectedStaffId == null || r.staffId === selectedStaffId).map(row => (
              <tr key={row.classId} className={`border-t border-gray-100 ${row.archived ? 'opacity-50' : ''}`}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-gray-100 shadow-[2px_0_0_-1px_rgb(229_231_235)]">
                  <button
                    onClick={() => setModal({ kind: 'class', id: row.classId })}
                    className="text-left font-medium text-sm text-[#002F67] hover:underline whitespace-nowrap"
                  >
                    Yr{row.yearLevel} {row.subject}
                  </button>
                  <div className="text-[11px] text-gray-500 whitespace-nowrap">
                    {row.staff} · {row.dayOfWeek != null ? DAYS[row.dayOfWeek] : '?'} {row.startTime}–{row.endTime}
                  </div>
                </td>
                {row.cells.map((cell, i) => {
                  const effectiveStaff = cell?.staff?.name ?? row.staff
                  const isCover = !!cell?.staff && cell.staff.name !== row.staff
                  return (
                    <td key={i} className="px-2 py-2 text-center border-l border-gray-100 first:border-l-0 align-top">
                      {cell ? (
                        <button
                          onClick={() => setModal({ kind: 'session', id: cell.id })}
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
                        </button>
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

        {staffPanelOpen && selectedStaffId != null && (
          <StaffPayrollHistory termId={termId} staffId={selectedStaffId} />
        )}
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        Click a class name to open its info. Click a session cell to open its details.
      </p>

      <TrialsSection
        termStart={term.startDate}
        termWeeks={term.weeks}
        onOpenSession={id => setModal({ kind: 'session', id })}
      />

      {createOpen && lookups && (
        <ClassCreateModal
          lookups={lookups}
          term={term}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reloadGrid() }}
        />
      )}
      {createTermOpen && (
        <CreateTermModal
          onClose={() => setCreateTermOpen(false)}
          onCreated={async () => {
            setCreateTermOpen(false)
            // The new term is now the last in the ordered list — refresh and jump to it.
            const rows: { id: number; startDate: string; name: string }[] = await fetch('/api/terms')
              .then(r => r.ok ? r.json() : [])
            rows.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
            const latest = rows.length > 0 ? rows[rows.length - 1] : null
            if (latest) router.push(`/terms/${latest.id}`)
          }}
          onError={setCreateTermError}
        />
      )}
      {modal?.kind === 'class' && (
        <ClassModal
          classId={modal.id}
          cached={classCache.get(modal.id) ?? null}
          onCache={setClassCached}
          lookups={lookups}
          onClose={() => setModal(null)}
          onChanged={reloadGrid}
        />
      )}
      {modal?.kind === 'session' && (
        <SessionModal
          sessionId={modal.id}
          cached={sessionCache.get(modal.id) ?? null}
          onCache={setSessionCached}
          staffOpts={lookups?.staff ?? []}
          onClose={() => setModal(null)}
          onStructuralChange={reloadGrid}
          onDeleted={() => { setModal(null); reloadGrid() }}
        />
      )}
    </div>
  )
}

// ── Modal shell ──────────────────────────────────────────────────────────

function ModalShell({ title, subtitle, onClose, children }: {
  title:    string
  subtitle?: string
  onClose:  () => void
  children: React.ReactNode
}) {
  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-[1px] p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{title}</div>
            {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}

// ── Class modal ──────────────────────────────────────────────────────────

interface ClassDraft {
  subjectId:   number
  yearLevelId: number
  staffId:     number
  roomId:      number | null
  maxCapacity: number
  dayOfWeek:   number | null
  startTime:   string | null
}

function ClassModal({ classId, cached, onCache, lookups, onClose, onChanged }: {
  classId: number
  cached: ClassDetail | null
  onCache: (id: number, detail: ClassDetail) => void
  lookups: { staff: StaffOpt[]; rooms: RoomOpt[]; subjects: SubjectOpt[]; yearLevels: { id: number; level: number }[] } | null
  onClose: () => void
  onChanged: () => void
}) {
  // Seed from cache so the modal renders instantly on reopen.
  const [detail, setDetail] = useState<ClassDetail | null>(cached)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draft, setDraft] = useState<ClassDraft | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch(`/api/classes/${classId}`)
    if (res.ok) {
      const d = await res.json() as ClassDetail
      setDetail(d)
      onCache(classId, d)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [classId])

  function enterEdit() {
    if (!detail) return
    setDraft({
      subjectId:    detail.subject.id,
      yearLevelId:  detail.yearLevel.id,
      staffId:      detail.staff.id,
      roomId:       detail.room?.id ?? null,
      maxCapacity:  detail.maxCapacity,
      dayOfWeek:    detail.dayOfWeek,
      startTime:    detail.startTime,
    })
    setMode('edit')
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (res.ok) {
        await load()
        setMode('view')
        onChanged()
      } else {
        alert('Failed to save')
      }
    } finally { setBusy(false) }
  }

  async function removeStudent(studentId: number) {
    if (!confirm('Remove this student from the class? Their attendance history is kept.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/classes/${classId}/enrolments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      })
      if (res.ok) { await load(); onChanged() }
    } finally { setBusy(false) }
  }

  async function toggleArchive() {
    if (!detail) return
    const target = !detail.archived
    if (target && !confirm(`Archive Yr${detail.yearLevel.level} ${detail.subject.name}? Sessions after today will be hidden.`)) return
    const res = await fetch(`/api/classes/${classId}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: target }),
    })
    if (res.ok) { await load(); onChanged() }
  }

  return (
    <ModalShell title={mode === 'edit' ? 'Edit class' : 'Class'} onClose={onClose}>
      {!detail ? (
        <InlineLoading className="py-8" />
      ) : (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xl font-semibold text-[#002F67]">
                Yr{detail.yearLevel.level} {detail.subject.name}
              </div>
              {detail.archived && (
                <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Archived
                </span>
              )}
            </div>
            {mode === 'view' && (
              <button
                onClick={enterEdit}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>

          <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-sm">
            {mode === 'edit' && draft && lookups && (
              <>
                <FieldRow icon={Users} label="Subject">
                  <select
                    value={draft.subjectId}
                    onChange={e => setDraft({ ...draft, subjectId: Number(e.target.value) })}
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                  >
                    {lookups.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </FieldRow>
                <FieldRow icon={Users} label="Year">
                  <select
                    value={draft.yearLevelId}
                    onChange={e => setDraft({ ...draft, yearLevelId: Number(e.target.value) })}
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                  >
                    {lookups.yearLevels.map(y => <option key={y.id} value={y.id}>Yr {y.level}</option>)}
                  </select>
                </FieldRow>
              </>
            )}
            <FieldRow icon={User} label="Tutor">
              {mode === 'edit' && draft && lookups ? (
                <select
                  value={draft.staffId}
                  onChange={e => setDraft({ ...draft, staffId: Number(e.target.value) })}
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                >
                  {lookups.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <span className="text-gray-800">{detail.staff.name}</span>
              )}
            </FieldRow>

            {detail.isRecurring && (
              <FieldRow icon={CalendarClock} label="Schedule">
                {mode === 'edit' && draft ? (
                  <div className="flex gap-1.5">
                    <select
                      value={draft.dayOfWeek ?? 0}
                      onChange={e => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                    >
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <input
                      type="time"
                      value={draft.startTime ?? ''}
                      onChange={e => setDraft({ ...draft, startTime: e.target.value })}
                      className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                    />
                  </div>
                ) : (
                  <span className="text-gray-800 tabular-nums">
                    {detail.dayOfWeek != null ? DAYS[detail.dayOfWeek] : '?'} {detail.startTime}–{detail.endTime}
                  </span>
                )}
              </FieldRow>
            )}

            <FieldRow icon={MapPin} label="Room">
              {mode === 'edit' && draft && lookups ? (
                <select
                  value={draft.roomId ?? ''}
                  onChange={e => setDraft({ ...draft, roomId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="">— none —</option>
                  {lookups.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              ) : (
                <span className="text-gray-800">{detail.room?.name ?? '—'}</span>
              )}
            </FieldRow>

            <FieldRow icon={Users} label="Capacity">
              {mode === 'edit' && draft ? (
                <input
                  type="number"
                  min={1} max={20}
                  value={draft.maxCapacity}
                  onChange={e => setDraft({ ...draft, maxCapacity: Number(e.target.value) })}
                  className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm"
                />
              ) : (
                <span className="text-gray-800">{detail.enrolments.length} of {detail.maxCapacity}</span>
              )}
            </FieldRow>
          </dl>

          {mode === 'view' && <HistorySection classId={classId} />}

          {mode === 'view' && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Students {detail.enrolments.length > 0 && `(${detail.enrolments.length})`}
                </div>
              </div>
              {detail.enrolments.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No students enrolled yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {detail.enrolments.map(e => (
                    <li key={e.student.id} className="group flex items-center gap-1 text-sm">
                      <span className="flex-1 truncate text-gray-700">
                        {e.student.name}{e.student.lastName ? ` ${e.student.lastName}` : ''}
                      </span>
                      <button
                        onClick={() => removeStudent(e.student.id)}
                        disabled={busy}
                        className="rounded p-1 text-gray-300 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                        title="Remove from class"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <AddStudentInline
                excludeIds={new Set(detail.enrolments.map(e => e.student.id))}
                onAdd={async id => {
                  setBusy(true)
                  try {
                    const res = await fetch(`/api/classes/${classId}/enrolments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ studentId: id }),
                    })
                    if (res.ok) { await load(); onChanged() }
                  } finally { setBusy(false) }
                }}
                busy={busy}
              />
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
            {mode === 'edit' ? (
              <>
                <button
                  onClick={() => setMode('view')}
                  disabled={busy}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={busy}
                  className="rounded-lg bg-[#002F67] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#011f42] disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={toggleArchive}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <Archive className="h-3 w-3" /> {detail.archived ? 'Unarchive' : 'Archive'}
              </button>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ── Session modal ────────────────────────────────────────────────────────

interface PendingAttendance {
  present?:        boolean
  notifiedAbsent?: boolean
  homework?:       HomeworkStatus | null
}
interface SessionDraft {
  date: string
  startTime: string
  staffId: number | null   // null = clear cover override → use class default
}

function SessionModal({ sessionId, cached, onCache, staffOpts, onClose, onStructuralChange, onDeleted }: {
  sessionId: number
  cached: SessionDetail | null
  onCache: (id: number, detail: SessionDetail) => void
  staffOpts: StaffOpt[]
  onClose: () => void
  onStructuralChange: () => void   // fires only on cancel/edit/delete — not attendance
  onDeleted: () => void
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(cached)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Map<number, PendingAttendance>>(new Map())

  async function load() {
    const res = await fetch(`/api/sessions/${sessionId}`)
    if (res.ok) {
      const d = await res.json() as SessionDetail
      setDetail(d)
      onCache(sessionId, d)
    }
  }
  useEffect(() => { load(); setPending(new Map()) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sessionId])

  function enterEdit() {
    if (!detail) return
    setDraft({
      date:      detail.date,
      startTime: detail.startTime,
      staffId:   detail.staffId,
    })
    setMode('edit')
  }

  async function saveEdit() {
    if (!draft || !detail) return
    setBusy(true)
    try {
      // If staff was set to the class default, PATCH staffId=null to clear the
      // override. Otherwise stamp the picked cover.
      const staffIdPatch = draft.staffId === detail.class.staff.id ? null : draft.staffId
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: draft.date, startTime: draft.startTime, staffId: staffIdPatch }),
      })
      if (res.ok) { await load(); setMode('view'); onStructuralChange() }
      else alert('Failed to save')
    } finally { setBusy(false) }
  }

  async function saveAttendance() {
    if (!detail || pending.size === 0) return
    setBusy(true)
    try {
      const updates = Array.from(pending.entries()).map(([studentId, u]) => ({ studentId, ...u }))
      const res = await fetch(`/api/sessions/${sessionId}/attendance/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      // Attendance changes never affect the grid — skip onStructuralChange.
      if (res.ok) { setPending(new Map()); await load() }
      else alert('Failed to save attendance')
    } finally { setBusy(false) }
  }

  async function toggleCancel() {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelled: !detail.cancelled }),
      })
      if (res.ok) { await load(); onStructuralChange() }
    } finally { setBusy(false) }
  }

  async function deleteSession() {
    if (!detail) return
    if (!confirm(`Delete session on ${fmtDateLong(detail.date)}? Attendance for this session will be removed too.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      if (res.ok) onDeleted()
    } finally { setBusy(false) }
  }

  function pendPatch(studentId: number, patch: PendingAttendance) {
    setPending(prev => {
      const next = new Map(prev)
      next.set(studentId, { ...(prev.get(studentId) ?? {}), ...patch })
      return next
    })
  }

  const dateLine = detail ? `${detail.term?.name ?? 'No term'} · Session #${detail.id}` : undefined

  return (
    <ModalShell
      title={mode === 'edit' ? 'Edit session' : 'Session'}
      subtitle={dateLine}
      onClose={onClose}
    >
      {!detail ? (
        <InlineLoading className="py-8" />
      ) : (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xl font-semibold text-[#002F67]">
              Yr{detail.yearLevel?.level ?? detail.class.yearLevel.level} {detail.class.subject.name}
            </div>
            {mode === 'view' && (
              <button
                onClick={enterEdit}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>

          {detail.cancelled && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 font-medium">
              This session is cancelled
            </div>
          )}

          <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-sm">
            <FieldRow icon={CalendarClock} label="When">
              {mode === 'edit' && draft ? (
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={draft.date}
                    onChange={e => setDraft({ ...draft, date: e.target.value })}
                    className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                  />
                  <input
                    type="time"
                    value={draft.startTime}
                    onChange={e => setDraft({ ...draft, startTime: e.target.value })}
                    className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                  />
                </div>
              ) : (
                <div>
                  <div className="text-gray-800">{fmtDateLong(detail.date)}</div>
                  <div className="text-xs text-gray-500 tabular-nums">{detail.startTime}–{detail.endTime}</div>
                  {detail.originalDate && detail.originalDate !== detail.date && (
                    <div className="text-[11px] text-amber-700 mt-0.5">
                      Rescheduled from {fmtDateLong(detail.originalDate)}
                    </div>
                  )}
                </div>
              )}
            </FieldRow>

            <FieldRow icon={User} label={detail.staffId && detail.staffId !== detail.class.staff.id ? 'Cover' : 'Tutor'}>
              {mode === 'edit' && draft ? (
                <select
                  value={draft.staffId ?? detail.class.staff.id}
                  onChange={e => setDraft({ ...draft, staffId: Number(e.target.value) })}
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                >
                  {staffOpts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.id === detail.class.staff.id ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-gray-800">
                  {detail.staff?.name ?? detail.class.staff.name}
                  {detail.staff && detail.staff.id !== detail.class.staff.id && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-700">cover</span>
                  )}
                </span>
              )}
            </FieldRow>

            {mode === 'view' && detail.class.room && (
              <FieldRow icon={MapPin} label="Room">
                <span className="text-gray-800">{detail.class.room.name}</span>
              </FieldRow>
            )}
          </dl>

          {mode === 'view' && (
            <RosterSection detail={detail} pending={pending} onPending={pendPatch} />
          )}

          {mode === 'view' && !detail.class.isRecurring && (
            <ConvertTrialInline
              classId={detail.class.id}
              trialDate={detail.date}
              onConverted={() => { onStructuralChange(); onClose() }}
            />
          )}

          {mode === 'view' && pending.size > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
              <span className="text-amber-800 font-medium">
                {pending.size} unsaved change{pending.size === 1 ? '' : 's'}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPending(new Map())}
                  disabled={busy}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  Discard
                </button>
                <button
                  onClick={saveAttendance}
                  disabled={busy}
                  className="rounded-md bg-[#002F67] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#011f42] disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save attendance'}
                </button>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
            {mode === 'edit' ? (
              <>
                <button
                  onClick={() => setMode('view')}
                  disabled={busy}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={busy}
                  className="rounded-lg bg-[#002F67] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#011f42] disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={toggleCancel}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Ban className="h-3 w-3" /> {detail.cancelled ? 'Un-cancel' : 'Cancel session'}
                </button>
                <button
                  onClick={deleteSession}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ── Roster (still interactive in view mode) ──────────────────────────────

function RosterSection({ detail, pending, onPending }: {
  detail:   SessionDetail
  pending:  Map<number, PendingAttendance>
  onPending: (studentId: number, patch: PendingAttendance) => void
}) {
  // Only include enrolments that existed on or before this session's date, so
  // a student who joined mid-term doesn't retroactively appear in older
  // sessions' rosters.
  const sessionDay = new Date(detail.date + 'T23:59:59.999Z')
  const activeEnrolments = detail.class.enrolments.filter(
    e => new Date(e.enrolledAt) <= sessionDay
  )
  const enrolledIds = new Set(activeEnrolments.map(e => e.student.id))
  const roster = [
    ...activeEnrolments.map(e => ({ ...e.student, trial: false })),
    ...detail.trials
      .filter(t => !enrolledIds.has(t.student.id))
      .map(t => ({ ...t.student, trial: true })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const byStudent = new Map(detail.attendances.map(a => [a.student.id, a]))

  function effectiveState(studentId: number) {
    const saved  = byStudent.get(studentId)
    const patch  = pending.get(studentId)
    return {
      present:        patch?.present        ?? saved?.present        ?? undefined,
      notifiedAbsent: patch?.notifiedAbsent ?? saved?.notifiedAbsent ?? undefined,
      homework:       (patch && 'homework' in patch ? patch.homework : saved?.homework) ?? null,
    }
  }

  let presentEff = 0
  let markedEff  = 0
  for (const s of roster) {
    const eff = effectiveState(s.id)
    if (eff.present === true) presentEff++
    if (eff.present !== undefined || eff.notifiedAbsent !== undefined || eff.homework != null) markedEff++
  }
  const anyMarked = markedEff > 0

  function nextPresenceState(cur: { present?: boolean; notifiedAbsent?: boolean }) {
    if (cur.present === undefined && !cur.notifiedAbsent) return { present: true,  notifiedAbsent: false }
    if (cur.present === true)                             return { present: false, notifiedAbsent: false }
    if (cur.present === false && !cur.notifiedAbsent)     return { present: false, notifiedAbsent: true }
    return { present: true, notifiedAbsent: false }
  }
  function nextHomework(cur: string | null): HomeworkStatus {
    if (!cur) return 'UNATTEMPTED'
    const i = HOMEWORK_CYCLE.indexOf(cur as HomeworkStatus)
    return HOMEWORK_CYCLE[(i + 1) % HOMEWORK_CYCLE.length]
  }

  if (roster.length === 0) {
    return <div className="text-xs text-gray-400 italic">No students enrolled.</div>
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {anyMarked ? 'Attendance' : 'Roster'}
        </div>
        <div className="text-[10px] text-gray-400 tabular-nums">
          {anyMarked ? `${presentEff}/${roster.length}` : `${roster.length} enrolled`}
        </div>
      </div>
      <ul className="space-y-1">
        {roster.map(s => {
          const eff = effectiveState(s.id)
          const marked = eff.present !== undefined || eff.notifiedAbsent
          const isDirty = pending.has(s.id)
          const name = s.lastName ? `${s.name} ${s.lastName}` : s.name
          return (
            <li key={s.id} className={`flex items-center gap-1.5 text-xs rounded px-1 -mx-1 ${isDirty ? 'bg-amber-50' : ''}`}>
              <button onClick={() => onPending(s.id, nextPresenceState(eff))}>
                {marked
                  ? <PresenceBadge present={eff.present === true} notified={!!eff.notifiedAbsent} />
                  : <UnmarkedBadge />}
              </button>
              <span className="flex-1 min-w-0 truncate text-gray-700">{name}</span>
              {s.trial && (
                <span className="rounded bg-amber-50 border border-amber-200 px-1 py-0.5 text-[9px] font-semibold text-amber-700">TRIAL</span>
              )}
              <button onClick={() => onPending(s.id, { homework: nextHomework(eff.homework) })}>
                {eff.homework
                  ? <HomeworkBadge status={eff.homework} />
                  : <span className="inline-flex rounded border border-dashed border-gray-300 text-[9px] text-gray-400 px-1 py-0.5">HW?</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-1.5 text-[10px] text-gray-400">
        Click a badge to cycle. Changes stay local until you press Save.
      </p>
    </div>
  )
}

// ── Small building blocks ────────────────────────────────────────────────

function FieldRow({ icon: Icon, label, children }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-500 font-semibold pt-1">
        <Icon className="h-3 w-3 text-gray-400" />
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </>
  )
}

function PresenceBadge({ present, notified }: { present: boolean; notified: boolean }) {
  if (present) {
    return <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold" title="Present">Y</span>
  }
  if (notified) {
    return <span className="inline-flex h-4 items-center justify-center rounded bg-amber-100 text-amber-700 text-[10px] font-bold px-1" title="Notified absent">N*</span>
  }
  return <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-100 text-rose-700 text-[10px] font-bold" title="Absent">N</span>
}

function UnmarkedBadge() {
  return <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-dashed border-gray-300 text-[10px] text-gray-400" title="Not marked">·</span>
}

const HOMEWORK_STYLES: Record<string, { label: string; cls: string }> = {
  UNATTEMPTED:  { label: 'HW—',  cls: 'bg-gray-100  text-gray-500'    },
  INCOMPLETE:   { label: 'HW~',  cls: 'bg-amber-100 text-amber-700'   },
  SATISFACTORY: { label: 'HW✓',  cls: 'bg-blue-100  text-blue-700'    },
  EXCELLENT:    { label: 'HW★',  cls: 'bg-emerald-100 text-emerald-700' },
}

function HomeworkBadge({ status }: { status: string }) {
  const s = HOMEWORK_STYLES[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide ${s.cls}`} title={`Homework: ${status.toLowerCase()}`}>
      {s.label}
    </span>
  )
}

// ── Add-student picker (used inside ClassModal) ──────────────────────────

function AddStudentInline({ excludeIds, onAdd, busy }: {
  excludeIds: Set<number>
  onAdd: (studentId: number) => Promise<void>
  busy: boolean
}) {
  const [open, setOpen]   = useState(false)
  const [q, setQ]         = useState('')
  const [rows, setRows]   = useState<StudentOpt[] | null>(null)

  useEffect(() => {
    if (!open || rows !== null) return
    fetch('/api/students')
      .then(r => r.ok ? r.json() : [])
      .then(setRows)
  }, [open, rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    return rows
      .filter(r => !excludeIds.has(r.id))
      .filter(r => !needle || `${r.name} ${r.lastName ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 20)
  }, [rows, q, excludeIds])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-[#002F67] hover:text-[#002F67]"
      >
        <UserPlus className="h-3 w-3" /> Add student
      </button>
    )
  }
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/50 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search students…"
          className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
        />
        <button onClick={() => setOpen(false)} className="rounded p-0.5 text-gray-400 hover:text-gray-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto rounded-md bg-white border border-gray-100">
        {rows === null ? (
          <InlineLoading className="py-2" />
        ) : filtered.length === 0 ? (
          <div className="p-2 text-[11px] text-gray-400 italic">
            {q ? 'No matches.' : 'All students are already enrolled.'}
          </div>
        ) : (
          <ul>
            {filtered.map(s => (
              <li key={s.id}>
                <button
                  disabled={busy}
                  onClick={async () => { await onAdd(s.id); setOpen(false); setQ('') }}
                  className="block w-full px-2 py-1 text-left text-xs hover:bg-blue-50 disabled:opacity-50"
                >
                  {s.name}{s.lastName ? ` ${s.lastName}` : ''}
                  <span className="ml-1.5 text-[10px] text-gray-400">Yr{s.yearLevel.level}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Trial → recurring converter (used in SessionModal) ───────────────────

function ConvertTrialInline({ classId, trialDate, onConverted }: {
  classId: number
  trialDate: string
  onConverted: () => void
}) {
  const [open, setOpen]         = useState(false)
  const [weekOfTerm, setWeek]   = useState(1)
  const [busy, setBusy]         = useState(false)

  // Sensible defaults for day + start time: derived from the trial itself so the
  // user only needs to confirm the week they consider this trial to fall in.
  async function submit() {
    setBusy(true)
    try {
      const d = new Date(trialDate)
      const dayOfWeek = d.getUTCDay()
      const res = await fetch(`/api/classes/${classId}/convert-to-recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayOfWeek, weekOfTerm }),
      })
      if (res.ok) onConverted()
      else alert('Failed to convert')
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
      >
        <Repeat className="h-3.5 w-3.5" /> Convert trial to recurring class
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900">
        Convert to recurring class
      </div>
      <label className="block text-xs">
        <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
          Week of term this trial counts as
        </span>
        <select
          value={weekOfTerm}
          onChange={e => setWeek(Number(e.target.value))}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map(w => (
            <option key={w} value={w}>Week {w}</option>
          ))}
        </select>
        <span className="ml-2 text-[10px] text-gray-500">
          → {10 - weekOfTerm} more session{10 - weekOfTerm === 1 ? '' : 's'} will be seeded
        </span>
      </label>
      <div className="flex justify-end gap-1.5">
        <button onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700">Cancel</button>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? 'Converting…' : 'Convert'}
        </button>
      </div>
    </div>
  )
}

// ── Staff payroll history (bottom of the right column) ──────────────────

interface FortnightPay {
  start:      string
  end:        string
  totalHours: number
  totalPay:   number
  sessions: {
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
  }[]
}

function StaffPayrollHistory({ termId, staffId }: { termId: number; staffId: number }) {
  const [data, setData] = useState<FortnightPay[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setExpanded(null)
    fetch(`/api/terms/${termId}/staff/${staffId}/payroll`)
      .then(r => r.ok ? r.json() : { fortnights: [] })
      .then(j => setData(j.fortnights))
  }, [termId, staffId])

  const total = data?.reduce((sum, f) => sum + f.totalPay, 0) ?? 0

  function fmtMoney(n: number) {
    return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  function fmtRange(a: string, b: string) {
    const fmt = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    }
    return `${fmt(a)} → ${fmt(b)}`
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-baseline justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Fortnight payroll · this term</span>
        <span className="text-sm font-semibold text-[#002F67] tabular-nums">{fmtMoney(total)}</span>
      </div>
      {data === null ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : data.length === 0 ? (
        <div className="p-4 text-xs text-gray-400 italic">No fortnights overlap this term.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.map(f => {
            const isOpen = expanded === f.start
            return (
              <li key={f.start}>
                <button
                  onClick={() => setExpanded(isOpen ? null : f.start)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="flex-1 text-sm text-gray-700">{fmtRange(f.start, f.end)}</span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {f.sessions.length} sess · {f.totalHours.toFixed(1)} hrs
                  </span>
                  <span className="text-sm font-semibold text-[#002F67] tabular-nums w-24 text-right">
                    {fmtMoney(f.totalPay)}
                  </span>
                </button>

                {isOpen && (
                  <div className="bg-gray-50/60 px-4 py-2">
                    {f.sessions.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2">No sessions in this fortnight.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="py-1 font-medium">Date</th>
                            <th className="py-1 font-medium">Time</th>
                            <th className="py-1 font-medium">Class</th>
                            <th className="py-1 font-medium text-right">Stu</th>
                            <th className="py-1 font-medium text-right">Hrs</th>
                            <th className="py-1 font-medium text-right">Rate</th>
                            <th className="py-1 font-medium text-right">Pay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.sessions.map(s => (
                            <tr key={s.sessionId} className="border-t border-gray-200/70">
                              <td className="py-1.5">{new Date(s.date + 'T00:00:00.000Z').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                              <td className="py-1.5 tabular-nums">{s.startTime}–{s.endTime}</td>
                              <td className="py-1.5">
                                {s.className}
                                {s.isCover && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-700">cover</span>}
                              </td>
                              <td className="py-1.5 tabular-nums text-right">{s.students}</td>
                              <td className="py-1.5 tabular-nums text-right">{s.hours.toFixed(1)}</td>
                              <td className="py-1.5 tabular-nums text-right">${s.rate}/hr</td>
                              <td className="py-1.5 tabular-nums text-right font-medium">{fmtMoney(s.pay)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Staff panel (left-hand side of the grid) ─────────────────────────────

function StaffPanel({ termId, selectedStaffId, onSelect, onClose }: {
  termId: number
  selectedStaffId: number | null
  onSelect: (id: number | null) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<StaffFull[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch(`/api/terms/${termId}/staff`)
      .then(r => r.ok ? r.json() : [])
      .then(setRows)
  }, [termId])

  const selected = rows?.find(s => s.id === selectedStaffId) ?? null

  function initials(name: string) {
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
  }
  function roleClass(role: string) {
    return role === 'admin'
      ? 'bg-blue-50  text-blue-700 border-blue-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm sticky top-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        {selected ? (
          <button
            onClick={() => onSelect(null)}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-[#002F67]"
          >
            <ArrowLeft className="h-3 w-3" /> All staff
          </button>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Staff</span>
        )}
        <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {rows === null ? (
        <InlineLoading className="py-4" />
      ) : selected ? (
        // ── Detail view ──
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-sm font-semibold">
              {initials(selected.name)}
            </div>
            <div>
              <div className="text-lg font-semibold text-[#002F67]">{selected.name}</div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {selected.roles.map(r => (
                  <span key={r} className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${roleClass(r)}`}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <dl className="space-y-1.5 text-sm">
            {selected.email && (
              <div className="flex items-start gap-2">
                <Mail className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                <span className="text-gray-700 break-all">{selected.email}</span>
              </div>
            )}
            {selected.phone && (
              <div className="flex items-start gap-2">
                <Phone className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                <span className="text-gray-700">{selected.phone}</span>
              </div>
            )}
          </dl>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Classes"           value={String(selected.classes)} />
            <Stat label="Avg stu / class"   value={selected.avgStudentsPerClass.toString()} />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              This term
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Sessions taught" value={String(selected.sessionsThisTerm)} sub="includes covers" />
              <Stat label="Hours"           value={selected.hoursThisTerm.toString()} />
            </div>
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                Projected pay
              </div>
              <div className="text-lg font-semibold text-emerald-900 tabular-nums">
                ${selected.payThisTerm.toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-700/70">
                Hours × per-session rate, based on current enrolments.
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-100">
            Grid filtered to this tutor's classes only. Press <span className="font-medium text-gray-700">All staff</span> to clear.
          </div>
        </div>
      ) : (
        // ── List view ──
        <div>
          <div className="p-3 border-b border-gray-100">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search staff…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
          <ul className="max-h-[560px] overflow-y-auto divide-y divide-gray-100">
            {rows
              .filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()))
              .map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-blue-50/40"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold shrink-0">
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[#002F67] truncate">{s.name}</div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {s.roles.map(r => (
                          <span key={r} className={`inline-block rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wide ${roleClass(r)}`}>
                            {r}
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {s.classes} class{s.classes === 1 ? '' : 'es'} · {s.sessionsThisTerm} sessions · ${s.payThisTerm.toFixed(0)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-[#002F67] tabular-nums">{value}</div>
      {sub && <div className="text-[9px] text-gray-400">{sub}</div>}
    </div>
  )
}

// ── History (cross-term sessions) inside ClassModal ──────────────────────

interface HistoryTermGroup {
  term:   number
  label?: string
  termId?: number | null
  weeks:  { id: number; date: string; startTime: string; endTime: string; cancelled: boolean; weekNumber: number }[]
}

function HistorySection({ classId }: { classId: number }) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<HistoryTermGroup[] | null>(null)

  useEffect(() => {
    if (!open || groups !== null) return
    fetch(`/api/classes/${classId}/sessions`)
      .then(r => r.ok ? r.json() : [])
      .then(setGroups)
  }, [open, groups, classId])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        <span>History across all terms</span>
        <span className="text-gray-400">Show →</span>
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">History</div>
        <button onClick={() => setOpen(false)} className="text-[10px] text-gray-400 hover:text-gray-700">
          Hide
        </button>
      </div>
      {groups === null ? (
        <div className="text-[11px] text-gray-400">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="text-[11px] text-gray-400 italic">No sessions yet.</div>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
          {groups.map(g => {
            const active = g.weeks.filter(w => !w.cancelled).length
            const first  = g.weeks[0]?.date
            const last   = g.weeks[g.weeks.length - 1]?.date
            return (
              <li key={`${g.term}-${g.label ?? ''}`} className="rounded bg-white border border-gray-100 px-2.5 py-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#002F67]">{g.label ?? `Term ${g.term}`}</span>
                  <span className="text-gray-500 tabular-nums">{active}/{g.weeks.length}</span>
                </div>
                {first && last && (
                  <div className="text-[10px] text-gray-400 tabular-nums">
                    {fmtDay(first)} → {fmtDay(last)}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Trials / one-offs section below the grid ─────────────────────────────

interface TrialClass {
  id:        number
  archived:  boolean
  isRecurring: boolean
  sessionDate: string | null
  subject:   { name: string }
  yearLevel: { level: number }
  staff:     { id: number; name: string }
  sessions:  { id: number; date: string; startTime: string; endTime: string }[]
}

function TrialsSection({ termStart, termWeeks, onOpenSession }: {
  termStart: string
  termWeeks: number
  onOpenSession: (sessionId: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<TrialClass[] | null>(null)

  useEffect(() => {
    if (!open || rows !== null) return
    fetch('/api/classes?archived=false')
      .then(r => r.ok ? r.json() : [])
      .then((all: TrialClass[]) => {
        // Keep only one-off classes with sessionDate inside this term window.
        const start = new Date(termStart)
        const end   = new Date(start)
        end.setUTCDate(end.getUTCDate() + termWeeks * 7)
        const trials = all.filter(c => !c.isRecurring)
        // Load their sessions in parallel
        Promise.all(trials.map(async c => {
          const sess = await fetch(`/api/classes/${c.id}/sessions`)
            .then(r => r.ok ? r.json() : [])
            .then((groups: HistoryTermGroup[]) => groups.flatMap(g => g.weeks))
          return { ...c, sessions: sess } as TrialClass
        })).then(withSessions => {
          const inWindow = withSessions.filter(c =>
            c.sessions.some(s => {
              const d = new Date(s.date)
              return d >= start && d < end
            })
          )
          setRows(inWindow)
        })
      })
  }, [open, rows, termStart, termWeeks])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-[#002F67]">One-off classes &amp; trials</div>
          <div className="text-[11px] text-gray-500">Sessions in this term window that don't sit on a recurring class.</div>
        </div>
        <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          {rows === null ? (
            <div className="text-xs text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No one-off classes in this term.</div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rows.map(c => {
                const s = c.sessions[0]
                return (
                  <li key={c.id} className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2">
                    <div className="text-sm font-medium text-[#002F67]">
                      Yr{c.yearLevel.level} {c.subject.name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {c.staff.name}
                      {s && ` · ${fmtDay(s.date)} ${s.startTime}–${s.endTime}`}
                    </div>
                    {s && (
                      <button
                        onClick={() => onOpenSession(s.id)}
                        className="mt-1 text-[10px] font-medium text-[#002F67] hover:underline"
                      >
                        Open session →
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── New Class modal ──────────────────────────────────────────────────────

function ClassCreateModal({ lookups, term, onClose, onCreated }: {
  lookups: { staff: StaffOpt[]; rooms: RoomOpt[]; subjects: SubjectOpt[]; yearLevels: { id: number; level: number }[] }
  term:    { id: number; name: string; startDate: string; weeks: number }
  onClose:  () => void
  onCreated: () => void
}) {
  const [isRecurring, setIsRecurring] = useState(true)
  const [subjectId,   setSubjectId]   = useState<number | ''>('')
  const [yearLevelId, setYearLevelId] = useState<number | ''>('')
  const [staffId,     setStaffId]     = useState<number | ''>('')
  const [roomId,      setRoomId]      = useState<number | ''>('')
  const [maxCapacity, setMaxCapacity] = useState(6)
  const [dayOfWeek,   setDayOfWeek]   = useState<number | ''>('')
  const [startTime,   setStartTime]   = useState('')
  const [startDate,   setStartDate]   = useState(term.startDate)
  const [sessionDate, setSessionDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (subjectId === '' || yearLevelId === '' || staffId === '' || !startTime) return
    if (isRecurring && dayOfWeek === '')  return
    if (!isRecurring && !sessionDate)     return
    setBusy(true)
    try {
      const createRes = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId, yearLevelId, staffId,
          roomId:      roomId === '' ? null : roomId,
          maxCapacity,
          isRecurring,
          // Recurring: no recurrenceStart so the legacy first-term seeder
          // doesn't fire — /terms/[id]/slot-class handles seeding below.
          // One-off: send sessionDate so POST /api/classes' createOneOffSession
          // helper fires and creates the single trial ClassSession.
          dayOfWeek:       isRecurring ? dayOfWeek : null,
          startTime,
          recurrenceStart: null,
          sessionDate:     isRecurring ? null : sessionDate,
        }),
      })
      if (!createRes.ok) { alert('Failed to create class'); setBusy(false); return }
      const created = await createRes.json() as { id: number }

      if (isRecurring) {
        // Slot into the current term starting from the user's chosen date.
        const slotRes = await fetch(`/api/terms/${term.id}/slot-class`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId: created.id, fromDate: startDate }),
        })
        if (!slotRes.ok) {
          const j = await slotRes.json().catch(() => ({}))
          alert(`Class created but slotting failed: ${j.error ?? 'unknown'}`)
        }
      }
      onCreated()
    } finally { setBusy(false) }
  }

  const weeksForRange = Array.from({ length: term.weeks }, (_, i) => {
    const d = new Date(term.startDate)
    d.setUTCDate(d.getUTCDate() + i * 7)
    return d.toISOString().slice(0, 10)
  })
  const minDate = weeksForRange[0]
  const maxDate = (() => {
    const d = new Date(term.startDate)
    d.setUTCDate(d.getUTCDate() + term.weeks * 7 - 1)
    return d.toISOString().slice(0, 10)
  })()

  return (
    <ModalShell
      title="New class"
      subtitle={isRecurring ? `Will slot into ${term.name}` : `Trial / one-off session`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setIsRecurring(true)}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              isRecurring ? 'bg-white shadow-sm text-[#002F67]' : 'text-gray-500'
            }`}
          >
            Recurring
          </button>
          <button
            type="button"
            onClick={() => setIsRecurring(false)}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              !isRecurring ? 'bg-white shadow-sm text-[#002F67]' : 'text-gray-500'
            }`}
          >
            Trial / one-off
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Subject</span>
            <select value={subjectId} onChange={e => setSubjectId(Number(e.target.value))} required
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm">
              <option value="" disabled>Choose…</option>
              {lookups.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-xs">
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Year level</span>
            <select value={yearLevelId} onChange={e => setYearLevelId(Number(e.target.value))} required
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm">
              <option value="" disabled>Choose…</option>
              {lookups.yearLevels.map(y => <option key={y.id} value={y.id}>Yr {y.level}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-xs">
          <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Tutor</span>
          <select value={staffId} onChange={e => setStaffId(Number(e.target.value))} required
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm">
            <option value="" disabled>Choose…</option>
            {lookups.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Room</span>
            <select value={roomId} onChange={e => setRoomId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm">
              <option value="">— none —</option>
              {lookups.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="block text-xs">
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Capacity</span>
            <input type="number" min={1} max={20} value={maxCapacity}
              onChange={e => setMaxCapacity(Number(e.target.value))}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm" />
          </label>
        </div>

        {isRecurring ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Day</span>
                <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} required
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm">
                  <option value="" disabled>Choose…</option>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </label>
              <label className="block text-xs">
                <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Start time</span>
                <input type="time" required value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm" />
              </label>
            </div>

            <label className="block text-xs">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
                Slot from date
              </span>
              <input type="date" required value={startDate}
                min={minDate} max={maxDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm" />
              <p className="mt-1 text-[10px] text-gray-500">
                Sessions will be seeded from the week this date falls in through W{term.weeks}. End time
                derives from year level.
              </p>
            </label>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Trial date</span>
              <input type="date" required value={sessionDate}
                onChange={e => setSessionDate(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Start time</span>
              <input type="time" required value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm" />
            </label>
            <p className="col-span-2 text-[10px] text-gray-500">
              A single trial session. Once the family commits, open the session and use
              <strong> Convert trial to recurring class</strong> to seed the rest of the term.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy}
            className="rounded-lg bg-[#002F67] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#011f42] disabled:opacity-50">
            {busy ? 'Creating…' : 'Create class'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
