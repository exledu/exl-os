import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { rateFor, parseHours } from '@/lib/payroll-calc'

export const dynamic = 'force-dynamic'

// Same anchor the Payroll page uses: Monday 20 Apr 2026, fortnights every 14 days.
const ANCHOR_UTC = Date.UTC(2026, 3, 20)
const DAY_MS = 86_400_000

/**
 * GET /api/terms/[id]/staff/[staffId]/payroll
 *
 * Fortnight-by-fortnight payroll history for one staff, scoped to the
 * fortnights that overlap this term's window.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; staffId: string }> }) {
  const auth$ = await auth()
  if (!auth$) return new Response('Unauthorized', { status: 401 })
  const { id, staffId } = await ctx.params
  const termId  = Number(id)
  const staffN  = Number(staffId)

  const term = await prisma.term.findUnique({ where: { id: termId } })
  if (!term) return new Response('Term not found', { status: 404 })

  // Fortnight starts that overlap [termStart, termEnd).
  const termStartMs = term.startDate.getTime()
  const termEndMs   = termStartMs + term.weeks * 7 * DAY_MS
  const firstIdx = Math.floor((termStartMs - ANCHOR_UTC) / (14 * DAY_MS))
  const fortnights: { start: Date; end: Date }[] = []
  for (let i = firstIdx; ; i++) {
    const startMs = ANCHOR_UTC + i * 14 * DAY_MS
    if (startMs >= termEndMs) break
    fortnights.push({
      start: new Date(startMs),
      end:   new Date(startMs + 14 * DAY_MS),
    })
  }

  // Pull all this staff's non-cancelled sessions inside the term window in one go.
  const rangeStart = fortnights[0]?.start ?? new Date(termStartMs)
  const rangeEnd   = new Date(termEndMs)
  const sessions = await prisma.classSession.findMany({
    where: {
      cancelled: false,
      date: { gte: rangeStart, lt: rangeEnd },
      OR: [
        { staffId: staffN },
        // Effective teacher via class default (no cover override)
        { staffId: null, class: { staffId: staffN } },
      ],
    },
    include: {
      staff: { select: { id: true, name: true } },
      class: {
        include: {
          subject:    { select: { name: true } },
          yearLevel:  { select: { level: true } },
          staff:      { select: { id: true } },
          enrolments: { select: { studentId: true } },
        },
      },
      yearLevel: { select: { level: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  // Bucket sessions into fortnights.
  const buckets = fortnights.map(f => {
    const inFn = sessions.filter(s => s.date >= f.start && s.date < f.end)
    let totalHours = 0
    let totalPay   = 0
    const lines = inFn.map(s => {
      const hours = parseHours(s.startTime, s.endTime)
      const students = s.class.enrolments.length
      const rate = rateFor(students)
      const pay = hours * rate
      totalHours += hours
      totalPay   += pay
      const yr = s.yearLevel?.level ?? s.class.yearLevel.level
      return {
        sessionId: s.id,
        date:      s.date.toISOString().slice(0, 10),
        startTime: s.startTime,
        endTime:   s.endTime,
        className: `Yr${yr} ${s.class.subject.name}`,
        students,
        hours,
        rate,
        pay,
        isCover:   !!s.staff && s.staff.id !== s.class.staff.id,
      }
    })
    return {
      start:      f.start.toISOString().slice(0, 10),
      end:        new Date(f.end.getTime() - DAY_MS).toISOString().slice(0, 10),
      sessions:   lines,
      totalHours: Math.round(totalHours * 10) / 10,
      totalPay:   Math.round(totalPay * 100) / 100,
    }
  })

  return Response.json({ fortnights: buckets }, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' },
  })
}
