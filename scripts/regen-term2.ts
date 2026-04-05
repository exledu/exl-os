import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { addDays, startOfDay } from 'date-fns'

const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

async function main() {
  const classes = await prisma.class.findMany({
    where: { isRecurring: true },
    include: { subject: true, yearLevel: true },
  })

  for (const cls of classes) {
    if (cls.dayOfWeek == null || !cls.startTime || !cls.endTime) continue

    const sessions = await prisma.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: 'asc' },
    })

    if (sessions.length <= 10) continue

    // Term 1 last session (use original date if revised)
    const term1Last = sessions[9]
    const term1LastDate = startOfDay(term1Last.originalDate ?? term1Last.date)

    // Delete all Term 2+ sessions
    const term2Ids = sessions.slice(10).map(s => s.id)
    await prisma.classSession.deleteMany({ where: { id: { in: term2Ids } } })

    // Regenerate: start 3 weeks (21 days) after Term 1 last, on the correct day
    // Since Term 1 last is already on the correct day of week, just add 21 days
    let cursor = addDays(term1LastDate, 21)

    const newSessions: { classId: number; date: Date; startTime: string; endTime: string }[] = []
    for (let i = 0; i < 10; i++) {
      newSessions.push({
        classId: cls.id,
        date: cursor,
        startTime: cls.startTime,
        endTime: cls.endTime,
      })
      cursor = addDays(cursor, 7)
    }

    await prisma.classSession.createMany({ data: newSessions })

    const firstNew = newSessions[0].date.toISOString().split('T')[0]
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][newSessions[0].date.getUTCDay()]
    console.log(`Class ${cls.id} (Yr ${cls.yearLevel.level} ${cls.subject.name}): deleted ${term2Ids.length}, created 10 starting ${dayName} ${firstNew}`)
  }

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
