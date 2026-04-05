import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { addDays, startOfDay } from 'date-fns'

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
    const sessions = await prisma.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: 'asc' },
    })

    if (sessions.length <= 10) continue

    const terms: typeof sessions[] = []
    for (let i = 0; i < sessions.length; i += 10) {
      terms.push(sessions.slice(i, i + 10))
    }

    for (let t = 1; t < terms.length; t++) {
      const prevTermLast = terms[t - 1][terms[t - 1].length - 1]
      const currentTermFirst = terms[t][0]

      const lastDate = startOfDay(prevTermLast.date)
      const currentFirstDate = startOfDay(currentTermFirst.date)
      const diffDays = Math.round((currentFirstDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays !== 21) {
        const shiftBy = 21 - diffDays
        console.log(`Class ${cls.id}: Term ${t + 1} gap is ${diffDays} days (need 21) — shifting by ${shiftBy > 0 ? '+' : ''}${shiftBy} days`)

        for (const session of terms[t]) {
          const newDate = addDays(startOfDay(session.date), shiftBy)
          await prisma.classSession.update({
            where: { id: session.id },
            data: { date: newDate },
          })
          totalFixed++
        }
      } else {
        console.log(`Class ${cls.id}: Term ${t + 1} gap is 21 days — OK`)
      }
    }
  }

  console.log(`\nDone. Fixed ${totalFixed} sessions.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
