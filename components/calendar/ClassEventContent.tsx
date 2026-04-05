'use client'

import type { EventApi } from '@fullcalendar/core'

interface Props {
  event: EventApi
  colour: string
}

export function ClassEventContent({ event, colour }: Props) {
  const { staff, room, enrolled, maxCapacity } = event.extendedProps as {
    staff: string
    room: string | null
    enrolled: number
    maxCapacity: number
  }

  return (
    <div
      className="h-full w-full overflow-hidden rounded px-1.5 py-1 text-white text-[11px] leading-tight"
      style={{ backgroundColor: colour }}
    >
      <div className="font-semibold truncate">{event.title}</div>
      <div className="truncate opacity-90">{staff}</div>
      {room && <div className="truncate opacity-75">{room}</div>}
      <div className="opacity-75">
        {enrolled}/{maxCapacity}
      </div>
    </div>
  )
}
