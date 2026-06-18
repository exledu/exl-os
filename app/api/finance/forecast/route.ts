import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { rateFor, parseHours } from '@/lib/payroll-calc'
import { TERMLY_PRICE, adminCostFor, superFor } from '@/lib/pricing'
import {
  projectStudents, currentTermPos, compareTerm,
  type ProjectedStudent, type TermPos,
} from '@/lib/finance-projection'

const SESSIONS_PER_TERM = 10

export async function GET(request: Request) {
  const store = await cookies()
  if (store.get('exl-finance-unlock')?.value !== 'unlocked') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const year = Number(url.searchParams.get('year'))
  const term = Number(url.searchParams.get('term'))

  if (!year || !term || term < 1 || term > 4) {
    return Response.json({ error: 'Invalid year or term (term must be 1-4)' }, { status: 400 })
  }

  const target:   TermPos = { year, term }
  const baseline: TermPos = currentTermPos()
  const isFuture = compareTerm(target, baseline) > 0

  if (!isFuture) {
    return Response.json(await actuals(target))
  }
  return Response.json(await projection(target, baseline))
}

// ── Past / current term: real invoices + real sessions ─────────────────────

async function actuals(target: TermPos) {
  const classes = await prisma.class.findMany({
    select: {
      id: true,
      enrolments: { select: { studentId: true } },
      sessions: {
        orderBy: { date: 'asc' },
        select: { date: true, startTime: true, endTime: true, cancelled: true },
      },
    },
  })

  let tutorHours = 0
  let tutorCost  = 0
  let sessionCount = 0
  let earliest: Date | null = null
  let latest:   Date | null = null

  for (const cls of classes) {
    const startIdx = (target.term - 1) * SESSIONS_PER_TERM
    const endIdx   = target.term * SESSIONS_PER_TERM
    const termSessions = cls.sessions.slice(startIdx, endIdx)
    const rate = rateFor(cls.enrolments.length)
    for (const s of termSessions) {
      if (s.cancelled) continue
      if (s.date.getUTCFullYear() !== target.year) continue
      const hours = parseHours(s.startTime, s.endTime)
      tutorHours   += hours
      tutorCost    += hours * rate
      sessionCount += 1
      if (!earliest || s.date < earliest) earliest = s.date
      if (!latest   || s.date > latest)   latest   = s.date
    }
  }

  const invoices = await prisma.invoice.findMany({
    where: { year: target.year, term: target.term, status: { not: 'VOID' } },
    select: { total: true },
  })
  const revenue = invoices.reduce((sum, i) => sum + i.total, 0)

  const adminCost = adminCostFor(target.year, target.term)
  return {
    projected: false,
    year: target.year,
    term: target.term,
    tutorHours,
    tutorCost,
    adminCost,
    superCost: superFor(tutorCost + adminCost),
    sessionCount,
    revenue,
    invoiceCount: invoices.length,
    rangeStart: earliest ? earliest.toISOString().slice(0, 10) : null,
    rangeEnd:   latest   ? latest.toISOString().slice(0, 10)   : null,
  }
}

// ── Future term: project enrolments forward, multiply by termly prices ──────

async function projection(target: TermPos, baseline: TermPos) {
  // Baseline = today's database. Snapshot every student × subjects they take.
  const students = await prisma.student.findMany({
    where: { archived: false },
    select: {
      id: true,
      yearLevel: { select: { level: true } },
      enrolments: {
        select: {
          class: { select: { subjectId: true, yearLevelId: true } },
        },
      },
    },
  })

  const baselineSnapshot: ProjectedStudent[] = students
    .filter(s => s.enrolments.length > 0)
    .map(s => ({
      studentId:  s.id,
      yearLevel:  s.yearLevel.level,
      subjectIds: Array.from(new Set(s.enrolments.map(e => e.class.subjectId))),
    }))

  const projected = projectStudents(baselineSnapshot, baseline, target)

  // ── Revenue: sum TERMLY_PRICE[year] × subjects taken, per student ─────────
  // Multi-subject discount applied per student.
  let revenue = 0
  let projectedStudentCount = 0
  for (const s of projected) {
    const price = TERMLY_PRICE[s.yearLevel]
    if (price == null) continue   // Yr 6 dropping in, Yr 13, etc.
    const n = s.subjectIds.length
    if (n === 0) continue
    const discountPct = n >= 3 ? 0.10 : n === 2 ? 0.05 : 0
    revenue += price * n * (1 - discountPct)
    projectedStudentCount += 1
  }

  // ── Tutor cost: for each current class, count projected students whose
  //    rolled-forward year matches that class's year level and who take that
  //    class's subject. Multiply hours × rate × 10 sessions/term. ───────────
  const classes = await prisma.class.findMany({
    where: { archived: false, isRecurring: true },
    select: {
      id: true,
      subjectId: true,
      yearLevel: { select: { level: true } },
      startTime: true,
      endTime: true,
    },
  })

  let tutorHours = 0
  let tutorCost  = 0
  let activeClassCount = 0
  for (const cls of classes) {
    if (!cls.startTime || !cls.endTime) continue
    const hoursPerSession = parseHours(cls.startTime, cls.endTime)
    const projectedEnrolment = projected.filter(s =>
      s.yearLevel === cls.yearLevel.level && s.subjectIds.includes(cls.subjectId)
    ).length
    if (projectedEnrolment === 0) continue
    const rate = rateFor(projectedEnrolment)
    tutorHours += hoursPerSession * SESSIONS_PER_TERM
    tutorCost  += hoursPerSession * SESSIONS_PER_TERM * rate
    activeClassCount += 1
  }

  const adminCost = adminCostFor(target.year, target.term)
  return {
    projected: true,
    year: target.year,
    term: target.term,
    tutorHours,
    tutorCost,
    adminCost,
    superCost: superFor(tutorCost + adminCost),
    sessionCount: activeClassCount * SESSIONS_PER_TERM,
    revenue,
    invoiceCount:  0,
    projectedStudentCount,
    rangeStart: null,
    rangeEnd:   null,
  }
}
