import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

async function main() {
  const classes = await prisma.class.findMany({
    where: { isRecurring: true },
    include: { subject: true, yearLevel: true },
  })

  for (const cls of classes) {
    const sessions = await prisma.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: 'asc' },
    })
    if (sessions.length <= 10) continue

    console.log(`\nClass ${cls.id} (Yr ${cls.yearLevel.level} ${cls.subject.name}) — should be ${DAYS[cls.dayOfWeek!]}:`)
    console.log('  Term 1 last 2:')
    for (const s of sessions.slice(8, 10)) {
      const d = new Date(s.date.toISOString().split('T')[0] + 'T12:00:00')
      console.log(`    ${s.date.toISOString().split('T')[0]} = ${DAYS[d.getDay()]}`)
    }
    console.log('  Term 2 first 3:')
    for (const s of sessions.slice(10, 13)) {
      const d = new Date(s.date.toISOString().split('T')[0] + 'T12:00:00')
      console.log(`    ${s.date.toISOString().split('T')[0]} = ${DAYS[d.getDay()]}`)
    }
    const gap = Math.round((sessions[10].date.getTime() - sessions[9].date.getTime()) / (1000*60*60*24))
    console.log(`  Gap: ${gap} days`)
  }

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
