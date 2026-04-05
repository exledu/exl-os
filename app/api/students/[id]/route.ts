import { prisma } from '@/lib/db'
import { logAction, getActorStaffId } from '@/lib/staff-actions'

export async function GET(_req: Request, ctx: RouteContext<'/api/students/[id]'>) {
  const { id } = await ctx.params
  const student = await prisma.student.findUnique({
    where: { id: Number(id) },
    include: {
      yearLevel: true,
      enrolments: {
        include: {
          class: {
            include: {
              subject: true,
              yearLevel: true,
              staff: true,
              room: true,
            },
          },
        },
      },
      issues: {
        orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
      },
    },
  })
  if (!student) return new Response('Not found', { status: 404 })
  return Response.json(student)
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/students/[id]'>) {
  const { id } = await ctx.params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if ('name' in body && body.name)       data.name            = body.name
  if ('lastName' in body)                data.lastName        = body.lastName        ?? null
  if ('email' in body)                   data.email           = body.email           ?? null
  if ('phone' in body)                   data.phone           = body.phone           ?? null
  if ('school' in body)                  data.school          = body.school          ?? null
  if ('yearLevelId' in body)             data.yearLevelId     = Number(body.yearLevelId)
  if ('parentFirstName' in body)         data.parentFirstName = body.parentFirstName ?? null
  if ('parentLastName' in body)          data.parentLastName  = body.parentLastName  ?? null
  if ('parentEmail' in body)             data.parentEmail     = body.parentEmail     ?? null
  if ('parentPhone' in body)             data.parentPhone     = body.parentPhone     ?? null
  if ('notes' in body)                   data.notes           = body.notes           ?? null

  const studentId = Number(id)
  const student = await prisma.student.update({
    where: { id: studentId },
    data,
    include: { yearLevel: true },
  })

  if ('notes' in body) {
    const actorStaffId = await getActorStaffId()
    if (actorStaffId) {
      logAction({
        staffId: actorStaffId,
        type: 'student_note_updated',
        description: `Updated notes for ${student.name}`,
        metadata: { studentId },
      })
    }
  }

  return Response.json(student)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/students/[id]'>) {
  const { id } = await ctx.params
  await prisma.student.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
