import { prisma } from '@/lib/db'
import { rescheduleFutureSessions } from '@/lib/sessions'
import { logAction, getActorStaffId } from '@/lib/staff-actions'

export async function POST(request: Request, ctx: RouteContext<'/api/classes/[id]/reschedule'>) {
  const { id } = await ctx.params
  const body = await request.json()
  const classId = Number(id)
  const staffId = await getActorStaffId()

  // Update class schedule fields
  await prisma.class.update({
    where: { id: classId },
    data: {
      dayOfWeek: body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : undefined,
      startTime: body.startTime ?? undefined,
      endTime: body.endTime ?? undefined,
    },
  })

  // Regenerate future sessions
  await rescheduleFutureSessions(classId)

  if (staffId) {
    logAction({ staffId, type: 'class_rescheduled', description: 'Rescheduled class recurring schedule', metadata: { classId } })
  }

  return new Response(null, { status: 204 })
}
