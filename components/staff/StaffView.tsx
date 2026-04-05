'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Plus, Mail, Phone, Pencil, X, Check, Users, BookOpen,
  Activity, Clock, MessageSquare, Monitor,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

interface StaffSummary {
  id: number
  name: string
  email: string
  phone: string | null
  roles: string[]
  _count: { classes: number }
  avgStudentsPerClass: number
  totalStudents: number
}

interface StaffDetail extends StaffSummary {
  classes: {
    id: number
    subject: { name: string }
    yearLevel: { level: number }
    dayOfWeek: number | null
    startTime: string | null
    endTime: string | null
  }[]
}

interface StaffAction {
  id: number
  type: string
  automatic: boolean
  description: string
  value: number | null
  createdAt: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const AVAILABLE_ROLES = ['admin', 'tutor']

const ROLE_COLOURS: Record<string, string> = {
  admin: 'bg-[#002F67]/10 text-[#002F67]',
  tutor: 'bg-emerald-50 text-emerald-700',
}

const NON_OS_ACTIONS = [
  { type: 'booklet_work', label: 'Booklet Work', unit: 'hrs', icon: BookOpen },
  { type: 'student_message', label: 'Student Messages', unit: '#', icon: MessageSquare },
  { type: 'online_class', label: 'Online Class', unit: '#', icon: Monitor },
]

// ── Main Component ────────────────────────────────────────────────────────

export function StaffView() {
  const [staffList, setStaffList] = useState<StaffSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<StaffDetail | null>(null)
  const [actions, setActions] = useState<StaffAction[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', roles: [] as string[] })
  const [saving, setSaving] = useState(false)

  // Log action state
  const [logType, setLogType] = useState('')
  const [logValue, setLogValue] = useState('')
  const [logDesc, setLogDesc] = useState('')
  const [loggingAction, setLoggingAction] = useState(false)

  async function loadStaff() {
    const res = await fetch('/api/staff')
    if (res.ok) {
      const data = await res.json()
      setStaffList(data.map((s: StaffSummary) => ({
        ...s,
        _count: s._count ?? { classes: 0 },
      })))
    }
  }

  async function loadDetail(id: number) {
    setLoading(true)
    const [detailRes, actionsRes] = await Promise.all([
      fetch(`/api/staff/${id}`),
      fetch(`/api/staff/${id}/actions?limit=30`),
    ])
    if (detailRes.ok) {
      const d = await detailRes.json()
      setDetail(d)
      setEditForm({ name: d.name, email: d.email, phone: d.phone ?? '', roles: d.roles })
    }
    if (actionsRes.ok) setActions(await actionsRes.json())
    setLoading(false)
  }

  useEffect(() => { loadStaff() }, [])

  function selectStaff(id: number) {
    setSelectedId(id)
    setDetail(null)
    setActions([])
    setEditing(false)
    setLogType('')
    loadDetail(id)
  }

  async function saveEdit() {
    if (!detail) return
    setSaving(true)
    await fetch(`/api/staff/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    setEditing(false)
    await Promise.all([loadStaff(), loadDetail(detail.id)])
  }

  function toggleRole(role: string) {
    setEditForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }))
  }

  async function submitLogAction() {
    if (!selectedId || !logType || !logValue) return
    setLoggingAction(true)
    const actionDef = NON_OS_ACTIONS.find(a => a.type === logType)
    await fetch(`/api/staff/${selectedId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: logType,
        description: logDesc || `${actionDef?.label}: ${logValue} ${actionDef?.unit}`,
        value: Number(logValue),
      }),
    })
    setLogType('')
    setLogValue('')
    setLogDesc('')
    setLoggingAction(false)
    loadDetail(selectedId)
  }

  const displayed = staffList
    .filter(s => {
      if (!search) return true
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.roles.some(r => r.includes(q))
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* ── LEFT: staff list ──────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-100 bg-white">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-[#002F67]">Staff</h1>
            <Link
              href="/staff/new"
              className="flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:shadow-md hover:bg-[#011f42] transition-all duration-200"
            >
              <Plus className="h-3 w-3" />
              Add
            </Link>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search staff…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40 transition-all"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayed.map(s => {
            const active = selectedId === s.id
            return (
              <button
                key={s.id}
                onClick={() => selectStaff(s.id)}
                className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-all duration-200 border-b border-gray-50 ${
                  active ? 'bg-blue-50/80 border-l-3 border-l-[#002F67]' : 'border-l-3 border-l-transparent hover:bg-gray-50'
                }`}
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  s.roles.includes('admin') ? 'bg-[#002F67]/10 text-[#002F67]' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${active ? 'text-[#002F67]' : 'text-gray-800'}`}>
                    {s.name}
                  </p>
                  <div className="flex gap-1 mt-0.5">
                    {s.roles.map(r => (
                      <span key={r} className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-medium ${ROLE_COLOURS[r] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s._count.classes} class{s._count.classes !== 1 ? 'es' : ''}
                    {s._count.classes > 0 && <span className="ml-1.5">· {s.avgStudentsPerClass ?? 0} stu/class</span>}
                  </p>
                </div>
              </button>
            )
          })}
          {displayed.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400">
              {search ? `No staff match "${search}"` : 'No staff yet'}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: staff detail ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedId && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <Users className="h-10 w-10 text-gray-300" />
            <p className="text-sm">Select a staff member to view their profile</p>
          </div>
        )}
        {selectedId && loading && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading…</div>
        )}
        {detail && !loading && (
          <div className="max-w-3xl mx-auto p-6 space-y-5">

            {/* Header card */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="h-2 w-full bg-[#002F67]" />
              <div className="px-6 py-5">
                {!editing ? (
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold ${
                        detail.roles.includes('admin') ? 'bg-[#002F67]/10 text-[#002F67]' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {detail.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-[#002F67]">{detail.name}</h2>
                        <div className="flex gap-1.5 mt-1">
                          {detail.roles.map(r => (
                            <span key={r} className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLOURS[r] ?? 'bg-gray-100 text-gray-600'}`}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {detail.email}</span>
                          {detail.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {detail.phone}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-500">Full Name</label>
                        <input
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-500">Email</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-500">Phone</label>
                        <input
                          value={editForm.phone}
                          onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                          placeholder="0400 000 000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-500">Roles</label>
                        <div className="flex gap-2 pt-1">
                          {AVAILABLE_ROLES.map(role => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => toggleRole(role)}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                                editForm.roles.includes(role)
                                  ? role === 'admin'
                                    ? 'bg-[#002F67] text-white border-[#002F67]'
                                    : 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                              }`}
                            >
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveEdit}
                        disabled={saving || editForm.roles.length === 0}
                        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-[#002F67] text-white shadow-md hover:shadow-lg hover:bg-[#011f42] disabled:opacity-50 transition-all"
                      >
                        <Check className="h-3 w-3" />
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => { setEditing(false); setEditForm({ name: detail.name, email: detail.email, phone: detail.phone ?? '', roles: detail.roles }) }}
                        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Two-column: Classes + Log Action | Activity Feed */}
            <div className="grid grid-cols-[1fr_1fr] gap-5">

              {/* LEFT column */}
              <div className="space-y-5">
                {/* Assigned classes */}
                {detail.roles.includes('tutor') && (
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-5">
                    <h3 className="text-xs font-bold text-[#002F67]/60 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Assigned Classes ({detail.classes?.length ?? 0})
                    </h3>
                    {(!detail.classes || detail.classes.length === 0) ? (
                      <p className="text-sm text-gray-400 italic">No classes assigned</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.classes.map(c => (
                          <Link
                            key={c.id}
                            href={`/classes?id=${c.id}`}
                            className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-blue-50/50 transition-colors group"
                          >
                            <span className="text-xs font-medium text-gray-800 group-hover:text-[#002F67]">
                              Yr {c.yearLevel.level} {c.subject.name}
                            </span>
                            {c.dayOfWeek != null && (
                              <span className="text-[11px] text-gray-400">
                                {DAY_NAMES[c.dayOfWeek]} {c.startTime}–{c.endTime}
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Log non-OS action */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-5">
                  <h3 className="text-xs font-bold text-[#002F67]/60 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Log Activity
                  </h3>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {NON_OS_ACTIONS.map(a => {
                        const Icon = a.icon
                        const active = logType === a.type
                        return (
                          <button
                            key={a.type}
                            onClick={() => setLogType(active ? '' : a.type)}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                              active
                                ? 'bg-[#002F67] text-white border-[#002F67] shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {a.label}
                          </button>
                        )
                      })}
                    </div>
                    {logType && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={logValue}
                            onChange={e => setLogValue(e.target.value)}
                            placeholder={NON_OS_ACTIONS.find(a => a.type === logType)?.unit === 'hrs' ? 'Hours' : 'Count'}
                            className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                            min="0"
                            step={NON_OS_ACTIONS.find(a => a.type === logType)?.unit === 'hrs' ? '0.5' : '1'}
                          />
                          <input
                            value={logDesc}
                            onChange={e => setLogDesc(e.target.value)}
                            placeholder="Optional description…"
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002F67]/20 focus:border-[#002F67]/40"
                          />
                        </div>
                        <button
                          onClick={submitLogAction}
                          disabled={!logValue || loggingAction}
                          className="rounded-lg px-4 py-2 text-xs font-medium bg-[#002F67] text-white shadow-sm hover:shadow-md hover:bg-[#011f42] disabled:opacity-50 transition-all"
                        >
                          {loggingAction ? 'Logging…' : 'Log Activity'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT column: Activity feed */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-5">
                <h3 className="text-xs font-bold text-[#002F67]/60 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Activity Log
                </h3>
                {actions.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No activity recorded yet</p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {actions.map(a => (
                      <div key={a.id} className="flex items-start gap-2.5 py-1.5">
                        <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${a.automatic ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700">{a.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-400">
                              {format(new Date(a.createdAt), 'd MMM yyyy, h:mm a')}
                            </span>
                            {!a.automatic && a.value != null && (
                              <span className="text-[10px] font-medium text-emerald-600">
                                {a.value} {NON_OS_ACTIONS.find(x => x.type === a.type)?.unit ?? ''}
                              </span>
                            )}
                            <span className={`text-[10px] rounded-full px-1.5 py-0 ${a.automatic ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {a.automatic ? 'OS' : 'Manual'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
