import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
async function main() {
  const all = await prisma.staff.findMany({ select: { name: true, roles: true }, orderBy: { name: 'asc' } })
  all.forEach(s => console.log(`${s.name} — [${s.roles.join(', ')}]`))
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
