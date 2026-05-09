import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { rateFor, parseHours } from '@/lib/payroll-calc'

// Term to month range (1-indexed terms, 0-indexed months)
const TERM_MONTHS: Record<number, [number, number]> = {
  1: [0, 2],
  2: [3, 5],
  3: [6, 8],
  4: [9, 11],
}

export async function GET(request: Request) {
  const store = await cookies()
  if (store.get('exl-finance-unlock')?.value !== 'unlocked') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const year = Number(url.searchParams.get('year'))
  const term = Number(url.searchParams.get('term'))

  if (!year || !term || !TERM_MONTHS[term]) {
    return Response.json({ error: 'Invalid year or term' }, { status: 400 })
  }

  const [startMonth, endMonth] = TERM_MONTHS[term]
  const start = new Date(Date.UTC(year, startMonth, 1))
  const end = new Date(Date.UTC(year, endMonth + 1, 1))

  const [sessions, invoices] = await Promise.all([
    prisma.classSession.findMany({
      where: {
        date: { gte: start, lt: end },
        cancelled: false,
      },
      select: {
        startTime: true,
        endTime: true,
        class: { select: { enrolments: { select: { studentId: true } } } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        year,
        term,
        status: { not: 'VOID' },
      },
      select: { total: true, status: true },
    }),
  ])

  // Per-session: rate scales with enrolment count (matches Payroll tab logic)
  let tutorHours = 0
  let tutorCost = 0
  for (const s of sessions) {
    const hours = parseHours(s.startTime, s.endTime)
    const rate  = rateFor(s.class.enrolments.length)
    tutorHours += hours
    tutorCost  += hours * rate
  }
  const revenue = invoices.reduce((sum, i) => sum + i.total, 0)

  return Response.json({
    year,
    term,
    tutorHours,
    tutorCost,
    sessionCount: sessions.length,
    revenue,
    invoiceCount: invoices.length,
  })
}
