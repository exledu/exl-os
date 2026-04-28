/**
 * Sets up (or tears down) a test class for the Slack attendance bot.
 *
 *   npx tsx scripts/setup-attendance-test.ts          # create
 *   npx tsx scripts/setup-attendance-test.ts cleanup  # remove
 *
 * Creates:
 *   - Staff "Test Teacher" with email williamlong06@gmail.com
 *   - Subject "TEST-Attendance"
 *   - Year level 9 (uses existing if present)
 *   - Class linking the above
 *   - 3 students enrolled
 *   - One ClassSession starting "now − 1 min" so the cron fires immediately
 */

import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const TEST_EMAIL    = 'williamlong06@gmail.com'
const TEST_SUBJECT  = 'TEST-Attendance'
const TEST_TEACHER  = 'Test Teacher'
const TEST_STUDENTS = ['Alice Test', 'Bob Test', 'Charlie Test']

function pad(n: number): string { return n.toString().padStart(2, '0') }

function todayDateOnly(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

async function setup() {
  // 1. Upsert subject
  const subject = await prisma.subject.upsert({
    where:  { name: TEST_SUBJECT },
    update: {},
    create: { name: TEST_SUBJECT },
  })

  // 2. Year level 9
  const yearLevel = await prisma.yearLevel.upsert({
    where:  { level: 9 },
    update: {},
    create: { level: 9 },
  })

  // 3. Test teacher
  const teacher = await prisma.staff.upsert({
    where:  { email: TEST_EMAIL },
    update: { name: TEST_TEACHER, roles: ['tutor'] },
    create: { name: TEST_TEACHER, email: TEST_EMAIL, roles: ['tutor'] },
  })
  console.log(`✔ Staff: ${teacher.name} (id=${teacher.id}, email=${teacher.email})`)

  // 4. Class
  const existing = await prisma.class.findFirst({
    where: { subjectId: subject.id, staffId: teacher.id },
  })
  const cls = existing
    ? await prisma.class.update({
        where: { id: existing.id },
        data:  { archived: false, maxCapacity: 10 },
      })
    : await prisma.class.create({
        data: {
          subjectId:   subject.id,
          yearLevelId: yearLevel.id,
          staffId:     teacher.id,
          maxCapacity: 10,
          isRecurring: false,
        },
      })
  console.log(`✔ Class: id=${cls.id}`)

  // 5. Students
  const students = await Promise.all(
    TEST_STUDENTS.map(async fullName => {
      const [name, ...rest] = fullName.split(' ')
      const lastName = rest.join(' ') || null
      const existing = await prisma.student.findFirst({
        where: { name, lastName, yearLevelId: yearLevel.id },
      })
      if (existing) return existing
      return prisma.student.create({
        data: { name, lastName, yearLevelId: yearLevel.id },
      })
    })
  )
  console.log(`✔ Students: ${students.map(s => s.name).join(', ')}`)

  // 6. Enrolments
  for (const s of students) {
    await prisma.enrolment.upsert({
      where:  { studentId_classId: { studentId: s.id, classId: cls.id } },
      update: {},
      create: { studentId: s.id, classId: cls.id },
    })
  }
  console.log(`✔ Enrolled ${students.length} students`)

  // 7. Session — starts 1 min ago, ends in 59 min, so elapsed ≥ 0 immediately
  const now = new Date()
  const startMin = now.getMinutes() === 0 ? 59 : now.getMinutes() - 1
  const startHr = now.getMinutes() === 0 ? (now.getHours() + 23) % 24 : now.getHours()
  const endHr   = (startHr + 1) % 24

  const startTime = `${pad(startHr)}:${pad(startMin)}`
  const endTime   = `${pad(endHr)}:${pad(startMin)}`

  // delete any existing test sessions for this class today first
  await prisma.classSession.deleteMany({
    where: { classId: cls.id, date: todayDateOnly() },
  })

  const session = await prisma.classSession.create({
    data: {
      classId:                 cls.id,
      date:                    todayDateOnly(),
      startTime,
      endTime,
      staffId:                 teacher.id,
      attendanceReminderLevel: 0,
    },
  })

  console.log(`✔ Session: id=${session.id}, today ${startTime}–${endTime}`)
  console.log('')
  console.log('🚀 Test class set up. The next cron tick (≤5 min) should DM you.')
  console.log('   To trigger it now, hit:')
  console.log('   curl -H "Authorization: Bearer $CRON_SECRET" \\')
  console.log('        https://YOUR_DEPLOY_URL/api/cron/attendance-reminders')
}

async function cleanup() {
  const subject = await prisma.subject.findUnique({ where: { name: TEST_SUBJECT } })
  if (!subject) {
    console.log('No test data found — already clean.')
    return
  }
  const classes = await prisma.class.findMany({ where: { subjectId: subject.id } })
  for (const c of classes) {
    await prisma.classSession.deleteMany({ where: { classId: c.id } })
    await prisma.enrolment.deleteMany({ where: { classId: c.id } })
    await prisma.class.delete({ where: { id: c.id } })
  }
  await prisma.subject.delete({ where: { id: subject.id } })

  // Delete the test students by name (only if they have no other enrolments)
  for (const fullName of TEST_STUDENTS) {
    const [name, ...rest] = fullName.split(' ')
    const lastName = rest.join(' ') || null
    const stu = await prisma.student.findFirst({
      where: { name, lastName },
      include: { enrolments: true },
    })
    if (stu && stu.enrolments.length === 0) {
      await prisma.student.delete({ where: { id: stu.id } })
    }
  }

  // Leave the staff record alone — user may want it for real use too.
  console.log('✔ Cleanup done. Staff record preserved.')
}

async function main() {
  const arg = process.argv[2]
  if (arg === 'cleanup') {
    await cleanup()
  } else {
    await setup()
  }
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
