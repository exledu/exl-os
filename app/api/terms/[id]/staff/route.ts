import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { rateFor, parseHours } from '@/lib/payroll-calc'

export const dynamic = 'force-dynamic'

/**
 * GET /api/terms/[id]/staff → per-tutor stats scoped to this term.
 *
 * For each staff member:
 *   classes             — non-archived recurring classes they own with at
 *                         least one session in this term.
 *   avgStudentsPerClass — enrolments (current) / those classes.
 *   sessionsThisTerm    — count of non-cancelled sessions in this term
 *                         where they were the effective teacher
 *                         (session.staffId ?? class.staffId). Includes covers.
 *   hoursThisTerm       — sum of (endTime - startTime) across those sessions.
 *   payThisTerm         — sum of hours × rateFor(class.enrolments.length).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params
  const termId = Number(id)

  const term = await prisma.term.findUnique({ where: { id: termId } })
  if (!term) return new Response('Not found', { status: 404 })

  const [allStaff, sessions] = await Promise.all([
    prisma.staff.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, phone: true, roles: true,
        classes: {
          where: { archived: false, isRecurring: true },
          select: {
            id: true,
            enrolments: { select: { studentId: true } },
            sessions:   { where: { termId }, select: { id: true } },
          },
        },
      },
    }),
    prisma.classSession.findMany({
      where: { termId, cancelled: false },
      select: {
        id: true, startTime: true, endTime: true, staffId: true,
        class: {
          select: {
            staffId: true,
            enrolments: { select: { studentId: true } },
          },
        },
      },
    }),
  ])

  // Effective-teacher grouping for "sessions this term" (covers included).
  const byEffectiveStaff = new Map<number, { hours: number; count: number; pay: number }>()
  for (const s of sessions) {
    const effectiveId = s.staffId ?? s.class.staffId
    const hours = parseHours(s.startTime, s.endTime)
    const rate  = rateFor(s.class.enrolments.length)
    const bucket = byEffectiveStaff.get(effectiveId) ?? { hours: 0, count: 0, pay: 0 }
    bucket.hours += hours
    bucket.count += 1
    bucket.pay   += hours * rate
    byEffectiveStaff.set(effectiveId, bucket)
  }

  const rows = allStaff.map(st => {
    // Only classes that actually run in this term.
    const activeClasses = st.classes.filter(c => c.sessions.length > 0)
    const totalStudents = activeClasses.reduce((sum, c) => sum + c.enrolments.length, 0)
    const avg = activeClasses.length > 0
      ? Math.round((totalStudents / activeClasses.length) * 10) / 10
      : 0
    const eff = byEffectiveStaff.get(st.id) ?? { hours: 0, count: 0, pay: 0 }
    return {
      id:                    st.id,
      name:                  st.name,
      email:                 st.email,
      phone:                 st.phone,
      roles:                 st.roles,
      classes:               activeClasses.length,
      totalStudents,
      avgStudentsPerClass:   avg,
      sessionsThisTerm:      eff.count,
      hoursThisTerm:         Math.round(eff.hours * 10) / 10,
      payThisTerm:           Math.round(eff.pay * 100) / 100,
    }
  })

  return Response.json(rows, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' },
  })
}
