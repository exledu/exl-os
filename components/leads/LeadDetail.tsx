'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MessageSquare, User } from 'lucide-react'

interface Event {
  id:          number
  timestamp:   string
  direction:   string
  channel:     string
  subject:     string | null
  snippet:     string | null
  fromAddress: string | null
  toAddress:   string | null
}
interface Lead {
  id:           number
  createdAt:    string
  formType:     string
  parentName:   string | null
  studentName:  string | null
  email:        string
  otherEmails:  string[]
  phone:        string | null
  yearLevel:    number | null
  subjects:     string | null
  message:      string | null
  rawBody:      string
  stage:        string
  ownerId:      number | null
  owner:        { id: number; name: string } | null
  closedReason: string | null
  closedAt:     string | null
  notes:        string | null
  events:       Event[]
}

const STAGE_OPTIONS = [
  { value: 'NEW',            label: 'New' },
  { value: 'CONTACTED',      label: 'Contacted' },
  { value: 'TRIAL_BOOKED',   label: 'Trial booked' },
  { value: 'TRIAL_ATTENDED', label: 'Trial sat' },
  { value: 'ENROLLED',       label: 'Enrolled' },
  { value: 'WAITLIST',       label: 'Waitlist' },
  { value: 'CLOSED_LOST',    label: 'Closed lost' },
]

const CLOSED_REASONS = ['Price', 'Timing', 'Travel', 'Tutor fit', 'Went elsewhere', 'Unreachable', 'Other']

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function LeadDetail({ leadId }: { leadId: number }) {
  const [lead, setLead]       = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/leads/${leadId}`, { cache: 'no-store' })
    if (res.ok) {
      const l = await res.json() as Lead
      setLead(l)
      setNotesDraft(l.notes ?? '')
    }
    setLoading(false)
  }

  async function patch(patch: Record<string, unknown>) {
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) await load()
    setSaving(false)
  }

  useEffect(() => { load() }, [leadId])

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Loading…</div>
  if (!lead)   return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Lead not found.</div>

  const displayName = lead.studentName ?? lead.parentName ?? lead.email

  return (
    <div className="space-y-5">
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#002F67]">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to leads
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#002F67]">{displayName}</h1>
          <div className="text-xs text-gray-500 mt-0.5">
            {lead.formType === 'trial' ? 'Free trial booking' : 'Contact form'} · Received {fmtDateTime(lead.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={lead.stage}
            onChange={e => patch({ stage: e.target.value })}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
          >
            {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {lead.stage === 'CLOSED_LOST' && (
            <select
              value={lead.closedReason ?? ''}
              onChange={e => patch({ closedReason: e.target.value || null })}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Reason…</option>
              {CLOSED_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Contact details */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#002F67] mb-3">Contact details</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-800">{lead.email}</dd>
              {lead.otherEmails.length > 0 && (<>
                <dt className="text-gray-500">Other emails</dt>
                <dd className="text-gray-500 text-xs">{lead.otherEmails.join(', ')}</dd>
              </>)}
              {lead.phone && (<>
                <dt className="text-gray-500">Phone</dt>
                <dd className="text-gray-800">{lead.phone}</dd>
              </>)}
              {lead.parentName && (<>
                <dt className="text-gray-500">Parent name</dt>
                <dd className="text-gray-800">{lead.parentName}</dd>
              </>)}
              {lead.studentName && (<>
                <dt className="text-gray-500">Student</dt>
                <dd className="text-gray-800">{lead.studentName}</dd>
              </>)}
              {lead.yearLevel != null && (<>
                <dt className="text-gray-500">Year</dt>
                <dd className="text-gray-800">Yr {lead.yearLevel}</dd>
              </>)}
              {lead.subjects && (<>
                <dt className="text-gray-500">Subjects</dt>
                <dd className="text-gray-800">{lead.subjects}</dd>
              </>)}
              {lead.message && (<>
                <dt className="text-gray-500">Message</dt>
                <dd className="text-gray-800 whitespace-pre-wrap">{lead.message}</dd>
              </>)}
            </dl>
          </div>

          {/* Timeline */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#002F67] mb-3">Timeline</h2>
            <ol className="space-y-3">
              <TimelineNode
                icon={User} tone="slate"
                title="Form submitted"
                subtitle={fmtDateTime(lead.createdAt)}
                body={`Form type: ${lead.formType}`}
              />
              {lead.events.map(ev => (
                <TimelineNode
                  key={ev.id}
                  icon={ev.channel === 'phone' ? Phone : ev.channel === 'sms' ? MessageSquare : Mail}
                  tone={ev.direction === 'outbound' ? 'blue' : 'emerald'}
                  title={`${ev.direction === 'outbound' ? 'Sent' : 'Received'}${ev.subject ? ` — ${ev.subject}` : ''}`}
                  subtitle={fmtDateTime(ev.timestamp)}
                  body={ev.snippet ?? ''}
                  meta={ev.direction === 'outbound' ? `to ${ev.toAddress ?? ''}` : `from ${ev.fromAddress ?? ''}`}
                />
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#002F67] mb-2">Notes</h2>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              rows={5}
              placeholder="Anything worth remembering next time…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => patch({ notes: notesDraft })}
                disabled={saving || notesDraft === (lead.notes ?? '')}
                className="rounded-lg bg-[#002F67] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#002F67] mb-2">Raw form body</h2>
            <pre className="whitespace-pre-wrap text-[11px] text-gray-500 max-h-72 overflow-auto">{lead.rawBody}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineNode({ icon: Icon, tone, title, subtitle, body, meta }: {
  icon: React.ComponentType<{ className?: string }>
  tone: 'blue' | 'emerald' | 'slate'
  title: string
  subtitle: string
  body: string
  meta?: string
}) {
  const toneCls = {
    blue:    'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    slate:   'bg-slate-100 text-slate-700',
  }[tone]
  return (
    <li className="flex items-start gap-3">
      <div className={`flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 ${toneCls}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-800 truncate">{title}</div>
        <div className="text-[11px] text-gray-500">{subtitle}{meta ? ` · ${meta}` : ''}</div>
        {body && <div className="text-xs text-gray-600 mt-0.5 line-clamp-3">{body}</div>}
      </div>
    </li>
  )
}
