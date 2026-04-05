import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
async function main() {
  const total = await prisma.issue.count()
  const unresolved = await prisma.issue.count({ where: { resolved: false } })
  console.log(`Total: ${total}, Unresolved: ${unresolved}`)
  if (unresolved > 0) {
    const sample = await prisma.issue.findMany({
      where: { resolved: false },
      select: { id: true, contactName: true, type: true },
      take: 3,
    })
    console.log('Sample:', JSON.stringify(sample))
  }
  // Also check if the notes relation works
  const withNotes = await prisma.issue.findFirst({
    where: { resolved: false },
    include: { student: true, notes: { orderBy: { createdAt: 'asc' } } },
  })
  console.log('Notes query works:', withNotes ? `yes, ${withNotes.notes.length} notes` : 'no unresolved issues')
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
