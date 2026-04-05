import { prisma } from '@/lib/db'

export async function POST(request: Request, ctx: RouteContext<'/api/classes/[id]/enrolments'>) {
  const { id } = await ctx.params
  const body = await request.json()
  const enrolment = await prisma.enrolment.create({
    data: { classId: Number(id), studentId: Number(body.studentId) },
    include: { student: { include: { yearLevel: true } } },
  })
  return Response.json(enrolment, { status: 201 })
}

export async function DELETE(request: Request, ctx: RouteContext<'/api/classes/[id]/enrolments'>) {
  const { id } = await ctx.params
  const body = await request.json()
  await prisma.enrolment.deleteMany({
    where: { classId: Number(id), studentId: Number(body.studentId) },
  })
  return new Response(null, { status: 204 })
}
