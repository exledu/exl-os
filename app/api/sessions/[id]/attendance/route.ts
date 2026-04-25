import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const sessionId = Number(id)

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { classId: true },
  })
  if (!session) return new Response('Session not found', { status: 404 })

  const enrolments = await prisma.enrolment.findMany({
    where: { classId: session.classId },
    include: {
      student: { select: { id: true, name: true, lastName: true } },
    },
  })

  const attendance = await prisma.attendance.findMany({
    where: { sessionId },
    select: { studentId: true, present: true },
  })
  const presentMap = new Map(attendance.map(a => [a.studentId, a.present]))

  const rows = enrolments.map(e => ({
    studentId: e.student.id,
    name: e.student.name,
    lastName: e.student.lastName,
    present: presentMap.get(e.student.id) ?? false,
  }))

  return Response.json(rows)
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const sessionId = Number(id)
  const { studentId, present } = await request.json() as { studentId: number; present: boolean }

  const updated = await prisma.attendance.upsert({
    where: { sessionId_studentId: { sessionId, studentId } },
    create: { sessionId, studentId, present },
    update: { present },
  })

  return Response.json(updated)
}
