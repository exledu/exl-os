'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useState } from 'react'
import { ClassEventContent } from './ClassEventContent'
import { ClassDetailSheet } from './ClassDetailSheet'
import { subjectColour } from '@/lib/subject-colours'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  extendedProps: {
    sessionId: number
    classId: number
    subject: string
    yearLevel: number
    staff: string
    room: string | null
    enrolled: number
    maxCapacity: number
  }
}


export function CalendarView() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  async function fetchEvents(
    info: { startStr: string; endStr: string },
    successCallback: (events: CalendarEvent[]) => void,
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

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          buttonText={{ month: 'Month', week: 'Week', today: 'Today' }}
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
          eventClick={(info) => setSelectedEvent(info.event as unknown as CalendarEvent)}
          eventBorderColor="transparent"
          eventBackgroundColor="transparent"
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          allDaySlot={false}
          weekends={true}
          nowIndicator={true}
        />
      </div>

      <ClassDetailSheet
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </>
  )
}
