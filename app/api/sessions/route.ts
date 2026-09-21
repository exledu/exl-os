import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const sessions = await prisma.classSession.findMany({
    where: {
      cancelled: false,
      ...(start && end
        ? { date: { gte: new Date(start), lte: new Date(end) } }
        : {}),
    },
    include: {
      yearLevel: true,
      class: {
        include: {
          subject: true,
          yearLevel: true,
          staff: true,
          room: true,
          _count: { select: { enrolments: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  // Transform to FullCalendar event format. Prefer the session's own
  // yearLevel (locked in when the session was created) over the class's
  // current yearLevel — so a rollover doesn't retroactively relabel past
  // sessions.
  const events = sessions.map((s) => {
    const dateStr = s.date.toISOString().split('T')[0]
    const yr = s.yearLevel?.level ?? s.class.yearLevel.level
    return {
      id: String(s.id),
      title: `Yr ${yr} ${s.class.subject.name}`,
      start: `${dateStr}T${s.startTime}:00`,
      end: `${dateStr}T${s.endTime}:00`,
      extendedProps: {
        sessionId: s.id,
        classId: s.classId,
        subject: s.class.subject.name,
        yearLevel: yr,
        staff: s.class.staff.name,
        room: s.class.room?.name ?? null,
        enrolled: s.class._count.enrolments,
        maxCapacity: s.class.maxCapacity,
      },
    }
  })

  return Response.json(events)
}
