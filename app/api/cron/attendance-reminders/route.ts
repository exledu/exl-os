import { prisma } from '@/lib/db'
import { sendDM, lookupSlackUserByEmail } from '@/lib/slack'
import { buildAttendanceDmBlocks } from '@/lib/slack-attendance'

export const dynamic = 'force-dynamic'

// startTime/endTime strings (e.g. "16:10") are stored as Sydney local time.
// The cron may run in any timezone (Vercel = UTC), so we compute the Sydney
// UTC-offset for a given date and combine accordingly.
function sydneyOffsetMinutes(forDate: Date): number {
  const sydney = new Date(forDate.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const utc    = new Date(forDate.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((sydney.getTime() - utc.getTime()) / 60000)
}

function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const offsetMin = sydneyOffsetMinutes(date)
  const utcMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m)
                - offsetMin * 60_000
  return new Date(utcMs)
}

// Date range for the query: yesterday → tomorrow (UTC), so we never miss a
// session whose Sydney date sits on either side of UTC midnight.
function yesterdayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - 1)
  return d
}

function tomorrowUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

export async function GET(request: Request) {
  // Auth: require Bearer token matching CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()

  // Pull today's non-cancelled sessions that haven't reached the final reminder level
  const sessions = await prisma.classSession.findMany({
    where: {
      cancelled: false,
      attendanceReminderLevel: { lt: 3 },
      date: { gte: yesterdayUTC(), lte: tomorrowUTC() },
    },
    include: {
      class: {
        include: {
          subject: true,
          yearLevel: true,
          enrolments: { select: { studentId: true } },
        },
      },
      staff: { select: { id: true, name: true, email: true, slackUserId: true } },
      attendances: { select: { studentId: true } },
    },
  })

  type Result = { sessionId: number; action: string; detail?: string }
  const results: Result[] = []

  for (const session of sessions) {
    const start = combineDateAndTime(session.date, session.startTime)
    const elapsedMin = (now.getTime() - start.getTime()) / 60000

    // Determine target level based on elapsed time
    let targetLevel: 1 | 2 | 3 | 0 = 0
    if (elapsedMin >= 40) targetLevel = 3
    else if (elapsedMin >= 30) targetLevel = 2
    else if (elapsedMin >= 0) targetLevel = 1

    if (targetLevel === 0 || targetLevel <= session.attendanceReminderLevel) continue

    // Skip if attendance is fully marked already (any reminder past initial would be noise)
    const enrolledIds = new Set(session.class.enrolments.map(e => e.studentId))
    const markedIds = new Set(session.attendances.map(a => a.studentId))
    const allMarked = enrolledIds.size > 0 && [...enrolledIds].every(id => markedIds.has(id))
    if (allMarked && targetLevel > 1) {
      // Still bump level so we don't keep evaluating this session every cron tick
      await prisma.classSession.update({
        where: { id: session.id },
        data: { attendanceReminderLevel: targetLevel },
      })
      results.push({ sessionId: session.id, action: 'skip-already-marked' })
      continue
    }

    // Resolve the teacher's Slack user id
    const teacher = session.staff
    if (!teacher) {
      results.push({ sessionId: session.id, action: 'skip-no-teacher' })
      continue
    }

    let slackId = teacher.slackUserId
    if (!slackId && teacher.email) {
      slackId = await lookupSlackUserByEmail(teacher.email)
      if (slackId) {
        await prisma.staff.update({
          where: { id: teacher.id },
          data: { slackUserId: slackId },
        })
      }
    }
    if (!slackId) {
      results.push({ sessionId: session.id, action: 'skip-no-slack-id', detail: teacher.email ?? '' })
      continue
    }

    // Send the DM with a "Mark attendance" button
    const { text, blocks } = buildAttendanceDmBlocks(
      {
        id:        session.id,
        date:      session.date,
        startTime: session.startTime,
        endTime:   session.endTime,
        yearLevel: session.class.yearLevel.level,
        subject:   session.class.subject.name,
      },
      targetLevel,
    )

    const dmRes = await sendDM(slackId, text, { blocks })
    if (!dmRes.ok) {
      results.push({ sessionId: session.id, action: 'dm-failed', detail: dmRes.error })
      continue
    }

    await prisma.classSession.update({
      where: { id: session.id },
      data: { attendanceReminderLevel: targetLevel },
    })

    results.push({ sessionId: session.id, action: `dm-sent-level-${targetLevel}` })
  }

  return Response.json({ now: now.toISOString(), processed: results.length, results })
}
