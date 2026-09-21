import { prisma } from '@/lib/db'
import { rescheduleFutureSessions, createOneOffSession } from '@/lib/sessions'
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
  return Response.json(cls, {
    headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
  })
}

/**
 * Partial update. Only fields present in the body are written. When startTime
 * or yearLevelId change, endTime is re-derived from the duration rule. When
 * scheduling fields change (dayOfWeek, startTime, yearLevelId), future
 * sessions are auto-rescheduled to keep in sync.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/classes/[id]'>) {
  const { id } = await ctx.params
  const classId = Number(id)
  const body = await request.json() as {
    subjectId?:       number
    yearLevelId?:     number
    staffId?:         number
    roomId?:          number | null
    maxCapacity?:     number
    isRecurring?:     boolean
    dayOfWeek?:       number | null
    startTime?:       string | null
    recurrenceStart?: string | null
    sessionDate?:     string | null
  }

  const current = await prisma.class.findUnique({ where: { id: classId } })
  if (!current) return new Response('Not found', { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {}
  const schedFieldChanged =
    body.startTime   !== undefined ||
    body.dayOfWeek   !== undefined ||
    body.yearLevelId !== undefined

  if (body.subjectId   !== undefined) data.subjectId   = Number(body.subjectId)
  if (body.yearLevelId !== undefined) data.yearLevelId = Number(body.yearLevelId)
  if (body.staffId     !== undefined) data.staffId     = Number(body.staffId)
  if (body.roomId      !== undefined) data.roomId      = body.roomId ? Number(body.roomId) : null
  if (body.maxCapacity !== undefined) data.maxCapacity = Number(body.maxCapacity)
  if (body.isRecurring !== undefined) data.isRecurring = body.isRecurring
  if (body.dayOfWeek   !== undefined) data.dayOfWeek   = body.dayOfWeek === null ? null : Number(body.dayOfWeek)
  if (body.startTime   !== undefined) data.startTime   = body.startTime
  if (body.recurrenceStart !== undefined) data.recurrenceStart = body.recurrenceStart ? new Date(body.recurrenceStart) : null
  if (body.sessionDate     !== undefined) data.sessionDate     = body.sessionDate     ? new Date(body.sessionDate)     : null

  // Re-derive endTime whenever the inputs to the duration rule change.
  if (schedFieldChanged) {
    const effectiveStart = data.startTime   ?? current.startTime
    const effectiveYLId  = data.yearLevelId ?? current.yearLevelId
    if (effectiveStart) {
      const yl = await prisma.yearLevel.findUnique({ where: { id: effectiveYLId } })
      if (!yl) return Response.json({ error: 'Invalid yearLevelId' }, { status: 400 })
      data.endTime = computeEndTime(effectiveStart, yl.level)
    }
  }

  const cls = await prisma.class.update({
    where: { id: classId },
    data,
    include: { subject: true, yearLevel: true, staff: true, room: true },
  })

  // Only propagate to sessions when scheduling actually changed.
  if (schedFieldChanged) {
    if (cls.isRecurring) {
      await rescheduleFutureSessions(cls.id)
    } else if (body.sessionDate !== undefined || body.startTime !== undefined) {
      await createOneOffSession(cls.id)
    }
  }

  return Response.json(cls)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/classes/[id]'>) {
  const { id } = await ctx.params
  await prisma.class.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
