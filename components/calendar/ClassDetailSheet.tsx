'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface CalendarEvent {
  extendedProps: {
    classId: number
    subject: string
    yearLevel: number
    staff: string
    room: string | null
    enrolled: number
    maxCapacity: number
  }
}

interface Enrolment {
  id: number
  student: { id: number; name: string; yearLevel: { level: number } }
}

interface ClassDetail {
  id: number
  enrolments: Enrolment[]
}

interface Props {
  event: CalendarEvent | null
  onClose: () => void
}

export function ClassDetailSheet({ event, onClose }: Props) {
  const [detail, setDetail] = useState<ClassDetail | null>(null)

  useEffect(() => {
    if (!event) { setDetail(null); return }
    fetch(`/api/classes/${event.extendedProps.classId}`)
      .then((r) => r.json())
      .then(setDetail)
  }, [event])

  if (!event) return null

  const { subject, yearLevel, staff, room, enrolled, maxCapacity, classId } =
    event.extendedProps

  return (
    <Sheet open={!!event} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-80">
        <SheetHeader>
          <SheetTitle>Yr {yearLevel} {subject}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <span className="text-zinc-500">Staff</span>
            <p className="font-medium">{staff}</p>
          </div>
          {room && (
            <div>
              <span className="text-zinc-500">Room</span>
              <p className="font-medium">{room}</p>
            </div>
          )}
          <div>
            <span className="text-zinc-500">Capacity</span>
            <p className="font-medium">
              {enrolled} / {maxCapacity} enrolled
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-zinc-500">Students</span>
              <Badge variant="outline">{enrolled}</Badge>
            </div>
            {detail ? (
              <ul className="space-y-1">
                {detail.enrolments.map((e) => (
                  <li key={e.id} className="rounded bg-zinc-50 px-2 py-1 text-xs">
                    {e.student.name}
                  </li>
                ))}
                {detail.enrolments.length === 0 && (
                  <li className="text-zinc-400">No students enrolled</li>
                )}
              </ul>
            ) : (
              <p className="text-zinc-400">Loading…</p>
            )}
          </div>
          <Link
            href={`/classes/${classId}/edit`}
            className="inline-block text-xs text-indigo-600 hover:underline"
          >
            Edit class
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
