import { prisma } from '@/lib/db'
import { initFirstTerm, createOneOffSession } from '@/lib/sessions'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const archived = searchParams.get('archived') === 'true'

  const classes = await prisma.class.findMany({
    where: { archived },
    include: {
      subject: true,
      yearLevel: true,
      staff: true,
      room: true,
      _count: { select: { enrolments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json(classes)
}

export async function POST(request: Request) {
  const body = await request.json()

  const cls = await prisma.class.create({
    data: {
      subjectId: Number(body.subjectId),
      yearLevelId: Number(body.yearLevelId),
      staffId: Number(body.staffId),
      roomId: body.roomId ? Number(body.roomId) : null,
      maxCapacity: Number(body.maxCapacity),
      isRecurring: body.isRecurring,
      dayOfWeek: body.isRecurring ? Number(body.dayOfWeek) : null,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      recurrenceStart: body.isRecurring && body.recurrenceStart ? new Date(body.recurrenceStart) : null,
      sessionDate: !body.isRecurring && body.sessionDate ? new Date(body.sessionDate) : null,
    },
    include: { subject: true, yearLevel: true, staff: true, room: true },
  })

  if (body.isRecurring) {
    // Seed exactly 10 sessions (one term) starting from the recurrence start date.
    if (cls.recurrenceStart) {
      await initFirstTerm(cls.id, cls.recurrenceStart)
    }
  } else {
    await createOneOffSession(cls.id)
  }

  return Response.json(cls, { status: 201 })
}
