'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AddIssueDialog } from './AddIssueDialog'
import { IssueCard } from './IssueCard'
import { Mail, Plus } from 'lucide-react'

export type IssueType = 'FREE_TRIAL' | 'CANCELLATION' | 'RESCHEDULE' | 'ENQUIRY'
export type IssuePriority = 'LOW' | 'MEDIUM' | 'URGENT'

export interface IssueNote {
  id: number
  author: string
  content: string
  isEmail: boolean
  createdAt: string
}

export interface Issue {
  id: number
  type: IssueType
  priority: IssuePriority
  contactName: string
  studentId: number | null
  student: { id: number; name: string } | null
  assignedTo: string | null
  note: string | null
  resolutionNote: string | null
  resolved: boolean
  source: string | null
  rawEmail: string | null
  gmailMessageId: string | null
  createdAt: string
  notes: IssueNote[]
}

const TYPE_LABELS: Record<IssueType, string> = {
  FREE_TRIAL: 'Free Trial',
  CANCELLATION: 'Cancellation',
  RESCHEDULE: 'Reschedule',
  ENQUIRY: 'Enquiry',
}

const PRIORITY_ORDER: Record<IssuePriority, number> = {
  URGENT: 0, MEDIUM: 1, LOW: 2,
}

type Filter = 'ALL' | IssueType

export function IssuesPanel() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [addOpen, setAddOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function loadIssues() {
    try {
      const res = await fetch('/api/issues')
      if (res.ok) setIssues(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadIssues() }, [])

  async function syncGmail() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' })
      if (res.redirected || res.url.includes('/login')) {
        setSyncResult('Not signed in — sign out and back in')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setSyncResult(data.error ?? 'Sync failed')
      } else {
        setSyncResult(data.created > 0 ? `${data.created} new issue${data.created !== 1 ? 's' : ''} imported` : 'No new emails')
        if (data.created > 0) loadIssues()
      }
    } catch {
      setSyncResult('Sign out and back in to connect Gmail')
    } finally {
      setSyncing(false)
    }
  }

  const displayed = issues
    .filter(i => filter === 'ALL' || i.type === filter)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

  const urgentCount = issues.filter(i => i.priority === 'URGENT').length

  return (
    <div className="flex flex-col h-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-zinc-900">Outstanding Issues</h2>
            {urgentCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-0 text-xs">
                {urgentCount} urgent
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={syncGmail}
                  disabled={syncing}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  <Mail className={`h-3.5 w-3.5 ${syncing ? 'animate-pulse' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync Gmail'}
                </button>
              </div>
              {syncResult && (
                <span className="text-[10px] text-zinc-400">{syncResult}</span>
              )}
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Issue
            </Button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {(['ALL', 'FREE_TRIAL', 'CANCELLATION', 'RESCHEDULE', 'ENQUIRY'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {f === 'ALL' ? 'All' : TYPE_LABELS[f]}
              {f !== 'ALL' && (
                <span className="ml-1 opacity-60">
                  {issues.filter(i => i.type === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
        {loading && (
          <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
            Loading…
          </div>
        )}
        {!loading && displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-zinc-400 text-sm">No outstanding issues</p>
            <p className="text-zinc-300 text-xs mt-1">Add one manually or connect Gmail to auto-import</p>
          </div>
        )}
        {displayed.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onUpdate={loadIssues}
          />
        ))}
      </div>

      <AddIssueDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={loadIssues}
      />
    </div>
  )
}
