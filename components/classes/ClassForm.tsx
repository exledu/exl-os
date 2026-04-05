'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Subject { id: number; name: string }
interface YearLevel { id: number; level: number }
interface StaffMember { id: number; name: string }
interface Room { id: number; name: string }

interface ClassData {
  id?: number
  subjectId: number
  yearLevelId: number
  staffId: number
  roomId: number | null
  maxCapacity: number
  isRecurring: boolean
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
  recurrenceStart: string | null
  recurrenceEnd: string | null
  sessionDate: string | null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toDateInput(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = typeof val === 'string' ? new Date(val) : val
  return d.toISOString().split('T')[0]
}

export function ClassForm({ initial }: { initial?: ClassData }) {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [yearLevels, setYearLevels] = useState<YearLevel[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? true)
  const [subjectId, setSubjectId] = useState(initial?.subjectId?.toString() ?? '')
  const [yearLevelId, setYearLevelId] = useState(initial?.yearLevelId?.toString() ?? '')
  const [staffId, setStaffId] = useState(initial?.staffId?.toString() ?? '')
  const [roomId, setRoomId] = useState(initial?.roomId?.toString() ?? 'none')
  const [maxCapacity, setMaxCapacity] = useState(initial?.maxCapacity?.toString() ?? '10')
  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek?.toString() ?? '')
  const [startTime, setStartTime] = useState(initial?.startTime ?? '')
  const [endTime, setEndTime] = useState(initial?.endTime ?? '')
  const [recurrenceStart, setRecurrenceStart] = useState(toDateInput(initial?.recurrenceStart))
  const [recurrenceEnd, setRecurrenceEnd] = useState(toDateInput(initial?.recurrenceEnd))
  const [sessionDate, setSessionDate] = useState(toDateInput(initial?.sessionDate))

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/subjects').then(r => r.json()),
      fetch('/api/year-levels').then(r => r.json()),
      fetch('/api/staff').then(r => r.json()),
      fetch('/api/rooms').then(r => r.json()),
    ]).then(([s, y, t, ro]) => {
      setSubjects(s); setYearLevels(y); setStaff(t); setRooms(ro)
      setLoaded(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      subjectId: Number(subjectId),
      yearLevelId: Number(yearLevelId),
      staffId: Number(staffId),
      roomId: roomId && roomId !== 'none' ? Number(roomId) : null,
      maxCapacity: Number(maxCapacity),
      isRecurring,
      dayOfWeek: isRecurring ? Number(dayOfWeek) : null,
      startTime: startTime || null,
      endTime: endTime || null,
      recurrenceStart: isRecurring && recurrenceStart ? recurrenceStart : null,
      recurrenceEnd: isRecurring && recurrenceEnd ? recurrenceEnd : null,
      sessionDate: !isRecurring && sessionDate ? sessionDate : null,
    }

    try {
      const url = initial?.id ? `/api/classes/${initial.id}` : '/api/classes'
      const method = initial?.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save class')
      router.push('/classes')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return <div className="text-sm text-zinc-400 py-8">Loading form…</div>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {/* Type toggle */}
      <div className="flex gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1 w-fit">
        {[true, false].map((val) => (
          <button
            key={String(val)}
            type="button"
            onClick={() => setIsRecurring(val)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              isRecurring === val
                ? 'bg-white shadow-sm text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {val ? 'Recurring' : 'One-off'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Subject */}
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={(v) => setSubjectId(v ?? '')} required>
            <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
            <SelectContent>
              {subjects.map(s => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year Level */}
        <div className="space-y-1.5">
          <Label>Year Level</Label>
          <Select value={yearLevelId} onValueChange={(v) => setYearLevelId(v ?? '')} required>
            <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
            <SelectContent>
              {yearLevels.map(y => (
                <SelectItem key={y.id} value={y.id.toString()}>Year {y.level}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Staff Member */}
        <div className="space-y-1.5">
          <Label>Staff Member</Label>
          <Select value={staffId} onValueChange={(v) => setStaffId(v ?? '')} required>
            <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
            <SelectContent>
              {staff.length === 0 && (
                <SelectItem value="none" disabled>No staff — add one first</SelectItem>
              )}
              {staff.map(t => (
                <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Room */}
        <div className="space-y-1.5">
          <Label>Room (optional)</Label>
          <Select value={roomId} onValueChange={(v) => setRoomId(v ?? 'none')}>
            <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No room</SelectItem>
              {rooms.map(r => (
                <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Max Capacity */}
        <div className="space-y-1.5">
          <Label>Max Capacity</Label>
          <Input
            type="number"
            min={1}
            value={maxCapacity}
            onChange={e => setMaxCapacity(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Time fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Start Time</Label>
          <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>End Time</Label>
          <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
        </div>
      </div>

      {/* Recurring fields */}
      {isRecurring && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 col-span-2">
            <Label>Day of Week</Label>
            <Select value={dayOfWeek} onValueChange={(v) => setDayOfWeek(v ?? '')} required>
              <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((name, i) => (
                  <SelectItem key={i} value={i.toString()}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input type="date" value={recurrenceStart} onChange={e => setRecurrenceStart(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>End Date (optional)</Label>
            <Input type="date" value={recurrenceEnd} onChange={e => setRecurrenceEnd(e.target.value)} />
          </div>
        </div>
      )}

      {/* One-off fields */}
      {!isRecurring && (
        <div className="space-y-1.5">
          <Label>Session Date</Label>
          <Input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} required />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : initial?.id ? 'Save Changes' : 'Create Class'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/classes')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
