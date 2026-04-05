import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
async function main() {
  const result = await prisma.staff.updateMany({
    where: { name: 'William Leong' },
    data: { email: 'admin@exleducation.com.au' },
  })
  console.log(`Updated ${result.count} record(s) — William's email set to admin@exleducation.com.au`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
