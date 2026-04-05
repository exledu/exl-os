import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

async function main() {
  const classes = await prisma.class.findMany({
    where: { isRecurring: true },
    include: { subject: true, yearLevel: true },
  })

  let totalDeleted = 0

  for (const cls of classes) {
    const sessions = await prisma.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: 'asc' },
    })

    if (sessions.length <= 20) continue

    // Keep first 20 (Term 1 + Term 2), delete the rest
    const toDelete = sessions.slice(20).map(s => s.id)
    await prisma.classSession.deleteMany({ where: { id: { in: toDelete } } })
    totalDeleted += toDelete.length
    console.log(`Class ${cls.id} (Yr ${cls.yearLevel.level} ${cls.subject.name}): deleted ${toDelete.length} extra sessions (had ${sessions.length}, kept 20)`)
  }

  console.log(`\nDone. Deleted ${totalDeleted} extra sessions.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
