import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })
async function main() {
  // Find ALL classes with "Chemistry" and year 11
  const classes = await prisma.class.findMany({
    where: { yearLevel: { level: 11 }, subject: { name: { contains: 'Chem' } } },
    include: { subject: true, yearLevel: true, _count: { select: { sessions: true } } },
  })
  for (const c of classes) {
    console.log(`Class ${c.id}: Yr ${c.yearLevel.level} ${c.subject.name} — ${c._count.sessions} sessions`)
    const sessions = await prisma.classSession.findMany({
      where: { classId: c.id },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    })
    sessions.forEach((s, i) => console.log(`  ${i+1}. [${s.id}] ${s.date.toISOString().slice(0,10)}`))
  }
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
