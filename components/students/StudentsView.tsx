'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { Plus, Mail, Phone, School, BookOpen, StickyNote, AlertCircle, Pencil, Trash2, X, Check, CalendarDays, Clock, ChevronRight } from 'lucide-react'
import { subjectColour } from '@/lib/subject-colours'

// ── Types ────────────────────────────────────────────────────────────────────

interface YearLevel { id: number; level: number }

interface StudentSummary {
  id: number
  name: string
  lastName: string | null
  yearLevel: { id: number; level: number }
  school: string | null
  _count: { enrolments: number }
}

interface EnrolledClass {
  id: number
  class: {
    id: number
    subject: { name: string }
    yearLevel: { level: number }
    staff: { name: string }
    room: { name: string } | null
    isRecurring: boolean
    dayOfWeek: number | null
    startTime: string | null
    endTime: string | null
    sessionDate: string | null
  }
}

interface StudentDetail extends StudentSummary {
  email: string | null
  phone: string | null
  parentFirstName: string | null
  parentLastName: string | null
  parentEmail: string | null
  parentPhone: string | null
  notes: string | null
  enrolments: EnrolledClass[]
  issues: {
    id: number
    type: string
    priority: string
    contactName: string
    note: string | null
    createdAt: string
    resolved: boolean
  }[]
}

interface TimetableSession {
  id: number
  date: string
  originalDate: string | null
  startTime: string
  endTime: string
  classId: number
  subject: string
  yearLevel: number
  staff: string
  staffOverridden: boolean
  room: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DELETE_PASSKEY = 'ABCD1234'

const AVATAR_COLOURS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-teal-100 text-teal-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
]

function avatarColour(yearLevel: number) {
  return AVATAR_COLOURS[Math.min(Math.max(yearLevel - 7, 0), 5)]
}

function initials(first: string, last: string | null) {
  return (first[0] + (last?.[0] ?? '')).toUpperCase()
}

function fullName(s: Pick<StudentSummary, 'name' | 'lastName'>) {
  return s.lastName ? `${s.name} ${s.lastName}` : s.name
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  FREE_TRIAL: 'Free Trial',
  CANCELLATION: 'Cancellation',
  RESCHEDULE: 'Reschedule',
  ENQUIRY: 'Enquiry',
}

const ISSUE_TYPE_COLOURS: Record<string, string> = {
  FREE_TRIAL:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLATION: 'bg-red-50 text-red-700 border-red-200',
  RESCHEDULE:   'bg-amber-50 text-amber-700 border-amber-200',
  ENQUIRY:      'bg-blue-50 text-blue-700 border-blue-200',
}

// ── Component ────────────────────────────────────────────────────────────────

export function StudentsView() {
  const searchParams = useSearchParams()
  const [students, setStudents]           = useState<StudentSummary[]>([])
  const [yearLevels, setYearLevels]       = useState<YearLevel[]>([])
  const [search, setSearch]               = useState('')
  const [selectedId, setSelectedId]       = useState<number | null>(null)
  const [selected, setSelected]           = useState<StudentDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // timetable
  const [timetable, setTimetable] = useState<TimetableSession[]>([])

  // notes
  const [notes, setNotes]             = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved]   = useState(false)

  // edit
  const [editing, setEditing]   = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)

  // delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [passkey, setPasskey]             = useState('')
  const [passkeyError, setPasskeyError]   = useState(false)
  const [deleting, setDeleting]           = useState(false)

  useEffect(() => {
    async function init() {
      const [studentsRes, ylRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/year-levels'),
      ])
      if (studentsRes.ok) setStudents(await studentsRes.json())
      if (ylRes.ok) setYearLevels(await ylRes.json())
      // Auto-select student from URL param (e.g. /students?id=5)
      const idParam = searchParams.get('id')
      if (idParam) {
        const id = Number(idParam)
        if (!isNaN(id)) selectStudent(id)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function selectStudent(id: number) {
    if (id === selectedId) return
    setSelectedId(id)
    setLoadingDetail(true)
    setSelected(null)
    setTimetable([])
    setEditing(false)
    setConfirmDelete(false)
    try {
      const [detailRes, ttRes] = await Promise.all([
        fetch(`/api/students/${id}`),
        fetch(`/api/students/${id}/timetable`),
      ])
      const data: StudentDetail = await detailRes.json()
      setSelected(data)
      setNotes(data.notes ?? '')
      if (ttRes.ok) setTimetable(await ttRes.json())
    } finally {
      setLoadingDetail(false)
    }
  }

  function startEdit() {
    if (!selected) return
    setEditForm({
      name:            selected.name,
      lastName:        selected.lastName        ?? '',
      email:           selected.email           ?? '',
      phone:           selected.phone           ?? '',
      school:          selected.school          ?? '',
      yearLevelId:     String(selected.yearLevel.id),
      parentFirstName: selected.parentFirstName ?? '',
      parentLastName:  selected.parentLastName  ?? '',
      parentEmail:     selected.parentEmail     ?? '',
      parentPhone:     selected.parentPhone     ?? '',
    })
    setEditing(true)
    setConfirmDelete(false)
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(editForm)) {
      body[k] = k === 'yearLevelId' ? Number(v) : (v.trim() || null)
    }
    const res = await fetch(`/api/students/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const updated = await res.json()
    // refresh list + detail
    const yl = yearLevels.find(y => y.id === updated.yearLevelId) ?? selected.yearLevel
    const updatedDetail: StudentDetail = {
      ...selected,
      ...updated,
      yearLevel: yl,
    }
    setSelected(updatedDetail)
    setStudents(prev => prev.map(s =>
      s.id === selected.id
        ? { ...s, name: updated.name, lastName: updated.lastName, school: updated.school, yearLevel: yl }
        : s
    ))
    setSaving(false)
    setEditing(false)
  }

  async function saveNotes() {
    if (!selected) return
    setSavingNotes(true)
    await fetch(`/api/students/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  async function deleteStudent() {
    if (passkey !== DELETE_PASSKEY) {
      setPasskeyError(true)
      return
    }
    if (!selected) return
    setDeleting(true)
    await fetch(`/api/students/${selected.id}`, { method: 'DELETE' })
    setStudents(prev => prev.filter(s => s.id !== selected.id))
    setSelected(null)
    setSelectedId(null)
    setConfirmDelete(false)
    setPasskey('')
    setDeleting(false)
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-3rem)]">

      {/* ── Left panel: student list ─────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-zinc-100 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-zinc-900">Students</h1>
            <Link
              href="/students/new"
              className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add
            </Link>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
          {students.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <p className="text-sm text-zinc-400">No students yet.</p>
              <Link href="/students/new" className="mt-2 text-xs text-indigo-600 hover:underline">
                Add your first student
              </Link>
            </div>
          )}
          {(() => {
            const q = search.trim().toLowerCase()
            const visible = students
              .filter(s => {
                if (!q) return true
                const name = fullName(s).toLowerCase()
                const school = (s.school ?? '').toLowerCase()
                const yr = `year ${s.yearLevel.level}`
                return name.includes(q) || school.includes(q) || yr.includes(q)
              })
              .sort((a, b) => {
                if (a.yearLevel.level !== b.yearLevel.level)
                  return b.yearLevel.level - a.yearLevel.level
                return fullName(a).localeCompare(fullName(b))
              })
            if (visible.length === 0 && search.trim())
              return (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <p className="text-sm text-zinc-400">No students match "{search}"</p>
                </div>
              )
            return visible.map(s => (
            <button
              key={s.id}
              onClick={() => selectStudent(s.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-zinc-50 ${
                selectedId === s.id
                  ? 'bg-zinc-50 border-l-2 border-l-zinc-900'
                  : 'border-l-2 border-l-transparent'
              }`}
            >
              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarColour(s.yearLevel.level)}`}>
                {initials(s.name, s.lastName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 truncate">{fullName(s)}</p>
                <p className="text-xs text-zinc-400 truncate">
                  Yr {s.yearLevel.level}{s.school ? ` · ${s.school}` : ''}
                </p>
                <p className="text-[11px] text-zinc-300 mt-0.5">
                  {s._count.enrolments} class{s._count.enrolments !== 1 ? 'es' : ''}
                </p>
              </div>
            </button>
            ))
          })()}
        </div>
      </div>

      {/* ── Right panel: student detail ──────────────────────────────────── */}
      <div className="flex-1 rounded-xl border border-zinc-200 bg-white shadow-sm overflow-y-auto">
        {!selectedId && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Select a student to view their profile
          </div>
        )}

        {selectedId && loadingDetail && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Loading…
          </div>
        )}

        {selected && !loadingDetail && (
          <div className="p-6">

            {/* ── Full-width header ────────────────────────────────── */}
            <div className="flex items-start gap-4 mb-6">
              <div className={`h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0 ${avatarColour(selected.yearLevel.level)}`}>
                {initials(selected.name, selected.lastName)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-zinc-900">{fullName(selected)}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs bg-zinc-100 text-zinc-600 rounded-full px-2.5 py-0.5 font-medium">
                    Year {selected.yearLevel.level}
                  </span>
                  {selected.school && (
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <School className="h-3 w-3" />
                      {selected.school}
                    </span>
                  )}
                </div>
              </div>
              {!editing && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={startEdit}
                    className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(true); setPasskey(''); setPasskeyError(false) }}
                    className="flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              )}
            </div>

            {/* Delete confirmation (full width) */}
            {confirmDelete && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-2 mb-6">
                <p className="text-sm font-medium text-red-700">Delete {fullName(selected)}?</p>
                <p className="text-xs text-red-500">This cannot be undone. Enter the passkey to confirm.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={passkey}
                    onChange={e => { setPasskey(e.target.value); setPasskeyError(false) }}
                    placeholder="Passkey"
                    className={`rounded border px-2.5 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 ${
                      passkeyError ? 'border-red-400 focus:ring-red-300' : 'border-zinc-300 focus:ring-zinc-400'
                    }`}
                    onKeyDown={e => e.key === 'Enter' && deleteStudent()}
                    autoFocus
                  />
                  <button
                    onClick={deleteStudent}
                    disabled={deleting}
                    className="rounded-md bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {passkeyError && (
                  <p className="text-xs text-red-600 font-medium">Incorrect passkey.</p>
                )}
              </div>
            )}

            {/* Edit form (full width) */}
            {editing && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 py-4 space-y-4 mb-6">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Student</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name">
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Last Name">
                    <input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Year Level">
                    <select value={editForm.yearLevelId} onChange={e => setEditForm(f => ({ ...f, yearLevelId: e.target.value }))} className={inputCls}>
                      {yearLevels.map(y => (
                        <option key={y.id} value={y.id}>Year {y.level}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="School">
                    <input value={editForm.school} onChange={e => setEditForm(f => ({ ...f, school: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Student Email">
                    <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Student Mobile">
                    <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
                  </Field>
                </div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide pt-1">Parent / Guardian</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name">
                    <input value={editForm.parentFirstName} onChange={e => setEditForm(f => ({ ...f, parentFirstName: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Last Name">
                    <input value={editForm.parentLastName} onChange={e => setEditForm(f => ({ ...f, parentLastName: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Parent Email">
                    <input type="email" value={editForm.parentEmail} onChange={e => setEditForm(f => ({ ...f, parentEmail: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Parent Mobile">
                    <input value={editForm.parentPhone} onChange={e => setEditForm(f => ({ ...f, parentPhone: e.target.value }))} className={inputCls} />
                  </Field>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Two-column layout: Info | Timetable ──────────── */}
            <div className="grid grid-cols-[1fr_1fr] gap-6">

              {/* LEFT — student info */}
              <div className="space-y-8 min-w-0">
                {/* Contact info (view mode only) */}
                {!editing && (
                  <section>
                    <SectionHeading>Contact</SectionHeading>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-3">
                      <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Student Email" value={selected.email} />
                      <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Student Mobile" value={selected.phone} />
                      <InfoRow
                        label="Parent"
                        value={[selected.parentFirstName, selected.parentLastName].filter(Boolean).join(' ') || null}
                      />
                      <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Parent Email" value={selected.parentEmail} />
                      <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Parent Mobile" value={selected.parentPhone} />
                    </div>
                  </section>
                )}

                {/* Enrolled classes */}
                <section>
                  <SectionHeading icon={<BookOpen className="h-3.5 w-3.5" />}>
                    Enrolled Classes
                  </SectionHeading>
                  <div className="mt-3 space-y-2">
                    {selected.enrolments.length === 0 && (
                      <p className="text-sm text-zinc-400">Not enrolled in any classes yet.</p>
                    )}
                    {selected.enrolments.map(e => (
                      <EnrolmentCard
                        key={e.id}
                        enrolment={e}
                        onRemove={async () => {
                          await fetch(`/api/classes/${e.class.id}/enrolments`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ studentId: selected.id }),
                          })
                          selectStudent(selected.id)
                        }}
                      />
                    ))}
                    <EnrolClassPicker
                      studentId={selected.id}
                      currentClassIds={selected.enrolments.map(e => e.class.id)}
                      onEnrolled={() => selectStudent(selected.id)}
                    />
                  </div>
                </section>

                {/* Notes */}
                <section>
                  <SectionHeading icon={<StickyNote className="h-3.5 w-3.5" />}>
                    Admin Notes
                  </SectionHeading>
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={notes}
                      onChange={e => { setNotes(e.target.value); setNotesSaved(false) }}
                      placeholder="Add notes about this student, parent communications, special requirements, payment history…"
                      className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none placeholder:text-zinc-400 leading-relaxed"
                      rows={4}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveNotes}
                        disabled={savingNotes}
                        className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                      >
                        {savingNotes ? 'Saving…' : 'Save Notes'}
                      </button>
                      {notesSaved && <span className="text-xs text-emerald-600">Saved</span>}
                    </div>
                  </div>
                </section>

                {/* Flagged issues */}
                <section>
                  <SectionHeading icon={<AlertCircle className="h-3.5 w-3.5" />}>
                    Flagged Issues
                    {selected.issues.filter(i => !i.resolved).length > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-100 text-red-600 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
                        {selected.issues.filter(i => !i.resolved).length} open
                      </span>
                    )}
                  </SectionHeading>
                  <div className="mt-3 space-y-2">
                    {selected.issues.length === 0 && (
                      <p className="text-sm text-zinc-400">No issues linked to this student.</p>
                    )}
                    {selected.issues.map(issue => (
                      <div
                        key={issue.id}
                        className={`rounded-lg border px-3.5 py-2.5 ${
                          issue.resolved ? 'border-zinc-100 bg-zinc-50/30 opacity-60' : 'border-zinc-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ISSUE_TYPE_COLOURS[issue.type] ?? 'bg-zinc-50 text-zinc-600 border-zinc-200'}`}>
                            {ISSUE_TYPE_LABELS[issue.type] ?? issue.type}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {format(new Date(issue.createdAt), 'd MMM yyyy')}
                          </span>
                          {issue.resolved ? (
                            <span className="text-xs text-emerald-500 font-medium">Resolved</span>
                          ) : (
                            <span className="text-xs text-amber-500 font-medium">Open</span>
                          )}
                        </div>
                        {issue.note && (
                          <p className="mt-1.5 text-xs text-zinc-500 line-clamp-3 leading-relaxed">{issue.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* RIGHT — class timetable */}
              <div className="min-w-0 border-l border-zinc-100 pl-6">
                <SectionHeading icon={<CalendarDays className="h-3.5 w-3.5" />}>
                  Class Timetable
                </SectionHeading>
                <StudentTimetable sessions={timetable} />
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-zinc-500 font-medium">{label}</p>
      {children}
    </div>
  )
}

function SectionHeading({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide border-b border-zinc-100 pb-2">
      {icon && <span className="text-zinc-400">{icon}</span>}
      {children}
    </div>
  )
}

function EnrolmentCard({ enrolment: e, onRemove }: { enrolment: EnrolledClass; onRemove: () => void }) {
  const [removing, setRemoving] = useState(false)
  const colour = subjectColour(e.class.subject.name, e.class.yearLevel.level)

  async function handleRemove() {
    setRemoving(true)
    await onRemove()
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-zinc-100 px-3.5 py-2.5 group ${removing ? 'opacity-50' : ''}`}
      style={{ borderLeftColor: colour, borderLeftWidth: 4 }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-900">{e.class.subject.name}</span>
          <span className="text-xs rounded-full px-2 py-0.5 font-medium text-white" style={{ backgroundColor: colour }}>
            Yr {e.class.yearLevel.level}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {e.class.isRecurring && e.class.dayOfWeek !== null ? (
            <span className="text-xs text-zinc-500">
              Every {DAY_NAMES[e.class.dayOfWeek]} {e.class.startTime}–{e.class.endTime}
            </span>
          ) : e.class.sessionDate ? (
            <span className="text-xs text-zinc-500">
              {format(new Date(e.class.sessionDate), 'd MMM yyyy')} {e.class.startTime}–{e.class.endTime}
            </span>
          ) : null}
          <span className="text-xs text-zinc-400">with {e.class.staff.name}</span>
          {e.class.room && <span className="text-xs text-zinc-400">{e.class.room.name}</span>}
        </div>
      </div>
      <button
        onClick={handleRemove}
        disabled={removing}
        className="rounded p-1 text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
        title="Remove from class"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function EnrolClassPicker({
  studentId,
  currentClassIds,
  onEnrolled,
}: {
  studentId: number
  currentClassIds: number[]
  onEnrolled: () => void
}) {
  const [open, setOpen] = useState(false)
  const [classes, setClasses] = useState<{ id: number; subject: { name: string }; yearLevel: { level: number }; staff: { name: string }; dayOfWeek: number | null; startTime: string | null; endTime: string | null }[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState<number | null>(null)

  async function openPicker() {
    setLoading(true)
    const res = await fetch('/api/classes')
    if (res.ok) setClasses(await res.json())
    setLoading(false)
    setOpen(true)
  }

  async function enrol(classId: number) {
    setEnrolling(classId)
    await fetch(`/api/classes/${classId}/enrolments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    })
    setEnrolling(null)
    setOpen(false)
    setSearch('')
    onEnrolled()
  }

  const available = classes.filter(c =>
    !currentClassIds.includes(c.id) &&
    `yr ${c.yearLevel.level} ${c.subject.name}`.toLowerCase().includes(search.toLowerCase())
  )

  if (!open) {
    return (
      <button
        onClick={openPicker}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline mt-1"
      >
        <Plus className="h-3 w-3" />
        {loading ? 'Loading…' : 'Enrol in class'}
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm mt-1 overflow-hidden">
      <div className="flex items-center gap-1 p-2 border-b border-zinc-100">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search classes…"
          className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
          autoFocus
        />
        <button onClick={() => { setOpen(false); setSearch('') }} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto">
        {available.length === 0 && (
          <p className="px-3 py-2 text-xs text-zinc-400">{search ? 'No matching classes' : 'Already enrolled in all classes'}</p>
        )}
        {available.map(c => (
          <button
            key={c.id}
            onClick={() => enrol(c.id)}
            disabled={enrolling === c.id}
            className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 transition-colors flex items-center justify-between disabled:opacity-50"
          >
            <span className="font-medium text-zinc-800">Yr {c.yearLevel.level} {c.subject.name}</span>
            <span className="text-zinc-400">
              {c.dayOfWeek != null && `${DAY_NAMES[c.dayOfWeek]} ${c.startTime}–${c.endTime}`}
              {' · '}{c.staff.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function StudentTimetable({ sessions }: { sessions: TimetableSession[] }) {
  if (sessions.length === 0) {
    return <p className="mt-3 text-sm text-zinc-400">No scheduled sessions.</p>
  }

  // Split into past and upcoming based on today
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = sessions.filter(s => s.date >= todayStr)
  const past = sessions.filter(s => s.date < todayStr)

  // Group upcoming sessions by week
  function weekKey(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const start = new Date(d)
    start.setDate(d.getDate() - d.getDay()) // Sunday
    return start.toISOString().slice(0, 10)
  }

  const weeks = new Map<string, TimetableSession[]>()
  for (const s of upcoming) {
    const wk = weekKey(s.date)
    if (!weeks.has(wk)) weeks.set(wk, [])
    weeks.get(wk)!.push(s)
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Upcoming sessions */}
      {Array.from(weeks.entries()).slice(0, 6).map(([wkStart, wkSessions]) => {
        const wkDate = new Date(wkStart + 'T00:00:00')
        const wkEnd = new Date(wkDate)
        wkEnd.setDate(wkDate.getDate() + 6)
        const label = `${format(wkDate, 'd MMM')} – ${format(wkEnd, 'd MMM yyyy')}`
        return (
          <div key={wkStart}>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{label}</p>
            <div className="space-y-1">
              {wkSessions.map(s => (
                <TimetableRow key={s.id} session={s} />
              ))}
            </div>
          </div>
        )
      })}

      {upcoming.length === 0 && (
        <p className="text-sm text-zinc-400">No upcoming sessions.</p>
      )}

      {/* Past sessions — collapsed */}
      {past.length > 0 && (
        <details className="group">
          <summary className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-500 transition-colors list-none flex items-center gap-1">
            <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
            Past sessions ({past.length})
          </summary>
          <div className="mt-2 space-y-1 opacity-60">
            {past.slice(-20).map(s => (
              <TimetableRow key={s.id} session={s} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function TimetableRow({ session: s }: { session: TimetableSession }) {
  const colour = subjectColour(s.subject, s.yearLevel)
  const isDateChanged = s.originalDate !== null && s.originalDate !== s.date

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2 hover:bg-zinc-50/50 transition-colors"
      style={{ borderLeftColor: colour, borderLeftWidth: 3 }}
    >
      {/* Date */}
      <div className="w-24 flex-shrink-0">
        {isDateChanged ? (
          <div>
            <p className="text-xs text-zinc-400 line-through">{format(new Date(s.originalDate! + 'T00:00:00'), 'EEE d MMM')}</p>
            <p className="text-xs font-semibold text-amber-700">{format(new Date(s.date + 'T00:00:00'), 'EEE d MMM')}</p>
          </div>
        ) : (
          <p className="text-xs font-medium text-zinc-700">{format(new Date(s.date + 'T00:00:00'), 'EEE d MMM')}</p>
        )}
      </div>

      {/* Time */}
      <div className="flex items-center gap-1 text-xs text-zinc-500 w-24 flex-shrink-0">
        <Clock className="h-3 w-3 text-zinc-400" />
        {s.startTime}–{s.endTime}
      </div>

      {/* Subject */}
      <span className="text-xs font-medium text-zinc-800">
        Yr {s.yearLevel} {s.subject}
      </span>

      {/* Staff */}
      <span className={`text-xs ml-auto ${s.staffOverridden ? 'font-semibold text-blue-700' : 'text-zinc-400'}`}>
        {s.staff}
      </span>

      {/* Room */}
      {s.room && (
        <span className="text-xs text-zinc-400">{s.room}</span>
      )}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      {icon && <span className="text-zinc-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-zinc-400 leading-none mb-0.5">{label}</p>
        <p className="text-sm text-zinc-700 truncate">
          {value ?? <span className="text-zinc-300">—</span>}
        </p>
      </div>
    </div>
  )
}
