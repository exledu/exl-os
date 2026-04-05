import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { addDays, setDay, startOfDay } from 'date-fns'

const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

async function main() {
  const classes = await prisma.class.findMany({
    where: { isRecurring: true },
    select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
  })

  let totalFixed = 0

  for (const cls of classes) {
    if (cls.dayOfWeek == null || !cls.startTime || !cls.endTime) continue

    const sessions = await prisma.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: 'asc' },
    })

    if (sessions.length <= 10) continue

    // Term 1 = sessions 0-9, Term 2 = sessions 10-19, etc.
    const term1Last = sessions[9]
    const term1LastDate = startOfDay(term1Last.originalDate ?? term1Last.date)

    // Correct Term 2 start: 3 weeks (21 days) after Term 1 last, on the correct day of week
    let correctStart = addDays(term1LastDate, 21)
    // Ensure it lands on the right day of week
    correctStart = setDay(correctStart, cls.dayOfWeek, { weekStartsOn: 0 })
    if (correctStart <= addDays(term1LastDate, 14)) {
      correctStart = addDays(correctStart, 7) // push forward if it landed too early
    }

    // Regenerate all Term 2+ sessions from correctStart
    let cursor = correctStart
    for (let i = 10; i < sessions.length; i++) {
      // Reset to next term start after every 10 sessions
      if (i > 10 && i % 10 === 0) {
        // Skip 3 weeks from last session of previous term
        cursor = addDays(cursor, 21)
        cursor = setDay(cursor, cls.dayOfWeek, { weekStartsOn: 0 })
        if (cursor < addDays(startOfDay(sessions[i - 1].date), 14)) {
          cursor = addDays(cursor, 7)
        }
      }

      const currentDate = startOfDay(sessions[i].date)
      const newDate = startOfDay(cursor)

      if (currentDate.getTime() !== newDate.getTime()) {
        await prisma.classSession.update({
          where: { id: sessions[i].id },
          data: { date: newDate },
        })
        console.log(`  Class ${cls.id} session ${sessions[i].id}: ${currentDate.toISOString().slice(0,10)} → ${newDate.toISOString().slice(0,10)}`)
        totalFixed++
      }

      cursor = addDays(cursor, 7)
    }
  }

  console.log(`\nDone. Fixed ${totalFixed} sessions.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
