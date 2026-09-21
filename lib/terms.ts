import { prisma } from '@/lib/db'
import { addDays, startOfDay } from 'date-fns'

/**
 * Term-driven session generation. A Term is a shared 10-week window that every
 * recurring class hangs off. Creating a term walks every non-archived recurring
 * class and inserts one ClassSession per week (W1..W10) at the class's dayOfWeek
 * offset from the term's startDate.
 */

interface CreateTermInput {
  name:       string   // "T4 2026"
  year:       number
  termNumber: number   // 1..4
  startDate:  Date     // Monday of W1
  weeks?:     number   // default 10
}

export async function createTerm(input: CreateTermInput) {
  const weeks = input.weeks ?? 10
  const term  = await prisma.term.create({
    data: {
      name:       input.name,
      year:       input.year,
      termNumber: input.termNumber,
      startDate:  startOfDay(input.startDate),
      weeks,
    },
  })
  const seeded = await seedTermForAllClasses(term.id)
  return { term, seeded }
}

/**
 * Iterate every non-archived recurring class and create W1..W(term.weeks)
 * sessions. Skips (class, week) rows that already exist for the term.
 */
export async function seedTermForAllClasses(termId: number) {
  const term = await prisma.term.findUnique({ where: { id: termId } })
  if (!term) throw new Error('Term not found')
  const classes = await prisma.class.findMany({
    where: {
      archived:    false,
      isRecurring: true,
      dayOfWeek:   { not: null },
      startTime:   { not: null },
      endTime:     { not: null },
    },
    select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
  })
  let created = 0
  for (const cls of classes) {
    for (let w = 1; w <= term.weeks; w++) {
      const date = weekDate(term.startDate, w, cls.dayOfWeek!)
      const existing = await prisma.classSession.findFirst({
        where: { classId: cls.id, termId: term.id, weekNumber: w },
      })
      if (existing) continue
      await prisma.classSession.create({
        data: {
          classId:    cls.id,
          termId:     term.id,
          weekNumber: w,
          date,
          startTime:  cls.startTime!,
          endTime:    cls.endTime!,
        },
      })
      created++
    }
  }
  return { classCount: classes.length, sessionsCreated: created }
}

/**
 * Slot a single class into an existing term. Creates sessions from `fromWeek`
 * through the last week. Used when a class is created mid-term.
 */
export async function slotClassIntoTerm(classId: number, termId: number, fromWeek: number) {
  const [term, cls] = await Promise.all([
    prisma.term.findUnique({ where: { id: termId } }),
    prisma.class.findUnique({ where: { id: classId } }),
  ])
  if (!term || !cls) return { created: 0 }
  if (!cls.isRecurring || cls.dayOfWeek == null || !cls.startTime || !cls.endTime) return { created: 0 }
  let created = 0
  for (let w = Math.max(1, fromWeek); w <= term.weeks; w++) {
    const date = weekDate(term.startDate, w, cls.dayOfWeek)
    const existing = await prisma.classSession.findFirst({
      where: { classId, termId, weekNumber: w },
    })
    if (existing) continue
    await prisma.classSession.create({
      data: {
        classId,
        termId,
        weekNumber: w,
        date,
        startTime:  cls.startTime,
        endTime:    cls.endTime,
      },
    })
    created++
  }
  return { created }
}

/**
 * Compute the absolute date for (termStart, weekNumber, dayOfWeek).
 * weekNumber is 1-indexed. dayOfWeek uses JS convention (0=Sun..6=Sat).
 * termStart is treated as the Monday of W1.
 */
export function weekDate(termStart: Date, weekNumber: number, dayOfWeek: number): Date {
  const w1Monday = startOfDay(termStart)
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1  // Mon=0..Sun=6
  return addDays(w1Monday, (weekNumber - 1) * 7 + daysFromMonday)
}

/**
 * Which week of a given term does this date fall into? Returns null if outside.
 */
export function weekNumberFor(termStart: Date, weeks: number, date: Date): number | null {
  const start = startOfDay(termStart)
  const dayMs = 86_400_000
  const diffDays = Math.floor((startOfDay(date).getTime() - start.getTime()) / dayMs)
  if (diffDays < 0) return null
  const w = Math.floor(diffDays / 7) + 1
  return w >= 1 && w <= weeks ? w : null
}

/**
 * Find the term a date falls in, if any.
 */
export async function findTermForDate(date: Date) {
  const terms = await prisma.term.findMany({ orderBy: { startDate: 'desc' } })
  for (const t of terms) {
    if (weekNumberFor(t.startDate, t.weeks, date) != null) return t
  }
  return null
}
