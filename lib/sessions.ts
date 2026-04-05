import { addDays, addMonths, setDay, startOfDay } from 'date-fns'
import { prisma } from './db'

/**
 * Generate ClassSession rows for a recurring class over the next `windowMonths` months.
 * Deletes existing future sessions first to handle edits.
 */
export async function generateSessions(classId: number, windowMonths = 3) {
  const cls = await prisma.class.findUnique({ where: { id: classId } })
  if (!cls || !cls.isRecurring) return

  const { dayOfWeek, startTime, endTime, recurrenceStart, recurrenceEnd } = cls
  if (dayOfWeek == null || !startTime || !endTime || !recurrenceStart) return

  const today = startOfDay(new Date())
  const windowEnd = addMonths(today, windowMonths)
  const end = recurrenceEnd && recurrenceEnd < windowEnd ? recurrenceEnd : windowEnd
  const start = recurrenceStart > today ? recurrenceStart : today

  // Delete future sessions for this class
  await prisma.classSession.deleteMany({
    where: { classId, date: { gte: today } },
  })

  // Walk through dates in range that match dayOfWeek
  const sessions: { classId: number; date: Date; startTime: string; endTime: string }[] = []

  // Find first occurrence of dayOfWeek >= start
  let cursor = setDay(start, dayOfWeek, { weekStartsOn: 0 })
  if (cursor < start) cursor = addDays(cursor, 7)

  while (cursor <= end) {
    sessions.push({ classId, date: startOfDay(cursor), startTime, endTime })
    cursor = addDays(cursor, 7)
  }

  if (sessions.length > 0) {
    await prisma.classSession.createMany({ data: sessions })
  }
}

/**
 * Reschedule future sessions (from today) for a recurring class.
 * Moves each future session to the new day of week within its Mon–Sun week.
 * Does NOT create or delete sessions — only updates existing dates.
 * Skips sessions that have been manually edited (originalDate != null).
 * Also updates startTime/endTime if changed.
 */
export async function rescheduleFutureSessions(classId: number) {
  const cls = await prisma.class.findUnique({ where: { id: classId } })
  if (!cls || !cls.isRecurring) return

  const { dayOfWeek, startTime, endTime } = cls
  if (dayOfWeek == null || !startTime || !endTime) return

  const today = startOfDay(new Date())

  // Get all future sessions that haven't been manually edited
  const futureSessions = await prisma.classSession.findMany({
    where: { classId, date: { gt: today }, originalDate: null },
    orderBy: { date: 'asc' },
  })

  for (const session of futureSessions) {
    const currentDate = session.date
    // Find the Monday of this session's week
    const currentDay = currentDate.getUTCDay() // 0=Sun, 1=Mon, ...
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay
    const monday = new Date(currentDate)
    monday.setUTCDate(currentDate.getUTCDate() + mondayOffset)

    // Set to the new day of week within the same Mon–Sun week
    // dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const newDate = new Date(monday)
    newDate.setUTCDate(monday.getUTCDate() + daysFromMonday)

    await prisma.classSession.update({
      where: { id: session.id },
      data: {
        date: newDate,
        startTime,
        endTime,
      },
    })
  }
}

/**
 * Initialise the first term for a recurring class from a specific start date.
 * Generates exactly 10 weekly sessions regardless of whether dates are in the past.
 */
export async function initFirstTerm(classId: number, startDate: Date) {
  const cls = await prisma.class.findUnique({ where: { id: classId } })
  if (!cls?.isRecurring || cls.dayOfWeek == null || !cls.startTime || !cls.endTime) return

  // Find first matching day of week on or after startDate
  let cursor = setDay(startOfDay(startDate), cls.dayOfWeek, { weekStartsOn: 0 })
  if (cursor < startOfDay(startDate)) cursor = addDays(cursor, 7)

  const sessions: { classId: number; date: Date; startTime: string; endTime: string }[] = []
  for (let i = 0; i < 10; i++) {
    sessions.push({ classId, date: startOfDay(cursor), startTime: cls.startTime, endTime: cls.endTime })
    cursor = addDays(cursor, 7)
  }

  await prisma.classSession.createMany({ data: sessions })
}

/**
 * Add the next term (10 sessions) for a recurring class.
 * Skips 2 occurrences (3 weeks) after the last session, then 10 weekly sessions.
 * e.g. last Sunday Term 1 → skip next 2 Sundays → Term 2 starts on the 3rd Sunday.
 */
export async function addNextTerm(classId: number) {
  const cls = await prisma.class.findUnique({ where: { id: classId } })
  if (!cls?.isRecurring || cls.dayOfWeek == null || !cls.startTime || !cls.endTime) return

  const lastSession = await prisma.classSession.findFirst({
    where: { classId },
    orderBy: { date: 'desc' },
  })

  // Use the original date (not a revised date) to calculate the gap
  const lastDate = lastSession
    ? startOfDay(lastSession.originalDate ?? lastSession.date)
    : null
  const afterSkip = lastDate
    ? addDays(lastDate, 21)
    : startOfDay(new Date())

  // Find first matching day of week on or after afterSkip
  let cursor = setDay(afterSkip, cls.dayOfWeek, { weekStartsOn: 0 })
  if (cursor < afterSkip) cursor = addDays(cursor, 7)

  const sessions: { classId: number; date: Date; startTime: string; endTime: string }[] = []
  for (let i = 0; i < 10; i++) {
    sessions.push({ classId, date: startOfDay(cursor), startTime: cls.startTime, endTime: cls.endTime })
    cursor = addDays(cursor, 7)
  }

  await prisma.classSession.createMany({ data: sessions })
}

/**
 * Create a single session for a one-off class.
 */
export async function createOneOffSession(classId: number) {
  const cls = await prisma.class.findUnique({ where: { id: classId } })
  if (!cls || cls.isRecurring || !cls.sessionDate || !cls.startTime || !cls.endTime) return

  await prisma.classSession.deleteMany({ where: { classId } })
  await prisma.classSession.create({
    data: {
      classId,
      date: startOfDay(cls.sessionDate),
      startTime: cls.startTime,
      endTime: cls.endTime,
    },
  })
}
