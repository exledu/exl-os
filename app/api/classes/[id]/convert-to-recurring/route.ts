import { prisma } from '@/lib/db'
import { logAction, getActorStaffId } from '@/lib/staff-actions'

const SESSIONS_PER_TERM = 10

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const classId = Number(id)
  const body = await request.json().catch(() => ({})) as {
    dayOfWeek?:  number
    startTime?:  string
    endTime?:    string
    /** Week of the term the trial corresponds to (1..10). 1 = student joined at start
     *  of term (pad 9 more sessions). 4 = student joined at W4 mid-term (pad 6 more). */
    weekOfTerm?: number
  }

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: { sessions: { orderBy: { date: 'asc' } } },
  })
  if (!cls) return new Response('Not found', { status: 404 })
  if (cls.isRecurring) return new Response('Class is already recurring', { status: 400 })
  if (cls.sessions.length === 0) return new Response('No trial session to convert from', { status: 400 })
  if (cls.sessions.length > 1) return new Response('Class has multiple sessions — cannot convert', { status: 400 })

  const trial = cls.sessions[0]

  // Resolve defaults from the trial session
  const dayOfWeek = body.dayOfWeek ?? trial.date.getUTCDay()
  const startTime = body.startTime ?? trial.startTime
  const endTime   = body.endTime   ?? trial.endTime

  const weekOfTerm = body.weekOfTerm ?? 1
  if (dayOfWeek < 0 || dayOfWeek > 6) return new Response('Invalid dayOfWeek', { status: 400 })
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return new Response('Invalid time', { status: 400 })
  if (endTime <= startTime) return new Response('endTime must be after startTime', { status: 400 })
  if (!Number.isInteger(weekOfTerm) || weekOfTerm < 1 || weekOfTerm > SESSIONS_PER_TERM) {
    return new Response('weekOfTerm must be 1..10', { status: 400 })
  }

  // Flip the class to recurring
  await prisma.class.update({
    where: { id: classId },
    data: {
      isRecurring:     true,
      dayOfWeek,
      startTime,
      endTime,
      recurrenceStart: trial.date,
      sessionDate:     null,
    },
  })

  // Update the trial's times if the admin changed them as part of the convert
  if (trial.startTime !== startTime || trial.endTime !== endTime) {
    await prisma.classSession.update({
      where: { id: trial.id },
      data:  { startTime, endTime },
    })
  }

  // Generate the remaining sessions to round out Term 1.
  // Start at trial.date + 7 days, then nudge to the requested day of week.
  const cursor = new Date(trial.date)
  cursor.setUTCDate(cursor.getUTCDate() + 7)
  const dayDiff = (dayOfWeek - cursor.getUTCDay() + 7) % 7
  cursor.setUTCDate(cursor.getUTCDate() + dayDiff)

  // Pad enough sessions to round out the current term. If the trial is W4 (mid-term),
  // we only need 6 more (10 - 4) to finish Term 1.
  const need = SESSIONS_PER_TERM - weekOfTerm
  const newRows: { classId: number; date: Date; startTime: string; endTime: string }[] = []
  for (let i = 0; i < need; i++) {
    newRows.push({
      classId,
      date:      new Date(cursor),
      startTime,
      endTime,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  await prisma.classSession.createMany({ data: newRows })

  const actorStaffId = await getActorStaffId()
  if (actorStaffId) {
    logAction({
      staffId: actorStaffId,
      type: 'class_rescheduled',
      description: `Converted class #${classId} from one-off to recurring; seeded ${need} more sessions`,
      metadata: { classId, sessionsAdded: need },
    })
  }

  return Response.json({ ok: true, sessionsAdded: need })
}
