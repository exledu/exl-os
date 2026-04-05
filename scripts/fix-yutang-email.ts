import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
async function main() {
  const result = await prisma.staff.updateMany({
    where: { name: 'Yu-Tang Lin' },
    data: { email: 'yutang.lin2005@gmail.com' },
  })
  console.log(`Updated ${result.count} record(s)`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
