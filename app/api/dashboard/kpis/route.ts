import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const todayParam = searchParams.get('today') // "YYYY-MM-DD" from browser

  // Use the client-supplied local date for @db.Date comparisons.
  // @db.Date stores pure dates; Prisma represents them as midnight UTC.
  const todayDate = todayParam
    ? new Date(todayParam + 'T00:00:00.000Z')
    : new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z')

  // For createdAt (a full timestamp), bracket the client's local day in UTC
  // by using the date boundaries directly.
  const dayStart = todayDate
  const dayEnd = new Date(todayDate.getTime() + 86400000 - 1) // 23:59:59.999 UTC

  const [
    todaySessions,
    unresolvedIssues,
    trialsToday,
    classesWithCapacity,
    atRiskStudents,
  ] = await Promise.all([
    // 1. Today's sessions (non-cancelled) with enrolled counts
    //    date is @db.Date — Prisma stores as midnight UTC, so exact match works
    prisma.classSession.findMany({
      where: {
        date: todayDate,
        cancelled: false,
      },
      include: {
        class: {
          include: {
            _count: { select: { enrolments: true } },
          },
        },
      },
    }),

    // 2. Unresolved issues count
    prisma.issue.count({
      where: { resolved: false },
    }),

    // 3. Free trial issues created today
    prisma.issue.count({
      where: {
        type: 'FREE_TRIAL',
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    }),

    // 4. All classes with capacity info
    prisma.class.findMany({
      select: {
        maxCapacity: true,
        _count: { select: { enrolments: true } },
      },
    }),

    // 5. Students linked to open CANCELLATION or RESCHEDULE issues
    prisma.issue.findMany({
      where: {
        resolved: false,
        type: { in: ['CANCELLATION', 'RESCHEDULE'] },
        studentId: { not: null },
      },
      select: { studentId: true },
      distinct: ['studentId'],
    }),
  ])

  // Compute KPIs
  const todaysClasses = todaySessions.length
  const studentsToday = todaySessions.reduce(
    (sum, s) => sum + s.class._count.enrolments,
    0
  )
  const seatsAvailable = classesWithCapacity.filter(
    (c) => c._count.enrolments < c.maxCapacity
  ).length

  return Response.json({
    todaysClasses,
    studentsToday,
    trialsToday,
    unresolvedIssues,
    seatsAvailable,
    totalClasses: classesWithCapacity.length,
    atRiskStudents: atRiskStudents.length,
  })
}
