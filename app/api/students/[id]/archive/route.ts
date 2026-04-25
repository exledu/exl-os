import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const studentId = Number(id)
  const { archived } = await request.json() as { archived: boolean }

  // When archiving, remove all class enrolments (effectively unenrols from remaining sessions)
  if (archived) {
    await prisma.enrolment.deleteMany({ where: { studentId } })
  }

  const student = await prisma.student.update({
    where: { id: studentId },
    data: { archived },
  })

  return Response.json(student)
}
