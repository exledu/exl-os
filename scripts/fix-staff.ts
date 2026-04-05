import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Add William if not exists
  const william = await prisma.staff.findFirst({ where: { name: { startsWith: 'William' } } })
  if (!william) {
    await prisma.staff.create({ data: { name: 'William Leong', email: 'william@exleducation.com.au', roles: ['admin'] } })
    console.log('Created William Leong [admin]')
  } else {
    console.log('William already exists:', william.name)
  }

  // Fix "Nic" → set roles to [admin, tutor]
  const nic = await prisma.staff.findFirst({ where: { name: 'Nic' } })
  if (nic) {
    await prisma.staff.update({ where: { id: nic.id }, data: { roles: ['admin', 'tutor'] } })
    console.log('Updated Nic → [admin, tutor]')
  }

  // Final list
  const all = await prisma.staff.findMany({ select: { id: true, name: true, roles: true }, orderBy: { name: 'asc' } })
  console.log('\nAll staff:')
  all.forEach(s => console.log(`  ${s.id}. ${s.name} — [${s.roles.join(', ')}]`))

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
