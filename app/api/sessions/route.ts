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

  // Transform to FullCalendar event format
  const events = sessions.map((s) => {
    const dateStr = s.date.toISOString().split('T')[0]
    return {
      id: String(s.id),
      title: `Yr ${s.class.yearLevel.level} ${s.class.subject.name}`,
      start: `${dateStr}T${s.startTime}:00`,
      end: `${dateStr}T${s.endTime}:00`,
      extendedProps: {
        sessionId: s.id,
        classId: s.classId,
        subject: s.class.subject.name,
        yearLevel: s.class.yearLevel.level,
        staff: s.class.staff.name,
        room: s.class.room?.name ?? null,
        enrolled: s.class._count.enrolments,
        maxCapacity: s.class.maxCapacity,
      },
    }
  })

  return Response.json(events)
}
