import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })
async function main() {
  const cls = await prisma.class.findFirst({
    where: { yearLevel: { level: 11 }, subject: { name: { contains: 'Chemistry' } } },
  })
  if (!cls) { console.log('Not found'); return }
  const count = await prisma.classSession.count({ where: { classId: cls.id } })
  const sessions = await prisma.classSession.findMany({
    where: { classId: cls.id },
    orderBy: { date: 'asc' },
    select: { id: true, date: true },
  })
  console.log(`Class ${cls.id}: ${count} sessions`)
  sessions.forEach((s, i) => console.log(`  ${i+1}. ${s.date.toISOString().slice(0,10)}`))
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
