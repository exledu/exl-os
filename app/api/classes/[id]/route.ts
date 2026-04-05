import { prisma } from '@/lib/db'
import { generateSessions, createOneOffSession } from '@/lib/sessions'

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
      endTime: body.endTime ?? null,
      recurrenceStart: body.isRecurring && body.recurrenceStart ? new Date(body.recurrenceStart) : null,
      recurrenceEnd: body.isRecurring && body.recurrenceEnd ? new Date(body.recurrenceEnd) : null,
      sessionDate: !body.isRecurring && body.sessionDate ? new Date(body.sessionDate) : null,
    },
    include: { subject: true, yearLevel: true, staff: true, room: true },
  })

  if (body.isRecurring) {
    await generateSessions(cls.id)
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
