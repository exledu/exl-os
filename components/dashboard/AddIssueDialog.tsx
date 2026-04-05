'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { IssueType, IssuePriority } from './IssuesPanel'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function AddIssueDialog({ open, onClose, onSaved }: Props) {
  const [type, setType] = useState<IssueType>('ENQUIRY')
  const [priority, setPriority] = useState<IssuePriority>('MEDIUM')
  const [contactName, setContactName] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, priority, contactName, note: note || null, source: 'manual' }),
      })
      if (!res.ok) throw new Error('Failed to create issue')
      setContactName('')
      setNote('')
      setType('ENQUIRY')
      setPriority('MEDIUM')
      onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Issue</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Contact / Student Name</Label>
            <Input
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType((v ?? 'ENQUIRY') as IssueType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE_TRIAL">Free Trial</SelectItem>
                  <SelectItem value="CANCELLATION">Cancellation</SelectItem>
                  <SelectItem value="RESCHEDULE">Reschedule</SelectItem>
                  <SelectItem value="ENQUIRY">Enquiry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority((v ?? 'MEDIUM') as IssuePriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Wants to trial Yr 10 Maths on Tuesday…"
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Add Issue'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
