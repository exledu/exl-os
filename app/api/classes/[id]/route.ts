import { prisma } from '@/lib/db'
import { initFirstTerm, rescheduleFutureSessions, createOneOffSession } from '@/lib/sessions'
import { computeEndTime } from '@/lib/class-duration'

export async function GET(_req: Request, ctx: RouteContext<'/api/classes/[id]'>) {
  const { id } = await ctx.params
  const cls = await prisma.class.findUnique({
    where: { id: Number(id) },
    include: {
      subject: true,
      yearLevel: true,
      staff: true,
      room: true,
      enrolments: { include: { student: { include: { yearLevel: true } } } },
    },
  })
  if (!cls) return new Response('Not found', { status: 404 })
  return Response.json(cls)
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/classes/[id]'>) {
  const { id } = await ctx.params
  const body = await request.json()

  const yl = await prisma.yearLevel.findUnique({ where: { id: Number(body.yearLevelId) } })
  if (!yl) return Response.json({ error: 'Invalid yearLevelId' }, { status: 400 })
  const derivedEndTime = body.startTime ? computeEndTime(body.startTime, yl.level) : null

  const cls = await prisma.class.update({
    where: { id: Number(id) },
    data: {
      subjectId: Number(body.subjectId),
      yearLevelId: Number(body.yearLevelId),
      staffId: Number(body.staffId),
      roomId: body.roomId ? Number(body.roomId) : null,
      maxCapacity: Number(body.maxCapacity),
      isRecurring: body.isRecurring,
      dayOfWeek: body.isRecurring ? Number(body.dayOfWeek) : null,
      startTime: body.startTime ?? null,
      endTime: derivedEndTime,
      recurrenceStart: body.isRecurring && body.recurrenceStart ? new Date(body.recurrenceStart) : null,
      sessionDate: !body.isRecurring && body.sessionDate ? new Date(body.sessionDate) : null,
    },
    include: { subject: true, yearLevel: true, staff: true, room: true },
  })

  if (body.isRecurring) {
    // If this class has no sessions yet (e.g. just flipped from one-off → recurring),
    // seed the first term. Otherwise just slide existing future sessions to the new
    // day/time — never wipe terms.
    const sessionCount = await prisma.classSession.count({ where: { classId: cls.id } })
    if (sessionCount === 0 && cls.recurrenceStart) {
      await initFirstTerm(cls.id, cls.recurrenceStart)
    } else {
      await rescheduleFutureSessions(cls.id)
    }
  } else {
    await createOneOffSession(cls.id)
  }

  return Response.json(cls)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/classes/[id]'>) {
  const { id } = await ctx.params
  await prisma.class.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
