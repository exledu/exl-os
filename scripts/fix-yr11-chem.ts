import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Find Yr 11 Chemistry class
  const cls = await prisma.class.findFirst({
    where: {
      yearLevel: { level: 11 },
      subject: { name: { contains: 'Chemistry' } },
    },
    include: { subject: true, yearLevel: true },
  })

  if (!cls) { console.log('Class not found'); return }
  console.log(`Found: Class ${cls.id} — Yr ${cls.yearLevel.level} ${cls.subject.name}`)

  const sessions = await prisma.classSession.findMany({
    where: { classId: cls.id },
    orderBy: { date: 'asc' },
  })

  console.log(`Total sessions: ${sessions.length}`)

  if (sessions.length > 10) {
    const toDelete = sessions.slice(10).map(s => s.id)
    await prisma.classSession.deleteMany({ where: { id: { in: toDelete } } })
    console.log(`Deleted ${toDelete.length} sessions (Term 2 & 3). Kept first 10 (Term 1).`)
  } else {
    console.log('Only Term 1 exists — nothing to delete.')
  }

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
