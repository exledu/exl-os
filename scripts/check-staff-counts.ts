import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
async function main() {
  const staff = await prisma.staff.findMany({
    include: {
      _count: { select: { classes: true } },
      classes: { select: { _count: { select: { enrolments: true } } } },
    },
  })
  staff.forEach(s => {
    const total = s.classes.reduce((sum, c) => sum + c._count.enrolments, 0)
    const avg = s.classes.length > 0 ? (total / s.classes.length).toFixed(1) : '0'
    console.log(`${s.name} | ${s._count.classes} classes | ${total} total students | ${avg} stu/class`)
  })
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
