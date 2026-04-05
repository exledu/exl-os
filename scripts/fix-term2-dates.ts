import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { addDays, startOfDay } from 'date-fns'

const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Get all classes that have more than 10 sessions (i.e. have Term 2+)
  const classes = await prisma.class.findMany({
    where: { isRecurring: true },
    select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
  })

  let totalFixed = 0

  for (const cls of classes) {
    const sessions = await prisma.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: 'asc' },
    })

    if (sessions.length <= 10) continue // only 1 term, nothing to fix

    // Group into terms of 10
    const terms: typeof sessions[] = []
    for (let i = 0; i < sessions.length; i += 10) {
      terms.push(sessions.slice(i, i + 10))
    }

    // For each term after Term 1, check if the gap from previous term's last session is correct
    for (let t = 1; t < terms.length; t++) {
      const prevTermLast = terms[t - 1][terms[t - 1].length - 1]
      const currentTermFirst = terms[t][0]

      const lastDate = startOfDay(prevTermLast.date)
      const expectedFirst = addDays(lastDate, 21) // skip 3 weeks

      const currentFirstDate = startOfDay(currentTermFirst.date)
      const diffDays = Math.round((currentFirstDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays === 14) {
        // Currently 2 weeks gap, need to shift all sessions in this term forward by 7 days
        console.log(`Class ${cls.id}: Term ${t + 1} starts ${diffDays} days after Term ${t} — shifting +7 days`)

        for (const session of terms[t]) {
          const newDate = addDays(startOfDay(session.date), 7)
          await prisma.classSession.update({
            where: { id: session.id },
            data: { date: newDate },
          })
          totalFixed++
        }
      } else {
        console.log(`Class ${cls.id}: Term ${t + 1} gap is ${diffDays} days — OK`)
      }
    }
  }

  console.log(`\nDone. Fixed ${totalFixed} sessions across all classes.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
