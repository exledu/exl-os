'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Plus, Pencil, X, Check, ChevronDown, ChevronUp, UserCircle, Calendar, RefreshCw, ArrowRight, BookOpen } from 'lucide-react'
import { subjectColour } from '@/lib/subject-colours'

// ── Types ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface StaffOption {
  id: number
  name: string
}

interface ClassSummary {
  id: number
  subject: { name: string }
  yearLevel: { level: number }
  staff: { id: number; name: string }
  room: { name: string } | null
  isRecurring: boolean
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
  sessionDate: string | null
  recurrenceStart: string | null
  _count: { enrolments: number }
  maxCapacity: number
  archived?: boolean
}

interface EnrolledStudent {
  id: number
  studentId: number
  student: {
    id: number
    name: string
    lastName: string | null
    yearLevel: { level: number }
  }
}

interface ClassDetail extends ClassSummary {
  enrolments: EnrolledStudent[]
}

interface SessionWeek {
  weekNumber: number
  id: number
  date: string
  originalDate: string | null
  startTime: string
  endTime: string
  cancelled: boolean
  staffId: number | null
  staffName: string | null
}

interface TermGroup {
  term: number
  weeks: SessionWeek[]
}

// ── Helpers ───────────────────────────────────────────────────────────────

function scheduleLabel(cls: ClassSummary) {
  if (cls.isRecurring && cls.dayOfWeek != null) {
    return `${DAY_NAMES[cls.dayOfWeek]} ${cls.startTime}–${cls.endTime}`
  }
  if (cls.sessionDate) {
    return `${cls.sessionDate} ${cls.startTime}–${cls.endTime}`
  }
  return '—'
}

function fmtDate(dateStr: string) {
  return format(parseISO(dateStr), 'EEE d MMM yyyy')
}

// ── Main component ─────────────────────────────────────────────────────────

export function ClassesView() {
  const searchParams = useSearchParams()
  const [classes, setClasses]       = useState<ClassSummary[]>([])
  const [archivedClasses, setArchivedClasses] = useState<ClassSummary[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail]         = useState<ClassDetail | null>(null)
  const [terms, setTerms]           = useState<TermGroup[]>([])
  const [allStaff, setAllStaff]     = useState<StaffOption[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [search, setSearch]         = useState('')

  // Schedule editor
  const [editSchedule, setEditSchedule]     = useState(false)
  const [schedDay, setSchedDay]             = useState<number>(0)
  const [schedStart, setSchedStart]         = useState('')
  const [schedEnd, setSchedEnd]             = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Next term / init
  const [addingTerm, setAddingTerm]   = useState(false)
  const [initDate, setInitDate]       = useState('')
  const [initialisingTerm, setInitialisingTerm] = useState(false)

  async function loadClasses() {
    const [activeRes, archivedRes] = await Promise.all([
      fetch('/api/classes'),
      fetch('/api/classes?archived=true'),
    ])
    if (activeRes.ok) setClasses(await activeRes.json())
    if (archivedRes.ok) setArchivedClasses(await archivedRes.json())
  }

  async function toggleArchive(classId: number, archive: boolean) {
    const res = await fetch(`/api/classes/${classId}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: archive }),
    })
    if (res.ok) {
      if (selectedId === classId) {
        setSelectedId(null)
        setDetail(null)
      }
      await loadClasses()
    }
  }

  async function loadStaff() {
    const res = await fetch('/api/staff')
    if (res.ok) setAllStaff(await res.json())
  }

  async function loadDetail(id: number) {
    setLoadingDetail(true)
    const [detailRes, sessionsRes] = await Promise.all([
      fetch(`/api/classes/${id}`),
      fetch(`/api/classes/${id}/sessions`),
    ])
    if (detailRes.ok) {
      const d = await detailRes.json()
      setDetail(d)
      setSchedDay(d.dayOfWeek ?? 1)
      setSchedStart(d.startTime ?? '')
      setSchedEnd(d.endTime ?? '')
      if (d.recurrenceStart) {
        setInitDate(d.recurrenceStart.split('T')[0])
      }
    }
    if (sessionsRes.ok) setTerms(await sessionsRes.json())
    setLoadingDetail(false)
  }

  useEffect(() => {
    async function init() {
      await Promise.all([loadClasses(), loadStaff()])
      // Auto-select class from URL param (e.g. /classes?id=5)
      const idParam = searchParams.get('id')
      if (idParam) {
        const id = Number(idParam)
        if (!isNaN(id)) selectClass(id)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectClass(id: number) {
    setSelectedId(id)
    setDetail(null)
    setTerms([])
    setEditSchedule(false)
    setInitDate('')
    loadDetail(id)
  }

  async function saveSchedule() {
    if (!selectedId) return
    setSavingSchedule(true)
    await fetch(`/api/classes/${selectedId}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayOfWeek: schedDay, startTime: schedStart, endTime: schedEnd }),
    })
    setSavingSchedule(false)
    setEditSchedule(false)
    await Promise.all([loadClasses(), loadDetail(selectedId)])
  }

  async function doAddNextTerm() {
    if (!selectedId) return
    setAddingTerm(true)
    await fetch(`/api/classes/${selectedId}/next-term`, { method: 'POST' })
    setAddingTerm(false)
    loadDetail(selectedId)
  }

  async function doInitTerm() {
    if (!selectedId || !initDate) return
    setInitialisingTerm(true)
    await fetch(`/api/classes/${selectedId}/init-term`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: initDate }),
    })
    setInitialisingTerm(false)
    loadDetail(selectedId)
  }

  const displayed = classes
    .filter(c => {
      const q = search.toLowerCase()
      if (!q) return true
      const name = `yr ${c.yearLevel.level} ${c.subject.name}`.toLowerCase()
      return name.includes(q) || c.staff.name.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (a.yearLevel.level !== b.yearLevel.level) return b.yearLevel.level - a.yearLevel.level
      return a.subject.name.localeCompare(b.subject.name)
    })

  const colour = detail ? subjectColour(detail.subject.name, detail.yearLevel.level) : '#75A9D3'

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* ── LEFT: class list ─────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-100 bg-white">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-[#002F67]">Classes</h1>
            <Link
              href="/classes/new"
              className="flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:shadow-md hover:bg-[#011f42] transition-all duration-200"
            >
              <Plus className="h-3 w-3" />
              New
            </Link>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search classes…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40 transition-all"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayed.map(cls => {
            const col = subjectColour(cls.subject.name, cls.yearLevel.level)
            const active = selectedId === cls.id
            return (
              <button
                key={cls.id}
                onClick={() => selectClass(cls.id)}
                className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-all duration-200 border-b border-gray-50 ${
                  active
                    ? 'bg-blue-50/80 border-l-3 border-l-[#002F67]'
                    : 'border-l-3 border-l-transparent hover:bg-gray-50'
                }`}
              >
                <div
                  className="h-3.5 w-3.5 rounded-full flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: col }}
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${active ? 'text-[#002F67]' : 'text-gray-800'}`}>
                    Yr {cls.yearLevel.level} {cls.subject.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {cls.staff.name} · {scheduleLabel(cls)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {cls._count.enrolments}/{cls.maxCapacity} enrolled
                  </p>
                </div>
              </button>
            )
          })}
          {displayed.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400">
              {search ? `No classes match "${search}"` : 'No classes yet'}
            </div>
          )}
        </div>

        {/* Archived classes dropdown */}
        {archivedClasses.length > 0 && (
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowArchived(v => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <span>Archived ({archivedClasses.length})</span>
              {showArchived ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showArchived && (
              <div className="max-h-64 overflow-y-auto bg-gray-50/40">
                {archivedClasses.map(cls => {
                  const col = subjectColour(cls.subject.name, cls.yearLevel.level)
                  const active = selectedId === cls.id
                  return (
                    <button
                      key={cls.id}
                      onClick={() => selectClass(cls.id)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-all duration-200 border-b border-gray-100 opacity-60 hover:opacity-100 ${
                        active ? 'bg-blue-50/80 border-l-3 border-l-[#002F67] opacity-100' : 'border-l-3 border-l-transparent hover:bg-white'
                      }`}
                    >
                      <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: col }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">
                          Yr {cls.yearLevel.level} {cls.subject.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {cls.staff.name}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT: class detail ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedId && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <BookOpen className="h-10 w-10 text-gray-300" />
            <p className="text-sm">Select a class to view details</p>
          </div>
        )}
        {selectedId && loadingDetail && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Loading…
          </div>
        )}
        {detail && !loadingDetail && (
          <div className="max-w-2xl mx-auto p-6 space-y-5">

            {/* Header card */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="h-2 w-full" style={{ backgroundColor: colour }} />
              <div className="px-6 py-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[#002F67]">
                      Yr {detail.yearLevel.level} {detail.subject.name}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {detail.staff.name}
                      {detail.room && ` · ${detail.room.name}`}
                      {' · '}{scheduleLabel(detail)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleArchive(detail.id, !detail.archived)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                    >
                      {detail.archived ? 'Unarchive' : 'Archive'}
                    </button>
                    <Link
                      href={`/classes/${detail.id}/edit`}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                    >
                      Edit Class
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Enrolled students */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-5">
              <h3 className="text-xs font-bold text-[#002F67]/60 uppercase tracking-wider mb-3 flex items-center gap-2">
                <UserCircle className="h-4 w-4" />
                Enrolled Students ({detail.enrolments.length}/{detail.maxCapacity})
              </h3>
              {detail.enrolments.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No students enrolled</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.enrolments.map(e => (
                    <Link
                      key={e.id}
                      href="/students"
                      className="inline-flex items-center gap-2 rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-[#002F67] transition-all duration-200"
                    >
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: colour }} />
                      {e.student.name} {e.student.lastName ?? ''}
                      <span className="text-gray-400 font-normal">Yr {e.student.yearLevel.level}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recurring schedule editor */}
            {detail.isRecurring && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-[#002F67]/60 uppercase tracking-wider flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Recurring Schedule
                  </h3>
                  {!editSchedule && (
                    <button
                      onClick={() => setEditSchedule(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#002F67] hover:underline transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>
                {editSchedule ? (
                  <div className="space-y-3">
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 leading-relaxed">
                      Only sessions after today will be updated. Manually-edited dates are preserved.
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Day</label>
                        <select
                          value={schedDay}
                          onChange={e => setSchedDay(Number(e.target.value))}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                        >
                          {DAY_NAMES.map((d, i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Start</label>
                        <input
                          type="time"
                          value={schedStart}
                          onChange={e => setSchedStart(e.target.value)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">End</label>
                        <input
                          type="time"
                          value={schedEnd}
                          onChange={e => setSchedEnd(e.target.value)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveSchedule}
                        disabled={savingSchedule}
                        className="rounded-lg px-4 py-2 text-xs font-medium bg-[#002F67] text-white shadow-md hover:shadow-lg hover:bg-[#011f42] disabled:opacity-50 transition-all duration-200"
                      >
                        {savingSchedule ? 'Saving…' : 'Save & Regenerate'}
                      </button>
                      <button
                        onClick={() => setEditSchedule(false)}
                        className="rounded-lg px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    Every <strong className="text-[#002F67]">{DAY_NAMES[detail.dayOfWeek!]}</strong> {detail.startTime}–{detail.endTime}
                  </p>
                )}
              </div>
            )}

            {/* Terms & sessions */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-[#002F67]/60 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Sessions
                </h3>
                {detail.isRecurring && terms.length > 0 && (
                  <button
                    onClick={doAddNextTerm}
                    disabled={addingTerm}
                    className="flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:shadow-md hover:bg-[#011f42] disabled:opacity-50 transition-all duration-200"
                  >
                    <Plus className="h-3 w-3" />
                    {addingTerm ? 'Adding…' : 'Add Next Term'}
                  </button>
                )}
              </div>

              {/* Init Term 1 */}
              {terms.length === 0 && detail.isRecurring && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-5 py-5 space-y-3">
                  <p className="text-sm text-[#002F67]/70">
                    No sessions yet. Pick the start date to initialise Term 1 (10 weekly sessions).
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="date"
                      value={initDate}
                      onChange={e => setInitDate(e.target.value)}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                    />
                    <button
                      onClick={doInitTerm}
                      disabled={!initDate || initialisingTerm}
                      className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-[#002F67] text-white shadow-md hover:shadow-lg hover:bg-[#011f42] disabled:opacity-50 transition-all duration-200"
                    >
                      <Plus className="h-3 w-3" />
                      {initialisingTerm ? 'Initialising…' : 'Initialise Term 1'}
                    </button>
                  </div>
                </div>
              )}

              {terms.length === 0 && !detail.isRecurring && (
                <p className="text-sm text-gray-400 italic">No sessions yet</p>
              )}

              <div className="space-y-6 mt-2">
                {terms.map(term => (
                  <TermSection
                    key={term.term}
                    term={term}
                    colour={colour}
                    defaultStaffId={detail.staff.id}
                    defaultStaffName={detail.staff.name}
                    allStaff={allStaff}
                    onSessionUpdated={() => loadDetail(selectedId!)}
                  />
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

// ── TermSection ────────────────────────────────────────────────────────────

function TermSection({
  term,
  colour,
  defaultStaffId,
  defaultStaffName,
  allStaff,
  onSessionUpdated,
}: {
  term: TermGroup
  colour: string
  defaultStaffId: number
  defaultStaffName: string
  allStaff: StaffOption[]
  onSessionUpdated: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-3 w-full mb-2 group"
      >
        <div className="h-px flex-1 bg-gradient-to-r from-transparent" style={{ '--tw-gradient-to': colour + '40' } as React.CSSProperties} />
        <span className="text-xs font-bold text-[#002F67]/50 uppercase tracking-wider px-2">
          Term {term.term}
        </span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent" style={{ '--tw-gradient-to': colour + '40' } as React.CSSProperties} />
        {collapsed
          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#002F67] transition-colors" />
          : <ChevronUp className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#002F67] transition-colors" />}
      </button>

      {!collapsed && (
        <div className="space-y-0.5">
          {term.weeks.map(week => (
            <WeekRow
              key={week.id}
              week={week}
              termNumber={term.term}
              colour={colour}
              defaultStaffId={defaultStaffId}
              defaultStaffName={defaultStaffName}
              allStaff={allStaff}
              onUpdated={onSessionUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── WeekRow ────────────────────────────────────────────────────────────────

interface AttendanceRow {
  studentId: number
  name: string
  lastName: string | null
  present: boolean
}

function WeekRow({
  week,
  termNumber,
  colour,
  defaultStaffId,
  defaultStaffName,
  allStaff,
  onUpdated,
}: {
  week: SessionWeek
  termNumber: number
  colour: string
  defaultStaffId: number
  defaultStaffName: string
  allStaff: StaffOption[]
  onUpdated: () => void
}) {
  const [editingDate, setEditingDate]     = useState(false)
  const [editingStaff, setEditingStaff]   = useState(false)
  const [newDate, setNewDate]             = useState(week.date)
  const [saving, setSaving]               = useState(false)
  const [expanded, setExpanded]           = useState(false)
  const [attendance, setAttendance]       = useState<AttendanceRow[] | null>(null)
  const [loadingAttendance, setLoadingAttendance] = useState(false)

  async function loadAttendance() {
    setLoadingAttendance(true)
    try {
      const res = await fetch(`/api/sessions/${week.id}/attendance`)
      if (res.ok) setAttendance(await res.json())
    } finally {
      setLoadingAttendance(false)
    }
  }

  async function toggleAttendance(studentId: number, present: boolean) {
    // Optimistic update
    setAttendance(prev => prev?.map(a => a.studentId === studentId ? { ...a, present } : a) ?? null)
    await fetch(`/api/sessions/${week.id}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, present }),
    })
  }

  function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && attendance === null) loadAttendance()
  }

  const presentCount = attendance?.filter(a => a.present).length ?? 0
  const totalStudents = attendance?.length ?? 0

  const effectiveStaffId   = week.staffId ?? defaultStaffId
  const effectiveStaffName = week.staffId ? (week.staffName ?? defaultStaffName) : defaultStaffName
  const isStaffOverridden  = week.staffId !== null && week.staffId !== defaultStaffId
  const isDateChanged      = week.originalDate !== null && week.originalDate !== week.date

  async function saveDate() {
    setSaving(true)
    await fetch(`/api/sessions/${week.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newDate }),
    })
    setSaving(false)
    setEditingDate(false)
    onUpdated()
  }

  async function revertDate() {
    if (!week.originalDate) return
    setSaving(true)
    await fetch(`/api/sessions/${week.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: week.originalDate }),
    })
    setSaving(false)
    onUpdated()
  }

  async function saveStaff(staffId: number | null) {
    setSaving(true)
    await fetch(`/api/sessions/${week.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId }),
    })
    setSaving(false)
    setEditingStaff(false)
    onUpdated()
  }

  return (
    <div className={`rounded-xl ${week.cancelled ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2 py-2 px-2 rounded-xl hover:bg-blue-50/50 transition-all duration-200 group">
      {/* Expand toggle */}
      <button
        onClick={toggleExpand}
        disabled={week.cancelled}
        className="rounded-md p-0.5 text-gray-400 hover:text-[#002F67] hover:bg-blue-50 transition-all flex-shrink-0 disabled:cursor-not-allowed"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {/* Colour bar */}
      <div className="w-0.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: colour, opacity: 0.6 }} />

      {/* Week label */}
      <span className="text-xs font-semibold text-[#002F67]/40 w-12 flex-shrink-0">
        W{week.weekNumber}
      </span>

      {/* Date section */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        {editingDate ? (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
              autoFocus
            />
            <button
              onClick={saveDate}
              disabled={saving}
              className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setEditingDate(false); setNewDate(week.date) }}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {isDateChanged ? (
              <>
                <span className="text-xs text-gray-400 line-through">{fmtDate(week.originalDate!)}</span>
                <ArrowRight className="h-3 w-3 text-gray-300" />
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-md px-2 py-0.5">
                  {fmtDate(week.date)}
                </span>
                <button
                  onClick={revertDate}
                  title="Revert to original date"
                  className="rounded-md p-0.5 text-gray-300 hover:text-[#002F67] hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-600">{fmtDate(week.date)}</span>
            )}
            <button
              onClick={() => setEditingDate(true)}
              className="rounded-md p-1 text-gray-300 hover:text-[#002F67] hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Staff section */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {editingStaff ? (
          <div className="flex items-center gap-1.5">
            <select
              defaultValue={effectiveStaffId}
              onChange={e => saveStaff(Number(e.target.value) === defaultStaffId ? null : Number(e.target.value))}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
              autoFocus
              disabled={saving}
            >
              {allStaff.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.id === defaultStaffId ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => setEditingStaff(false)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {isStaffOverridden ? (
              <span className="text-xs font-semibold text-[#002F67] bg-blue-50 rounded-md px-2 py-0.5 border border-blue-100">
                {effectiveStaffName}
              </span>
            ) : (
              <span className="text-xs text-gray-400">{effectiveStaffName}</span>
            )}
            <button
              onClick={() => setEditingStaff(true)}
              className="rounded-md p-1 text-gray-300 hover:text-[#002F67] hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Attendance summary on collapsed row */}
      {!expanded && attendance && totalStudents > 0 && (
        <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
          {presentCount}/{totalStudents}
        </span>
      )}
      </div>

      {/* Expanded attendance panel */}
      {expanded && (
        <div className="ml-12 mr-2 mb-2 px-3 py-2 rounded-xl bg-gray-50/60 border border-gray-100">
          {loadingAttendance && (
            <div className="text-xs text-gray-400">Loading attendance…</div>
          )}
          {!loadingAttendance && attendance && attendance.length === 0 && (
            <div className="text-xs text-gray-400">No students enrolled.</div>
          )}
          {!loadingAttendance && attendance && attendance.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-600">Attendance</span>
                <span className="text-xs text-gray-400">{presentCount}/{totalStudents} present</span>
              </div>
              {attendance.map(row => (
                <div key={row.studentId} className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-white/80 transition-colors">
                  <span className="text-xs text-gray-700">
                    {row.name}{row.lastName ? ` ${row.lastName}` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleAttendance(row.studentId, true)}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                        row.present
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-white text-gray-400 border border-gray-200 hover:bg-emerald-50'
                      }`}
                    >
                      Y
                    </button>
                    <button
                      onClick={() => toggleAttendance(row.studentId, false)}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                        !row.present
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-white text-gray-400 border border-gray-200 hover:bg-rose-50'
                      }`}
                    >
                      N
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
