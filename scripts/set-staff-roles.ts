import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const STAFF_ROLES: Record<string, string[]> = {
  'William Leong': ['admin'],
  'Yu-Tang Lin': ['admin', 'tutor'],
  'Nicholas Ip': ['admin', 'tutor'],
  'Anna Jin': ['tutor'],
  'Jamen Wong': ['tutor'],
}

async function main() {
  for (const [name, roles] of Object.entries(STAFF_ROLES)) {
    const result = await prisma.staff.updateMany({
      where: { name: { contains: name.split(' ')[0] } },
      data: { roles },
    })
    console.log(`${name}: updated ${result.count} record(s) → [${roles.join(', ')}]`)
  }
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
