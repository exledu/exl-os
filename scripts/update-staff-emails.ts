import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const STAFF_EMAILS: Record<string, string> = {
  'William Leong': 'williamleong06@gmail.com',
  'Yu-Tang Lin': 'yutanglin2005@gmail.com',
  'Nicholas Ip': 'nicholaskcip@gmail.com',
  'Anna Jin': 'anna.jin268@gmail.com',
  'Jamen Wong': 'jamenwong0803@gmail.com',
}

async function main() {
  for (const [name, email] of Object.entries(STAFF_EMAILS)) {
    const result = await prisma.staff.updateMany({
      where: { name },
      data: { email },
    })
    console.log(`${name} → ${email} (${result.count} updated)`)
  }

  const all = await prisma.staff.findMany({ select: { name: true, email: true }, orderBy: { name: 'asc' } })
  console.log('\nFinal staff emails:')
  all.forEach(s => console.log(`  ${s.name} — ${s.email}`))
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
