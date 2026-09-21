'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, X, ExternalLink, User, MapPin, Users, CalendarClock, Ban, Trash2, Archive, Pencil, Plus } from 'lucide-react'

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

interface ClassDetail {
  id: number
  subject:   { name: string }
  yearLevel: { level: number }
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
    subject: { name: string }
    yearLevel: { level: number }
    staff: { id: number; name: string }
    room: { id: number; name: string } | null
    _count: { enrolments: number }
    enrolments: { student: { id: number; name: string; lastName: string | null } }[]
  }
  attendances: {
    present: boolean
    notifiedAbsent: boolean
    homework: string | null
    student: { id: number; name: string; lastName: string | null }
  }[]
  trials: { student: { id: number; name: string; lastName: string | null } }[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function TermGridView({ termId }: { termId: number }) {
  const [data, setData]       = useState<TermData | null>(null)
  const [loading, setLoading] = useState(true)

  const [selectedClassId, setSelectedClassId]     = useState<number | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [classDetail, setClassDetail]     = useState<ClassDetail | null>(null)
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null)
  const [tick, setTick]                   = useState(0)  // bump to refetch everything

  const reloadGrid = () => setTick(t => t + 1)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/terms/${termId}`, { cache: 'no-store' })
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
  }, [termId, tick])

  useEffect(() => {
    if (selectedClassId == null) { setClassDetail(null); return }
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/classes/${selectedClassId}`, { cache: 'no-store' })
      if (!cancelled && res.ok) setClassDetail(await res.json())
    })()
    return () => { cancelled = true }
  }, [selectedClassId, tick])

  useEffect(() => {
    if (selectedSessionId == null) { setSessionDetail(null); return }
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/sessions/${selectedSessionId}`, { cache: 'no-store' })
      if (!cancelled && res.ok) setSessionDetail(await res.json())
    })()
    return () => { cancelled = true }
  }, [selectedSessionId, tick])

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Loading…</div>
  if (!data)   return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Term not found.</div>

  const { term, grid } = data
  const hasSide = selectedClassId != null || selectedSessionId != null

  return (
    <div className="space-y-5">
      <Link href="/terms" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#002F67]">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to terms
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#002F67]">{term.name}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            W1 begins {fmtDateLong(term.startDate)} · {term.weeks} weeks · {grid.length} classes
          </p>
        </div>
        <Link
          href="/classes/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#011f42]"
        >
          <Plus className="h-3.5 w-3.5" /> New class
        </Link>
      </div>

      <div className="flex gap-4 items-start">
        {/* Left pane — class card */}
        {selectedClassId != null && (
          <aside className="w-72 shrink-0">
            <ClassCard
              detail={classDetail}
              onClose={() => setSelectedClassId(null)}
              onChanged={reloadGrid}
            />
          </aside>
        )}

        {/* Middle — grid (narrows when panels are open) */}
        <div className={`${hasSide ? 'flex-1 min-w-0' : 'flex-1'}`}>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
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
                {grid.map(row => {
                  const selected = selectedClassId === row.classId
                  // Fully opaque sticky bg so scrolled cells don't bleed through.
                  const stickyBg = selected ? 'bg-blue-50' : 'bg-white'
                  return (
                  <tr key={row.classId} className={`border-t border-gray-100 ${selected ? 'bg-blue-50' : ''}`}>
                    <td className={`sticky left-0 z-10 ${stickyBg} px-3 py-2 border-r border-gray-100 shadow-[2px_0_0_-1px_rgb(229_231_235)]`}>
                      <button
                        onClick={() => setSelectedClassId(selected ? null : row.classId)}
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
                      const isSelected = cell?.id === selectedSessionId
                      return (
                        <td key={i} className="px-2 py-2 text-center border-l border-gray-100 first:border-l-0 align-top">
                          {cell ? (
                            <button
                              onClick={() => setSelectedSessionId(isSelected ? null : cell.id)}
                              className={`inline-flex flex-col items-center rounded px-1.5 py-1 leading-tight transition-colors ${
                                isSelected
                                  ? 'ring-2 ring-[#002F67] ring-offset-1 bg-blue-100 text-[#002F67]'
                                  : cell.cancelled
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
                )})}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right pane — session card */}
        {selectedSessionId != null && (
          <aside className="w-80 shrink-0">
            <SessionCard
              detail={sessionDetail}
              onClose={() => setSelectedSessionId(null)}
              onChanged={reloadGrid}
              onDeleted={() => { setSelectedSessionId(null); reloadGrid() }}
            />
          </aside>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        Click a class name to open its info on the left. Click a session cell to open its details on the right.
        Both can be open at once.
      </p>
    </div>
  )
}

// ── Class card ────────────────────────────────────────────────────────────

function ClassCard({ detail, onClose, onChanged }: {
  detail: ClassDetail | null
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<number | null>(null)

  async function removeStudent(studentId: number) {
    if (!detail) return
    if (!confirm('Remove this student from the class? Their attendance history is kept.')) return
    setBusy(studentId)
    try {
      const res = await fetch(`/api/classes/${detail.id}/enrolments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      })
      if (res.ok) onChanged()
    } finally { setBusy(null) }
  }

  async function archive() {
    if (!detail) return
    if (!confirm(`Archive Yr${detail.yearLevel.level} ${detail.subject.name}? Sessions after today will be hidden from schedules.`)) return
    const res = await fetch(`/api/classes/${detail.id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
    if (res.ok) { onClose(); onChanged() }
    else alert('Archive failed')
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden sticky top-4">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Class</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {!detail ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="p-4 space-y-3">
          <div>
            <div className="text-lg font-semibold text-[#002F67]">
              Yr{detail.yearLevel.level} {detail.subject.name}
            </div>
          </div>

          <div className="space-y-1.5 text-sm">
            <Line icon={User}          label="Tutor"     value={detail.staff.name} />
            {detail.isRecurring && detail.dayOfWeek != null && (
              <Line icon={CalendarClock} label="Schedule"
                value={`${DAYS[detail.dayOfWeek]} ${detail.startTime}–${detail.endTime}`} />
            )}
            {detail.room && (
              <Line icon={MapPin}       label="Room"      value={detail.room.name} />
            )}
            <Line icon={Users}          label="Enrolments" value={`${detail.enrolments.length} of ${detail.maxCapacity}`} />
          </div>

          {/* Students with remove */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Students</div>
            {detail.enrolments.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No students enrolled.</p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {detail.enrolments.map(e => (
                  <li key={e.student.id} className="group flex items-center gap-1 text-gray-700">
                    <span className="flex-1 truncate">
                      {e.student.name}{e.student.lastName ? ` ${e.student.lastName}` : ''}
                    </span>
                    <button
                      onClick={() => removeStudent(e.student.id)}
                      disabled={busy === e.student.id}
                      className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                      title="Remove from class"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Action bar */}
          <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2">
            <Link
              href={`/classes/${detail.id}/edit`}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3 w-3" /> Edit
            </Link>
            <Link
              href={`/classes/${detail.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-3 w-3" /> Full page
            </Link>
            <button
              onClick={archive}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
            >
              <Archive className="h-3 w-3" /> Archive
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Session card ──────────────────────────────────────────────────────────

interface PendingAttendance {
  present?:        boolean
  notifiedAbsent?: boolean
  homework?:       HomeworkStatus | null
}

interface StaffOpt { id: number; name: string }

function SessionCard({ detail, onClose, onChanged, onDeleted }: {
  detail: SessionDetail | null
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Map<number, PendingAttendance>>(new Map())
  const [openEditor, setOpenEditor] = useState<null | 'schedule' | 'staff'>(null)
  const [staffOpts, setStaffOpts] = useState<StaffOpt[]>([])

  // Reset pending changes when the selected session changes.
  useEffect(() => {
    setPending(new Map())
    setOpenEditor(null)
  }, [detail?.id])

  // Prefetch staff for the tutor popover.
  useEffect(() => {
    if (staffOpts.length > 0) return
    let cancelled = false
    fetch('/api/staff', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: StaffOpt[]) => { if (!cancelled) setStaffOpts(rows) })
    return () => { cancelled = true }
  }, [staffOpts.length])

  function pendPatch(studentId: number, patch: PendingAttendance) {
    setPending(prev => {
      const next = new Map(prev)
      next.set(studentId, { ...(prev.get(studentId) ?? {}), ...patch })
      return next
    })
  }

  async function saveBatch() {
    if (!detail || pending.size === 0) return
    setBusy(true)
    try {
      const updates = Array.from(pending.entries()).map(([studentId, u]) => ({ studentId, ...u }))
      const res = await fetch(`/api/sessions/${detail.id}/attendance/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (res.ok) {
        setPending(new Map())
        onChanged()
      } else {
        alert('Failed to save attendance')
      }
    } finally { setBusy(false) }
  }

  async function toggleCancel() {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelled: !detail.cancelled }),
      })
      if (res.ok) onChanged()
    } finally { setBusy(false) }
  }

  async function deleteSession() {
    if (!detail) return
    if (!confirm(`Delete session on ${fmtDateLong(detail.date)}? Attendance for this session will also be removed.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${detail.id}`, { method: 'DELETE' })
      if (res.ok) onDeleted()
      else alert('Failed to delete session')
    } finally { setBusy(false) }
  }

  async function saveSchedule(date: string, startTime: string) {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startTime }),
      })
      if (res.ok) { setOpenEditor(null); onChanged() }
      else alert('Failed to save schedule')
    } finally { setBusy(false) }
  }

  async function saveStaff(staffId: number | null) {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      })
      if (res.ok) { setOpenEditor(null); onChanged() }
      else alert('Failed to save staff')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden sticky top-4">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Session</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {!detail ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="p-4 space-y-3">
          <div>
            <div className="text-lg font-semibold text-[#002F67]">
              Yr{detail.yearLevel?.level ?? detail.class.yearLevel.level} {detail.class.subject.name}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {detail.term?.name ?? 'No term'} · Session #{detail.id}
            </div>
          </div>

          {detail.cancelled && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800 font-medium">
              This session is cancelled
            </div>
          )}

          <div className="space-y-1.5 text-sm relative">
            <EditableLine
              icon={CalendarClock} label="When"
              value={
                <span>
                  <div>{fmtDateLong(detail.date)}</div>
                  <div className="text-xs text-gray-500 tabular-nums">{detail.startTime}–{detail.endTime}</div>
                </span>
              }
              onEdit={() => setOpenEditor(openEditor === 'schedule' ? null : 'schedule')}
              isOpen={openEditor === 'schedule'}
              popover={
                <SchedulePopover
                  initialDate={detail.date}
                  initialStart={detail.startTime}
                  onCancel={() => setOpenEditor(null)}
                  onSave={saveSchedule}
                  saving={busy}
                />
              }
            />
            {detail.originalDate && detail.originalDate !== detail.date && (
              <Line icon={CalendarClock} label="Rescheduled from"
                value={<span className="text-amber-700">{fmtDateLong(detail.originalDate)}</span>} />
            )}
            <EditableLine
              icon={User} label={detail.staff ? 'Cover' : 'Tutor'}
              value={
                <span>
                  {detail.staff?.name ?? detail.class.staff.name}
                  {detail.staff && detail.staff.id !== detail.class.staff.id && (
                    <span className="ml-1 text-[10px] font-semibold uppercase text-amber-700">cover</span>
                  )}
                </span>
              }
              onEdit={() => setOpenEditor(openEditor === 'staff' ? null : 'staff')}
              isOpen={openEditor === 'staff'}
              popover={
                <StaffPopover
                  options={staffOpts}
                  defaultStaffId={detail.class.staff.id}
                  currentStaffId={detail.staffId ?? null}
                  onCancel={() => setOpenEditor(null)}
                  onSave={saveStaff}
                  saving={busy}
                />
              }
            />
            {detail.class.room && (
              <Line icon={MapPin} label="Room" value={detail.class.room.name} />
            )}
            <Line icon={Users} label="Enrolments" value={String(detail.class._count.enrolments)} />
          </div>

          <RosterSection detail={detail} pending={pending} onPending={pendPatch} />

          {/* Save/Discard when there are pending attendance changes */}
          {pending.size > 0 && (
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
                  onClick={saveBatch}
                  disabled={busy}
                  className="rounded-md bg-[#002F67] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#011f42] disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2">
            <button
              onClick={toggleCancel}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Ban className="h-3 w-3" /> {detail.cancelled ? 'Un-cancel' : 'Cancel'}
            </button>
            <button
              onClick={deleteSession}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>

          {detail.parentEmailsSentAt && (
            <div className="text-[11px] text-gray-500">
              Parent emails sent {new Date(detail.parentEmailsSentAt).toLocaleString('en-AU')}
            </div>
          )}

          <Link href={`/classes/${detail.class.id}`} className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-[#002F67]">
            Open class page <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

function EditableLine({ icon: Icon, label, value, onEdit, isOpen, popover }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  onEdit: () => void
  isOpen: boolean
  popover: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 relative group">
      <Icon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
          <button
            onClick={onEdit}
            className={`rounded p-0.5 text-gray-300 hover:text-[#002F67] hover:bg-blue-50 transition-all ${
              isOpen ? 'text-[#002F67] bg-blue-50 opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
        </div>
        <div className="text-gray-800">{value}</div>
      </div>
      {isOpen && (
        <div className="absolute left-6 top-full mt-1.5 z-30 rounded-lg border border-gray-200 bg-white shadow-lg p-3 min-w-[220px]">
          {popover}
        </div>
      )}
    </div>
  )
}

function SchedulePopover({ initialDate, initialStart, onSave, onCancel, saving }: {
  initialDate: string
  initialStart: string
  onSave: (date: string, startTime: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [date, setDate]   = useState(initialDate)
  const [start, setStart] = useState(initialStart)
  return (
    <div className="space-y-2">
      <label className="block">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Date</div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
        />
      </label>
      <label className="block">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Start time</div>
        <input
          type="time"
          value={start}
          onChange={e => setStart(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
        />
        <p className="mt-1 text-[10px] text-gray-400">End time is auto-derived from year duration.</p>
      </label>
      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700">Cancel</button>
        <button
          type="button"
          onClick={() => onSave(date, start)}
          disabled={saving}
          className="rounded-md bg-[#002F67] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#011f42] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function StaffPopover({ options, defaultStaffId, currentStaffId, onSave, onCancel, saving }: {
  options: StaffOpt[]
  defaultStaffId: number
  currentStaffId: number | null
  onSave: (staffId: number | null) => void
  onCancel: () => void
  saving: boolean
}) {
  // currentStaffId=null means "use class default"
  const [selected, setSelected] = useState<number>(currentStaffId ?? defaultStaffId)

  function submit() {
    // If they picked the default, send null to clear the override.
    onSave(selected === defaultStaffId ? null : selected)
  }
  return (
    <div className="space-y-2 min-w-[200px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Assigned staff</div>
      <select
        value={selected}
        onChange={e => setSelected(Number(e.target.value))}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white"
      >
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {o.name}{o.id === defaultStaffId ? ' (default)' : ''}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-gray-400">
        Choosing the default clears any cover override on this session.
      </p>
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700">Cancel</button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-md bg-[#002F67] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#011f42] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function Line({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
        <div className="text-gray-800">{value}</div>
      </div>
    </div>
  )
}

const HOMEWORK_CYCLE = ['UNATTEMPTED', 'INCOMPLETE', 'SATISFACTORY', 'EXCELLENT'] as const
type HomeworkStatus = typeof HOMEWORK_CYCLE[number]

function RosterSection({ detail, pending, onPending }: {
  detail:   SessionDetail
  pending:  Map<number, PendingAttendance>
  onPending: (studentId: number, patch: PendingAttendance) => void
}) {
  const enrolledIds = new Set(detail.class.enrolments.map(e => e.student.id))
  const roster = [
    ...detail.class.enrolments.map(e => ({ ...e.student, trial: false })),
    ...detail.trials
      .filter(t => !enrolledIds.has(t.student.id))
      .map(t => ({ ...t.student, trial: true })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const byStudent = new Map(detail.attendances.map(a => [a.student.id, a]))

  // Merge saved attendance with any local pending changes.
  function effectiveState(studentId: number) {
    const saved  = byStudent.get(studentId)
    const patch  = pending.get(studentId)
    return {
      present:        patch?.present        ?? saved?.present        ?? undefined,
      notifiedAbsent: patch?.notifiedAbsent ?? saved?.notifiedAbsent ?? undefined,
      homework:       (patch && 'homework' in patch ? patch.homework : saved?.homework) ?? null,
    }
  }

  // Effective present count for the "3/10" summary.
  let presentEff = 0
  let markedEff  = 0
  for (const s of roster) {
    const eff = effectiveState(s.id)
    if (eff.present === true) presentEff++
    if (eff.present !== undefined || eff.notifiedAbsent !== undefined || eff.homework != null) markedEff++
  }
  const anyMarked = markedEff > 0

  function nextPresenceState(cur: { present?: boolean; notifiedAbsent?: boolean }) {
    // Cycle: unmarked → present → absent → notified-absent → present
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
              <button
                onClick={() => onPending(s.id, nextPresenceState(eff))}
                title="Click to cycle Present → Absent → Notified absent"
              >
                {marked
                  ? <PresenceBadge present={eff.present === true} notified={!!eff.notifiedAbsent} />
                  : <UnmarkedBadge />}
              </button>
              <span className="flex-1 min-w-0 truncate text-gray-700">{name}</span>
              {s.trial && (
                <span className="rounded bg-amber-50 border border-amber-200 px-1 py-0.5 text-[9px] font-semibold text-amber-700">TRIAL</span>
              )}
              <button
                onClick={() => onPending(s.id, { homework: nextHomework(eff.homework) })}
                title="Click to cycle homework status"
              >
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

function UnmarkedBadge() {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded border border-dashed border-gray-300 text-[10px] text-gray-400"
      title="Attendance not marked yet"
    >·</span>
  )
}

function PresenceBadge({ present, notified }: { present: boolean; notified: boolean }) {
  if (present) {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold" title="Present">Y</span>
    )
  }
  if (notified) {
    return (
      <span className="inline-flex h-4 items-center justify-center rounded bg-amber-100 text-amber-700 text-[10px] font-bold px-1" title="Notified absent">N*</span>
    )
  }
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-100 text-rose-700 text-[10px] font-bold" title="Absent">N</span>
  )
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
    <span
      className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide ${s.cls}`}
      title={`Homework: ${status.toLowerCase()}`}
    >
      {s.label}
    </span>
  )
}
