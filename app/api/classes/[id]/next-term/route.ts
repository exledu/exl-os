import { addNextTerm } from '@/lib/sessions'
import { logAction, getActorStaffId } from '@/lib/staff-actions'

export async function POST(_req: Request, ctx: RouteContext<'/api/classes/[id]/next-term'>) {
  const { id } = await ctx.params
  const classId = Number(id)
  const staffId = await getActorStaffId()

  await addNextTerm(classId)

  if (staffId) {
    logAction({ staffId, type: 'term_added', description: 'Added next term', metadata: { classId } })
  }

  return new Response(null, { status: 204 })
}
