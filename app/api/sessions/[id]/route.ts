import { prisma } from '@/lib/db'
import { startOfDay } from 'date-fns'
import { logAction, getActorStaffId } from '@/lib/staff-actions'

export async function PATCH(request: Request, ctx: RouteContext<'/api/sessions/[id]'>) {
  const { id } = await ctx.params
  const body = await request.json()
  const sessionId = Number(id)
  const actorStaffId = await getActorStaffId()

  const current = await prisma.classSession.findUnique({ where: { id: sessionId } })
  if (!current) return new Response('Not found', { status: 404 })

  // Build update payload — only update fields that are present in body
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}

  if (body.date !== undefined) {
    const newDate = new Date(body.date)
    data.date = startOfDay(newDate)
    // Preserve original date on first edit
    data.originalDate = current.originalDate ?? startOfDay(current.date)
  }

  if ('staffId' in body) {
    // null means revert to class default
    data.staffId = body.staffId ?? null
  }

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
  if (typeof body.startTime === 'string') {
    if (!TIME_RE.test(body.startTime)) return new Response('Invalid startTime', { status: 400 })
    data.startTime = body.startTime
  }
  if (typeof body.endTime === 'string') {
    if (!TIME_RE.test(body.endTime)) return new Response('Invalid endTime', { status: 400 })
    data.endTime = body.endTime
  }

  // Cross-field validation: end must be strictly after start
  const finalStart = data.startTime ?? current.startTime
  const finalEnd   = data.endTime   ?? current.endTime
  if (finalEnd <= finalStart) {
    return new Response('endTime must be after startTime', { status: 400 })
  }

  const session = await prisma.classSession.update({ where: { id: sessionId }, data })

  if (actorStaffId) {
    if (body.date !== undefined) {
      logAction({ staffId: actorStaffId, type: 'session_rescheduled', description: `Rescheduled session to ${body.date}`, metadata: { sessionId } })
    }
    if ('staffId' in body) {
      logAction({ staffId: actorStaffId, type: 'session_staff_changed', description: 'Changed session staff', metadata: { sessionId } })
    }
    if (typeof body.startTime === 'string' || typeof body.endTime === 'string') {
      const finalStart = data.startTime ?? current.startTime
      const finalEnd   = data.endTime   ?? current.endTime
      logAction({ staffId: actorStaffId, type: 'session_rescheduled', description: `Changed session time to ${finalStart}–${finalEnd}`, metadata: { sessionId } })
    }
  }

  return Response.json(session)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/sessions/[id]'>) {
  const { id } = await ctx.params
  await prisma.classSession.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
