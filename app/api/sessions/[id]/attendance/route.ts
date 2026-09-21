import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const sessionId = Number(id)

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { classId: true, date: true },
  })
  if (!session) return new Response('Session not found', { status: 404 })

  // enrolments in effect at the time of this session — a student who joined
  // afterwards shouldn't retroactively appear on the roster.
  const enrolmentCutoff = new Date(session.date)
  enrolmentCutoff.setUTCHours(23, 59, 59, 999)

  const [enrolments, trials, attendance] = await Promise.all([
    prisma.enrolment.findMany({
      where: { classId: session.classId, enrolledAt: { lte: enrolmentCutoff } },
      include: { student: { select: { id: true, name: true, lastName: true } } },
    }),
    prisma.trialEnrolment.findMany({
      where: { sessionId },
      include: { student: { select: { id: true, name: true, lastName: true } } },
    }),
    prisma.attendance.findMany({
      where: { sessionId },
      select: { studentId: true, present: true },
    }),
  ])

  const presentMap = new Map(attendance.map(a => [a.studentId, a.present]))
  const enrolledIds = new Set(enrolments.map(e => e.student.id))

  const rows = [
    ...enrolments.map(e => ({
      studentId: e.student.id,
      name:      e.student.name,
      lastName:  e.student.lastName,
      present:   presentMap.get(e.student.id) ?? false,
      isTrial:   false,
    })),
    // Trial students who aren't already enrolled in the class
    ...trials
      .filter(t => !enrolledIds.has(t.student.id))
      .map(t => ({
        studentId: t.student.id,
        name:      t.student.name,
        lastName:  t.student.lastName,
        present:   presentMap.get(t.student.id) ?? false,
        isTrial:   true,
      })),
  ]

  return Response.json(rows)
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const sessionId = Number(id)
  const body = await request.json() as {
    studentId: number
    present?: boolean
    notifiedAbsent?: boolean
    homework?: 'UNATTEMPTED' | 'INCOMPLETE' | 'SATISFACTORY' | 'EXCELLENT' | null
  }
  const { studentId } = body

  // Build the update patch — only writes the fields that were sent.
  const patch: Record<string, unknown> = {}
  if (typeof body.present === 'boolean')        patch.present = body.present
  if (typeof body.notifiedAbsent === 'boolean') patch.notifiedAbsent = body.notifiedAbsent
  if ('homework' in body)                       patch.homework = body.homework

  const updated = await prisma.attendance.upsert({
    where: { sessionId_studentId: { sessionId, studentId } },
    create: {
      sessionId,
      studentId,
      present:        body.present        ?? false,
      notifiedAbsent: body.notifiedAbsent ?? false,
      homework:       body.homework       ?? null,
    },
    update: patch,
  })

  return Response.json(updated)
}
