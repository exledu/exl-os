import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })
async function main() {
  const sessions = await prisma.classSession.findMany({
    where: { classId: 2 },
    orderBy: { date: 'asc' },
  })
  console.log(`Class 2: ${sessions.length} sessions — keeping first 10, deleting ${sessions.length - 10}`)
  const toDelete = sessions.slice(10).map(s => s.id)
  await prisma.classSession.deleteMany({ where: { id: { in: toDelete } } })
  console.log('Done.')
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
