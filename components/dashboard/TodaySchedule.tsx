'use client'

import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ClassEventContent } from '@/components/calendar/ClassEventContent'
import { subjectColour } from '@/lib/subject-colours'

async function fetchEvents(
  info: { startStr: string; endStr: string },
  successCallback: (events: object[]) => void,
  failureCallback: (error: Error) => void
) {
  try {
    const res = await fetch(`/api/sessions?start=${encodeURIComponent(info.startStr)}&end=${encodeURIComponent(info.endStr)}`)
    const events = await res.json()
    successCallback(events)
  } catch (err) {
    failureCallback(err as Error)
  }
}

function startOfDay(d: Date) {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

export function TodaySchedule() {
  const calendarRef = useRef<FullCalendar>(null)
  const router = useRouter()
  const [displayDate, setDisplayDate] = useState(() => startOfDay(new Date()))

  const todayMidnight = startOfDay(new Date())
  const isToday = displayDate.getTime() === todayMidnight.getTime()

  const dayOfWeek = displayDate.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const slotMinTime = isWeekend ? '09:00:00' : '15:00:00'

  const label = displayDate.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  function navigate(direction: 'prev' | 'next' | 'today') {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (direction === 'today') {
      api.today()
      setDisplayDate(startOfDay(new Date()))
    } else {
      direction === 'prev' ? api.prev() : api.next()
      setDisplayDate(startOfDay(api.getDate()))
    }
  }

  return (
    <div className="flex flex-col h-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('prev')}
            className="rounded p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate('next')}
            className="rounded p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button
              onClick={() => navigate('today')}
              className="rounded px-2 py-0.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors border border-zinc-200"
            >
              Today
            </button>
          )}
        </div>
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      {/* Force 2-room column layout — every event occupies at most half the width */}
      <style>{`.two-room-cal .fc-timegrid-event-harness { max-width: 50%; }`}</style>
      <div className="two-room-cal flex-1 overflow-y-auto p-2">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridDay"
          headerToolbar={false}
          events={fetchEvents}
          eventContent={(eventInfo) => (
            <ClassEventContent
              event={eventInfo.event}
              colour={subjectColour(
                eventInfo.event.extendedProps.subject as string,
                eventInfo.event.extendedProps.yearLevel as number,
              )}
            />
          )}
          eventClick={(info) => {
            const classId = info.event.extendedProps.classId
            if (classId) router.push(`/classes?id=${classId}`)
          }}
          eventClassNames="cursor-pointer"
          eventBorderColor="transparent"
          eventBackgroundColor="transparent"
          height="auto"
          slotMinTime={slotMinTime}
          slotMaxTime="21:00:00"
          allDaySlot={false}
          nowIndicator={true}
          dayHeaders={false}
        />
      </div>
    </div>
  )
}
