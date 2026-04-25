'use client'

import { useState, useEffect } from 'react'
import { type Issue, type IssueNote, type IssuePriority } from './IssuesPanel'
import {
  CheckCircle, ChevronDown, ChevronUp, ExternalLink,
  Mail, Send, UserCircle, X, Plus,
} from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

const TYPE_LABELS: Record<string, string> = {
  FREE_TRIAL: 'Free Trial',
  CANCELLATION: 'Cancellation',
  RESCHEDULE: 'Reschedule',
  ENQUIRY: 'Enquiry',
}

const TYPE_COLOURS: Record<string, string> = {
  FREE_TRIAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLATION: 'bg-red-50 text-red-700 border-red-200',
  RESCHEDULE: 'bg-amber-50 text-amber-700 border-amber-200',
  ENQUIRY: 'bg-blue-50 text-blue-700 border-blue-200',
}

const PRIORITY_COLOURS: Record<IssuePriority, string> = {
  URGENT: 'bg-red-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-zinc-300',
}

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  URGENT: 'Urgent',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

interface Props {
  issue: Issue
  onUpdate: () => void
}

export function IssueCard({ issue, onUpdate }: Props) {
  const router = useRouter()
  const [expanded, setExpanded]             = useState(false)
  const [resolving, setResolving]           = useState(false)
  const [confirmResolve, setConfirmResolve] = useState(false)
  const [priority, setPriority]             = useState<IssuePriority>(issue.priority)

  // Assignee
  const [assignedTo, setAssignedTo]         = useState(issue.assignedTo ?? '')
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [staff, setStaff]                   = useState<{ id: number; name: string }[]>([])

  // Notes
  const [newNote, setNewNote]   = useState('')
  const [sendingNote, setSendingNote] = useState(false)

  // Link student
  const [linkOpen, setLinkOpen]     = useState(false)
  const [students, setStudents]     = useState<{ id: number; name: string }[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [loadingStudents, setLoadingStudents] = useState(false)

  useEffect(() => {
    setPriority(issue.priority)
    setAssignedTo(issue.assignedTo ?? '')
  }, [issue])

  async function resolve() {
    setResolving(true)
    setConfirmResolve(false)
    await fetch(`/api/issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: true }),
    })
    onUpdate()
  }

  async function changePriority(p: IssuePriority) {
    setPriority(p)
    await fetch(`/api/issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: p }),
    })
    onUpdate()
  }

  async function saveAssignee(name: string) {
    setAssignedTo(name)
    setEditingAssignee(false)
    await fetch(`/api/issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: name || null }),
    })
    onUpdate()
  }

  async function openAssigneePicker() {
    const res = await fetch('/api/staff')
    if (res.ok) setStaff(await res.json())
    setEditingAssignee(true)
  }

  async function addNote() {
    if (!newNote.trim()) return
    setSendingNote(true)
    await fetch(`/api/issues/${issue.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newNote.trim(), author: 'Admin' }),
    })
    setNewNote('')
    setSendingNote(false)
    onUpdate()
  }

  async function openStudentPicker() {
    setLoadingStudents(true)
    const res = await fetch('/api/students')
    setStudents(await res.json())
    setLoadingStudents(false)
    setLinkOpen(true)
  }

  async function linkStudent(studentId: number | null) {
    await fetch(`/api/issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    })
    setLinkOpen(false)
    setStudentSearch('')
    onUpdate()
  }

  const [creatingStudent, setCreatingStudent] = useState(false)
  async function createStudentFromEmail() {
    setCreatingStudent(true)
    try {
      const res = await fetch(`/api/issues/${issue.id}/create-student`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Could not extract student details from this email.')
        return
      }
      onUpdate()
    } finally {
      setCreatingStudent(false)
    }
  }

  function openGmail() {
    if (issue.gmailMessageId) {
      window.open(`https://mail.google.com/mail/u/0/#all/${issue.gmailMessageId}`, '_blank')
    }
  }

  function goToStudent() {
    if (issue.student) {
      router.push(`/students?id=${issue.student.id}`)
    }
  }

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase())
  )

  return (
    <div className={`px-4 py-3 transition-all duration-200 ${expanded ? 'bg-blue-50/40 rounded-xl border border-[#002F67]/15 shadow-sm my-1' : 'hover:bg-zinc-50/30'} ${resolving ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* ── Collapsed row ──────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        {/* Priority dot */}
        <div className="flex-shrink-0">
          <div className={`h-2.5 w-2.5 rounded-full ${PRIORITY_COLOURS[priority]}`} title={PRIORITY_LABELS[priority]} />
        </div>

        {/* Type badge */}
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium flex-shrink-0 ${TYPE_COLOURS[issue.type]}`}>
          {TYPE_LABELS[issue.type]}
        </span>

        {/* Contact name */}
        <span className="font-medium text-sm text-zinc-900 truncate">{issue.contactName}</span>

        {/* Student */}
        {issue.student && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[11px] text-indigo-600 flex-shrink-0">
            <UserCircle className="h-3 w-3" />
            {issue.student.name}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Assignee */}
        {assignedTo && (
          <span className="text-[11px] text-zinc-400 flex-shrink-0 truncate max-w-[80px]">
            {assignedTo}
          </span>
        )}

        {/* Date */}
        <span className="text-[11px] text-zinc-400 flex-shrink-0">
          {format(new Date(issue.createdAt), 'd MMM')}
        </span>

        {/* Source */}
        {issue.source === 'gmail' && (
          <Mail className="h-3 w-3 text-blue-400 flex-shrink-0" />
        )}

        {/* Chevron */}
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
        }
      </button>

      {/* ── Expanded panel ─────────────────────────────────────── */}
      {expanded && (
        <div className="mt-3 space-y-4 border-t border-zinc-100 pt-3">

          {/* Info bar: Priority, Student, Assignee */}
          <div className="flex flex-wrap gap-4 items-start">
            {/* Priority */}
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Priority</p>
              <div className="flex gap-1">
                {(['LOW', 'MEDIUM', 'URGENT'] as IssuePriority[]).map(p => (
                  <button
                    key={p}
                    onClick={() => changePriority(p)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors border ${
                      priority === p
                        ? p === 'URGENT' ? 'bg-red-100 text-red-700 border-red-200'
                          : p === 'MEDIUM' ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                        : 'bg-white text-zinc-400 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Student */}
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Student</p>
              {linkOpen ? (
                <div className="space-y-1 w-48">
                  <div className="flex items-center gap-1">
                    <input
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search…"
                      className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      autoFocus
                    />
                    <button onClick={() => { setLinkOpen(false); setStudentSearch('') }} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-3 w-3" /></button>
                  </div>
                  <div className="max-h-28 overflow-y-auto rounded border border-zinc-200 bg-white shadow-sm">
                    {issue.student && (
                      <button onClick={() => linkStudent(null)} className="w-full text-left px-2 py-1 text-xs text-red-500 hover:bg-red-50 border-b border-zinc-100">Remove link</button>
                    )}
                    {filteredStudents.map(s => (
                      <button key={s.id} onClick={() => linkStudent(s.id)} className={`w-full text-left px-2 py-1 text-xs hover:bg-zinc-50 ${issue.student?.id === s.id ? 'font-medium text-indigo-600' : 'text-zinc-700'}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={openStudentPicker}
                    disabled={loadingStudents}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                  >
                    <UserCircle className="h-3 w-3" />
                    {issue.student ? issue.student.name : 'Link student'}
                  </button>
                  {!issue.student && issue.source === 'gmail' && (
                    <button
                      onClick={createStudentFromEmail}
                      disabled={creatingStudent}
                      className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                    >
                      {creatingStudent ? 'Creating…' : 'Create new student'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Assigned to */}
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Assigned To</p>
              {editingAssignee ? (
                <div className="flex items-center gap-1">
                  <select
                    defaultValue={assignedTo}
                    onChange={e => saveAssignee(e.target.value)}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    autoFocus
                  >
                    <option value="">Unassigned</option>
                    {staff.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                    <option value="Admin">Admin</option>
                  </select>
                  <button onClick={() => setEditingAssignee(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button onClick={openAssigneePicker} className="text-xs text-zinc-600 hover:underline">
                  {assignedTo || <span className="text-zinc-400 italic">Unassigned</span>}
                </button>
              )}
            </div>

            {/* Received */}
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Received</p>
              <p className="text-xs text-zinc-600">{format(new Date(issue.createdAt), 'd MMM yyyy, h:mm a')}</p>
            </div>
          </div>

          {/* Conversation thread */}
          <div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Conversation</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {issue.notes.length === 0 && !issue.note && (
                <p className="text-xs text-zinc-400 italic">No messages yet.</p>
              )}
              {/* If no IssueNotes but legacy note exists */}
              {issue.notes.length === 0 && issue.note && (
                <NoteMessage
                  author={issue.contactName}
                  content={issue.note}
                  isEmail={issue.source === 'gmail'}
                  date={issue.createdAt}
                  isContact
                />
              )}
              {issue.notes.map(n => (
                <NoteMessage
                  key={n.id}
                  author={n.author}
                  content={n.content}
                  isEmail={n.isEmail}
                  date={n.createdAt}
                  isContact={n.author !== 'Admin' && n.author !== 'System'}
                />
              ))}
            </div>
          </div>

          {/* Add note */}
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note…"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none placeholder:text-zinc-400"
                rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addNote() }}
              />
            </div>
            <button
              onClick={addNote}
              disabled={!newNote.trim() || sendingNote}
              className="rounded-lg bg-[#002F67] text-white p-2 hover:bg-[#011f42] disabled:opacity-40 transition-all shadow-sm"
              title="Send note"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick actions + resolve */}
          <div className="flex items-center gap-2 border-t border-zinc-100 pt-3">
            {issue.gmailMessageId && (
              <button
                onClick={openGmail}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                Open Gmail
                <ExternalLink className="h-3 w-3 text-zinc-400" />
              </button>
            )}
            {issue.student && (
              <button
                onClick={goToStudent}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <UserCircle className="h-3.5 w-3.5" />
                Go to Student
              </button>
            )}

            <span className="flex-1" />

            {confirmResolve ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500">Resolve this issue?</span>
                <button
                  onClick={resolve}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmResolve(false)}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmResolve(true)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Resolve
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Conversation bubble ───────────────────────────────────────────────────

function NoteMessage({
  author,
  content,
  isEmail,
  date,
  isContact,
}: {
  author: string
  content: string
  isEmail: boolean
  date: string
  isContact: boolean
}) {
  return (
    <div className={`flex ${isContact ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
        isContact
          ? 'bg-white border border-zinc-200 rounded-tl-sm'
          : author === 'System'
            ? 'bg-zinc-100 border border-zinc-200 rounded-tr-sm'
            : 'bg-[#002F67]/5 border border-[#002F67]/10 rounded-tr-sm'
      }`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[11px] font-semibold ${isContact ? 'text-zinc-700' : author === 'System' ? 'text-zinc-500' : 'text-[#002F67]'}`}>
            {author}
          </span>
          {isEmail && <Mail className="h-3 w-3 text-blue-400" />}
          <span className="text-[10px] text-zinc-400">
            {format(new Date(date), 'd MMM yyyy, h:mm a')}
          </span>
        </div>
        <p className="text-xs text-zinc-600 whitespace-pre-wrap leading-relaxed">{content}</p>
      </div>
    </div>
  )
}
