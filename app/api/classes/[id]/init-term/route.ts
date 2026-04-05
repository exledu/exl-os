import { prisma } from '@/lib/db'
import { initFirstTerm } from '@/lib/sessions'
import { logAction, getActorStaffId } from '@/lib/staff-actions'

export async function POST(request: Request, ctx: RouteContext<'/api/classes/[id]/init-term'>) {
  const { id } = await ctx.params
  const body = await request.json()

  const classId = Number(id)
  const staffId = await getActorStaffId()

  // Ensure no sessions exist yet
  const existing = await prisma.classSession.count({ where: { classId } })
  if (existing > 0) {
    return new Response('Sessions already exist — use add-next-term instead', { status: 409 })
  }

  await initFirstTerm(classId, new Date(body.startDate))

  if (staffId) {
    logAction({ staffId, type: 'term_initialised', description: 'Initialised Term 1', metadata: { classId } })
  }

  return new Response(null, { status: 204 })
}
