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

  const session = await prisma.classSession.update({ where: { id: sessionId }, data })

  if (actorStaffId) {
    if (body.date !== undefined) {
      logAction({ staffId: actorStaffId, type: 'session_rescheduled', description: `Rescheduled session to ${body.date}`, metadata: { sessionId } })
    }
    if ('staffId' in body) {
      logAction({ staffId: actorStaffId, type: 'session_staff_changed', description: 'Changed session staff', metadata: { sessionId } })
    }
  }

  return Response.json(session)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/sessions/[id]'>) {
  const { id } = await ctx.params
  await prisma.classSession.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
