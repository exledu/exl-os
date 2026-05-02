import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'

// Compensation: $40/hr for 1-2 students, +$2/hr per extra student up to 6 ($48/hr cap)
function rateFor(students: number): number {
  if (students <= 2) return 40
  if (students >= 6) return 48
  return 40 + (students - 2) * 2
}

function parseHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60
}

function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

export async function GET(request: Request) {
  const store = await cookies()
  if (store.get('exl-finance-unlock')?.value !== 'unlocked') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const startParam = url.searchParams.get('start')
  const start = startParam ? parseDateOnly(startParam) : null
  if (!start) {
    return Response.json({ error: 'Missing or invalid start (YYYY-MM-DD)' }, { status: 400 })
  }
  // Inclusive 14-day window: start .. start+13 (i.e. lt start+14)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 14)

  const sessions = await prisma.classSession.findMany({
    where: {
      cancelled: false,
      date: { gte: start, lt: end },
    },
    include: {
      class: {
        include: {
          subject:    { select: { name: true } },
          yearLevel:  { select: { level: true } },
          staff:      { select: { id: true, name: true } },
          enrolments: { select: { studentId: true } },
        },
      },
      staff: { select: { id: true, name: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  type SessionLine = {
    sessionId: number
    date:      string
    startTime: string
    endTime:   string
    className: string
    students:  number
    hours:     number
    rate:      number
    pay:       number
    isCover:   boolean   // session.staff overrode class.staff
  }
  type TutorBreakdown = {
    staffId:   number | null
    name:      string
    sessions:  SessionLine[]
    totalHours: number
    totalPay:   number
  }

  const byStaff = new Map<number | string, TutorBreakdown>()

  for (const s of sessions) {
    const teacher = s.staff ?? s.class.staff
    const key: number | string = teacher?.id ?? '__none__'
    const name = teacher?.name ?? '(no teacher)'
    const students = s.class.enrolments.length
    const hours = parseHours(s.startTime, s.endTime)
    const rate = rateFor(students)
    const pay = hours * rate

    const line: SessionLine = {
      sessionId: s.id,
      date:      s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime:   s.endTime,
      className: `Yr${s.class.yearLevel.level} ${s.class.subject.name}`,
      students,
      hours,
      rate,
      pay,
      isCover:   !!s.staff && s.staff.id !== s.class.staff?.id,
    }

    const existing = byStaff.get(key)
    if (existing) {
      existing.sessions.push(line)
      existing.totalHours += hours
      existing.totalPay += pay
    } else {
      byStaff.set(key, {
        staffId: teacher?.id ?? null,
        name,
        sessions: [line],
        totalHours: hours,
        totalPay:   pay,
      })
    }
  }

  const breakdown = Array.from(byStaff.values()).sort((a, b) => b.totalPay - a.totalPay)
  const totalPay = breakdown.reduce((sum, t) => sum + t.totalPay, 0)
  const totalHours = breakdown.reduce((sum, t) => sum + t.totalHours, 0)

  return Response.json({
    start: start.toISOString().slice(0, 10),
    end:   new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10), // inclusive end for display
    sessionCount: sessions.length,
    totalHours,
    totalPay,
    breakdown,
  })
}
