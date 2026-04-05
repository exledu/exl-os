import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

async function main() {
  // Find Yr 10 Maths
  const cls = await prisma.class.findFirst({
    where: { yearLevel: { level: 10 }, subject: { name: { contains: 'Math' } } },
    include: { subject: true, yearLevel: true },
  })
  if (!cls) { console.log('Not found'); return }
  console.log(`Class ${cls.id}: Yr ${cls.yearLevel.level} ${cls.subject.name} — dayOfWeek=${cls.dayOfWeek} (${DAYS[cls.dayOfWeek!]})`)

  const sessions = await prisma.classSession.findMany({
    where: { classId: cls.id },
    orderBy: { date: 'asc' },
  })
  console.log(`${sessions.length} sessions:`)
  sessions.forEach((s, i) => {
    const d = s.date
    const day = DAYS[d.getUTCDay()]
    const orig = s.originalDate ? ` (original: ${s.originalDate.toISOString().slice(0,10)} ${DAYS[s.originalDate.getUTCDay()]})` : ''
    console.log(`  ${i+1}. [${s.id}] ${d.toISOString().slice(0,10)} ${day}${orig}`)
  })

  // Delete all sessions and regenerate Term 1 properly
  console.log('\nDeleting all sessions and regenerating Term 1...')
  await prisma.classSession.deleteMany({ where: { classId: cls.id } })

  // Generate 10 Sunday sessions starting from the class's recurrence start
  const startDate = cls.recurrenceStart ?? new Date('2026-02-01')
  // Find first Sunday on or after startDate
  let cursor = new Date(startDate)
  while (cursor.getUTCDay() !== cls.dayOfWeek!) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const newSessions = []
  for (let i = 0; i < 10; i++) {
    newSessions.push({
      classId: cls.id,
      date: new Date(cursor),
      startTime: cls.startTime!,
      endTime: cls.endTime!,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  await prisma.classSession.createMany({ data: newSessions })
  console.log('Created 10 sessions:')
  newSessions.forEach((s, i) => console.log(`  ${i+1}. ${s.date.toISOString().slice(0,10)} ${DAYS[s.date.getUTCDay()]}`))

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
