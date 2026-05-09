import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { rateFor, parseHours } from '@/lib/payroll-calc'

const SESSIONS_PER_TERM = 10

export async function GET(request: Request) {
  const store = await cookies()
  if (store.get('exl-finance-unlock')?.value !== 'unlocked') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const year = Number(url.searchParams.get('year'))
  const term = Number(url.searchParams.get('term'))

  if (!year || !term || term < 1 || term > 8) {
    return Response.json({ error: 'Invalid year or term' }, { status: 400 })
  }

  // Pull every class with all its sessions in chronological order. Term N for a
  // given class = sessions at positions [10*(N-1), 10*N) — same scheme as the
  // class detail page (/api/classes/[id]/sessions).
  const classes = await prisma.class.findMany({
    select: {
      id: true,
      enrolments: { select: { studentId: true } },
      sessions: {
        orderBy: { date: 'asc' },
        select: { id: true, date: true, startTime: true, endTime: true, cancelled: true },
      },
    },
  })

  let tutorHours = 0
  let tutorCost  = 0
  let sessionCount = 0
  let earliest: Date | null = null
  let latest:   Date | null = null

  for (const cls of classes) {
    const startIdx = (term - 1) * SESSIONS_PER_TERM
    const endIdx   = term * SESSIONS_PER_TERM
    const termSessions = cls.sessions.slice(startIdx, endIdx)
    const studentCount = cls.enrolments.length
    const rate = rateFor(studentCount)

    for (const s of termSessions) {
      if (s.cancelled) continue
      if (s.date.getUTCFullYear() !== year) continue
      const hours = parseHours(s.startTime, s.endTime)
      tutorHours   += hours
      tutorCost    += hours * rate
      sessionCount += 1
      if (!earliest || s.date < earliest) earliest = s.date
      if (!latest   || s.date > latest)   latest   = s.date
    }
  }

  const invoices = await prisma.invoice.findMany({
    where: { year, term, status: { not: 'VOID' } },
    select: { total: true, status: true },
  })
  const revenue = invoices.reduce((sum, i) => sum + i.total, 0)

  return Response.json({
    year,
    term,
    tutorHours,
    tutorCost,
    sessionCount,
    revenue,
    invoiceCount: invoices.length,
    rangeStart: earliest ? earliest.toISOString().slice(0, 10) : null,
    rangeEnd:   latest   ? latest.toISOString().slice(0, 10)   : null,
  })
}
