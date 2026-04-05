import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

function addDaysUTC(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

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

    // Term 1 last session date (already stored as UTC midnight)
    const term1Last = sessions[9]
    const term1LastDate = term1Last.originalDate ?? term1Last.date

    // Verify Term 1 last is on the right day
    const t1Day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][term1LastDate.getUTCDay()]
    const expectedDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][cls.dayOfWeek]
    console.log(`Class ${cls.id} (Yr ${cls.yearLevel.level} ${cls.subject.name}): T1 last = ${t1Day} ${term1LastDate.toISOString().slice(0,10)}, expected ${expectedDay}`)

    // Delete Term 2+
    const term2Ids = sessions.slice(10).map(s => s.id)
    await prisma.classSession.deleteMany({ where: { id: { in: term2Ids } } })

    // Add 21 days to get Term 2 start (same day of week, 3 weeks later)
    let cursor = addDaysUTC(term1LastDate, 21)

    const newSessions: { classId: number; date: Date; startTime: string; endTime: string }[] = []
    for (let i = 0; i < 10; i++) {
      newSessions.push({
        classId: cls.id,
        date: cursor,
        startTime: cls.startTime,
        endTime: cls.endTime,
      })
      cursor = addDaysUTC(cursor, 7)
    }

    await prisma.classSession.createMany({ data: newSessions })

    const first = newSessions[0].date
    const firstDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][first.getUTCDay()]
    console.log(`  → Term 2: ${firstDay} ${first.toISOString().slice(0,10)} (gap: 21 days)`)
  }

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
