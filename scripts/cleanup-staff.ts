import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Target org:
  // William Leong - Admin
  // Yu-Tang Lin - Admin, Tutor
  // Nicholas Ip - Admin, Tutor
  // Anna Jin - Tutor
  // Jamen Wong - Tutor

  // 1. Update names to full names and correct roles
  const updates: { match: string; name: string; roles: string[]; email: string }[] = [
    { match: 'Yu-Tang',  name: 'Yu-Tang Lin',   roles: ['admin', 'tutor'], email: 'yu-tang@exlcentre.com' },
    { match: 'Anna',     name: 'Anna Jin',      roles: ['tutor'],          email: 'anna@exlcentre.com' },
    { match: 'Nicholas', name: 'Nicholas Ip',   roles: ['admin', 'tutor'], email: 'nicholas@exlcentre.com' },
    { match: 'Jamen',    name: 'Jamen Wong',    roles: ['tutor'],          email: 'jamen@exlcentre.com' },
    { match: 'William',  name: 'William Leong', roles: ['admin'],          email: 'william@exleducation.com.au' },
  ]

  for (const u of updates) {
    const staff = await prisma.staff.findFirst({ where: { name: { startsWith: u.match } } })
    if (staff) {
      await prisma.staff.update({
        where: { id: staff.id },
        data: { name: u.name, roles: u.roles, email: u.email },
      })
      console.log(`Updated: ${staff.name} → ${u.name} [${u.roles.join(', ')}]`)
    } else {
      console.log(`Not found: ${u.match}`)
    }
  }

  // 2. Remove staff not in the org: "Nic", "TBD"
  // First reassign any classes/sessions from Nic to Nicholas
  const nic = await prisma.staff.findFirst({ where: { name: 'Nic' } })
  const nicholas = await prisma.staff.findFirst({ where: { name: 'Nicholas Ip' } })

  if (nic && nicholas) {
    const classCount = await prisma.class.updateMany({ where: { staffId: nic.id }, data: { staffId: nicholas.id } })
    const sessionCount = await prisma.classSession.updateMany({ where: { staffId: nic.id }, data: { staffId: nicholas.id } })
    console.log(`Reassigned ${classCount.count} classes and ${sessionCount.count} sessions from Nic → Nicholas Ip`)
    await prisma.staffAction.deleteMany({ where: { staffId: nic.id } })
    await prisma.staff.delete({ where: { id: nic.id } })
    console.log('Deleted: Nic')
  }

  // Remove TBD — reassign to first available tutor or leave unassigned
  const tbd = await prisma.staff.findFirst({ where: { name: 'TBD' } })
  if (tbd) {
    // Reassign TBD classes to Nicholas (or any admin+tutor)
    const target = nicholas ?? await prisma.staff.findFirst({ where: { roles: { has: 'tutor' } } })
    if (target) {
      const classCount = await prisma.class.updateMany({ where: { staffId: tbd.id }, data: { staffId: target.id } })
      const sessionCount = await prisma.classSession.updateMany({ where: { staffId: tbd.id }, data: { staffId: target.id } })
      console.log(`Reassigned ${classCount.count} classes and ${sessionCount.count} sessions from TBD → ${target.name}`)
    }
    await prisma.staffAction.deleteMany({ where: { staffId: tbd.id } })
    await prisma.staff.delete({ where: { id: tbd.id } })
    console.log('Deleted: TBD')
  }

  // 3. Print final state
  const all = await prisma.staff.findMany({
    include: { _count: { select: { classes: true } } },
    orderBy: { name: 'asc' },
  })
  console.log('\nFinal staff:')
  all.forEach(s => console.log(`  ${s.name} — [${s.roles.join(', ')}] — ${s._count.classes} classes`))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
