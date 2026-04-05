import { prisma } from '@/lib/db'

export async function GET(_req: Request, ctx: RouteContext<'/api/students/[id]/timetable'>) {
  const { id } = await ctx.params
  const studentId = Number(id)

  // Find all classes this student is enrolled in
  const enrolments = await prisma.enrolment.findMany({
    where: { studentId },
    select: { classId: true },
  })

  const classIds = enrolments.map(e => e.classId)
  if (classIds.length === 0) return Response.json([])

  // Fetch all sessions for those classes, ordered by date
  const sessions = await prisma.classSession.findMany({
    where: {
      classId: { in: classIds },
      cancelled: false,
    },
    include: {
      class: {
        include: {
          subject: true,
          yearLevel: true,
          staff: true,
          room: true,
        },
      },
      staff: true, // session-level staff override
    },
    orderBy: { date: 'asc' },
  })

  const result = sessions.map(s => ({
    id: s.id,
    date: s.date.toISOString().split('T')[0],
    originalDate: s.originalDate ? s.originalDate.toISOString().split('T')[0] : null,
    startTime: s.startTime,
    endTime: s.endTime,
    classId: s.classId,
    subject: s.class.subject.name,
    yearLevel: s.class.yearLevel.level,
    staff: s.staff?.name ?? s.class.staff.name,
    staffOverridden: s.staffId !== null && s.staffId !== s.class.staffId,
    room: s.class.room?.name ?? null,
  }))

  return Response.json(result)
}
