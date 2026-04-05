import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Add minutes to a "HH:MM" string */
function addMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Find the first occurrence of a day-of-week (0=Sun) on or after a given date */
function firstOccurrence(from: Date, dow: number): Date {
  const d = new Date(from)
  let diff = dow - d.getDay()
  if (diff < 0) diff += 7
  d.setDate(d.getDate() + diff)
  return d
}

/** Duration in minutes per year level */
function duration(yearLevel: number): number {
  if (yearLevel >= 12) return 150 // 2.5 hrs
  if (yearLevel >= 10) return 120 // 2 hrs
  return 90                        // 1.5 hrs (Yr 9, 8, 7)
}

/** Generate recurring ClassSession rows (10 weeks) */
async function generateSessions(
  classId: number,
  dow: number,
  startTime: string,
  endTime: string,
  from: Date,
  to: Date,
) {
  const sessions: { classId: number; date: Date; startTime: string; endTime: string }[] = []
  let cursor = firstOccurrence(from, dow)
  while (cursor <= to) {
    sessions.push({
      classId,
      date: new Date(cursor.toISOString().split('T')[0] + 'T00:00:00.000Z'),
      startTime,
      endTime,
    })
    cursor = new Date(cursor)
    cursor.setDate(cursor.getDate() + 7)
  }
  if (sessions.length) {
    await prisma.classSession.createMany({ data: sessions })
    console.log(`  → ${sessions.length} sessions generated`)
  }
}

/** Get or create a student by exact name */
async function getOrCreateStudent(name: string, yearLevelId: number): Promise<number> {
  const existing = await prisma.student.findFirst({ where: { name } })
  if (existing) return existing.id
  const s = await prisma.student.create({ data: { name, yearLevelId } })
  return s.id
}

// ─── Main seed ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Starting EXL OS seed...\n')

  // 10-week window starting Tue 27 Jan 2026
  const RECURRENCE_START = new Date('2026-01-27')
  const RECURRENCE_END   = new Date('2026-04-06') // inclusive of Week 10

  // ── Subjects ──────────────────────────────────────────────────────────────
  const subjectNames = [
    'Maths',
    'English',
    'Science',
    'History',
    'Geography',
    'Chemistry',
    'Physics',
    'Biology',
    'Mathematics Extension 1',  // MX1
    'Mathematics Advanced',     // MA
  ]
  const subjectMap: Record<string, number> = {}
  for (const name of subjectNames) {
    const s = await prisma.subject.upsert({ where: { name }, update: {}, create: { name } })
    subjectMap[name] = s.id
  }
  console.log(`✓ ${subjectNames.length} subjects`)

  // ── Year Levels ───────────────────────────────────────────────────────────
  const yearLevelMap: Record<number, number> = {}
  for (const level of [7, 8, 9, 10, 11, 12]) {
    const y = await prisma.yearLevel.upsert({ where: { level }, update: {}, create: { level } })
    yearLevelMap[level] = y.id
  }
  console.log('✓ Year levels 7–12')

  // ── Rooms ─────────────────────────────────────────────────────────────────
  const roomNames = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Online']
  for (const name of roomNames) {
    await prisma.room.upsert({ where: { name }, update: {}, create: { name } })
  }
  console.log(`✓ ${roomNames.length} rooms`)

  // ── Staff ─────────────────────────────────────────────────────────────────
  // Placeholder emails — update with real ones after import
  const staffRows = [
    { name: 'William Leong', email: 'william@exleducation.com.au', roles: ['admin'] },
    { name: 'Yu-Tang',       email: 'yu-tang@exlcentre.com',       roles: ['admin', 'tutor'] },
    { name: 'Nicholas',      email: 'nicholas@exlcentre.com',      roles: ['admin', 'tutor'] },
    { name: 'Anna',          email: 'anna@exlcentre.com',          roles: ['tutor'] },
    { name: 'Jamen',         email: 'jamen@exlcentre.com',         roles: ['tutor'] },
    // Thu Yr11 MA is co-taught by Nic & Jamen — Nic assigned as primary
    { name: 'Nic',           email: 'nic@exlcentre.com',           roles: ['admin', 'tutor'] },
    // Placeholder for sessions with no teacher in the sheet
    { name: 'TBD',           email: 'tbd@exlcentre.com',           roles: ['tutor'] },
  ]
  const staffMap: Record<string, number> = {}
  for (const t of staffRows) {
    const member = await prisma.staff.upsert({
      where: { email: t.email },
      update: { name: t.name },
      create: t,
    })
    staffMap[t.name] = member.id
  }
  console.log(`✓ ${staffRows.length} staff members`)

  // ── Student year-level lookup ─────────────────────────────────────────────
  // Inferred from the classes each student appears in
  const studentYearLevels: Record<string, number> = {
    'Raamis':   12,
    'Oscar':    12,
    'Roger':    11,
    'Sam':      11,
    'Brandon':  12,
    'Jayden':   12,  // Year 12 Physics + MX1  (different from Jayden V)
    'Vishwa':   12,
    'KT':       12,
    'Leeton':   12,
    'Ray':      12,
    'Hannah':   11,
    'Yui':      11,
    'Pranav':   12,
    'Sophia':    9,
    'Elma':      9,
    'KC':        9,
    'Benjamin':  9,
    'Ivana':     9,
    'Noel':     11,
    'Jayden V': 11,  // Year 11 MX1 — different student to 'Jayden'
    'Dylan':    10,
  }

  // ── Class definitions from spreadsheet ───────────────────────────────────
  type ClassDef = {
    dow: number         // 0=Sun, 1=Mon … 6=Sat
    start: string       // "HH:MM" (24-hr, all PM unless Sat/Sun AM)
    yl: number          // year level
    subject: string
    staff: string
    cap: number         // max capacity (enrolled + headroom)
    students: string[]
    flag?: string       // optional warning message
  }

  const classes: ClassDef[] = [
    // ── TUESDAY (dow 2) ────────────────────────────────────────────────────
    {
      dow: 2, start: '16:00', yl: 12, subject: 'Chemistry',
      staff: 'Yu-Tang', cap: 6,
      students: ['Raamis', 'Oscar'],
    },
    {
      dow: 2, start: '18:30', yl: 11, subject: 'Chemistry',
      staff: 'Yu-Tang', cap: 6,
      students: ['Roger', 'Sam'],
    },
    {
      dow: 2, start: '18:00', yl: 12, subject: 'Mathematics Extension 1',
      staff: 'Anna', cap: 6,
      students: ['Brandon', 'Jayden'],
    },

    // ── WEDNESDAY (dow 3) ──────────────────────────────────────────────────
    {
      dow: 3, start: '17:30', yl: 12, subject: 'Chemistry',
      staff: 'Yu-Tang', cap: 4,
      students: ['Vishwa'],
    },

    // ── THURSDAY (dow 4) ───────────────────────────────────────────────────
    {
      dow: 4, start: '16:30', yl: 12, subject: 'Physics',
      staff: 'Yu-Tang', cap: 8,
      students: ['KT', 'Leeton', 'Jayden', 'Ray'],
    },
    {
      dow: 4, start: '16:30', yl: 11, subject: 'Mathematics Advanced',
      staff: 'Nic', cap: 4,
      students: ['Roger'],
      flag: '⚠️  Co-taught with Jamen — Nic assigned as primary. Update via /classes if needed.',
    },

    // ── FRIDAY (dow 5) ─────────────────────────────────────────────────────
    {
      dow: 5, start: '16:30', yl: 11, subject: 'Physics',
      staff: 'Yu-Tang', cap: 6,
      students: ['Roger', 'Hannah', 'Yui', 'Sam'],
    },

    // ── SATURDAY (dow 6) ───────────────────────────────────────────────────
    {
      dow: 6, start: '10:00', yl: 12, subject: 'Chemistry',
      staff: 'Nicholas', cap: 4,
      students: ['Pranav'],
    },
    {
      dow: 6, start: '13:30', yl: 9, subject: 'Maths',
      staff: 'Anna', cap: 8,
      students: ['Sophia', 'Elma', 'KC', 'Benjamin', 'Ivana'],
    },
    {
      dow: 6, start: '14:00', yl: 11, subject: 'Chemistry',
      staff: 'Yu-Tang', cap: 6,
      students: ['Yui', 'Hannah'],
    },

    // ── SUNDAY (dow 0) ─────────────────────────────────────────────────────
    {
      dow: 0, start: '10:30', yl: 11, subject: 'Mathematics Extension 1',
      staff: 'Yu-Tang', cap: 6,
      students: ['Yui', 'Sam', 'Noel'],
    },
    {
      dow: 0, start: '10:30', yl: 11, subject: 'Mathematics Extension 1',
      staff: 'TBD', cap: 4,
      students: ['Jayden V', 'Hannah'],
      flag: '⚠️  No teacher in source sheet — assigned TBD. Update via /staff + /classes.',
    },
    {
      dow: 0, start: '13:00', yl: 12, subject: 'Mathematics Extension 1',
      staff: 'Nicholas', cap: 6,
      students: ['Pranav', 'KT', 'Raamis', 'Oscar'],
    },
    {
      dow: 0, start: '13:00', yl: 10, subject: 'Maths',
      staff: 'TBD', cap: 4,
      students: ['Dylan'],
      flag: '⚠️  No teacher and no subject in source sheet — defaulted to Maths/TBD. Verify and update.',
    },
  ]

  // ── Create classes, sessions, students, enrolments ────────────────────────
  console.log(`\n📅 Creating ${classes.length} recurring classes (10 weeks each)...\n`)

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  for (const c of classes) {
    const endTime   = addMins(c.start, duration(c.yl))
    const ylId      = yearLevelMap[c.yl]
    const subjId    = subjectMap[c.subject]
    const staffId   = staffMap[c.staff]

    // Idempotent: skip if an identical class already exists
    const existing = await prisma.class.findFirst({
      where: { dayOfWeek: c.dow, startTime: c.start, yearLevelId: ylId, subjectId: subjId, staffId },
    })

    let classId: number
    if (existing) {
      classId = existing.id
      console.log(`  (skip) ${DAYS[c.dow]} ${c.start} Yr${c.yl} ${c.subject} — already exists`)
    } else {
      const cls = await prisma.class.create({
        data: {
          subjectId:       subjId,
          yearLevelId:     ylId,
          staffId,
          maxCapacity:     c.cap,
          isRecurring:     true,
          dayOfWeek:       c.dow,
          startTime:       c.start,
          endTime,
          recurrenceStart: RECURRENCE_START,
          recurrenceEnd:   RECURRENCE_END,
        },
      })
      classId = cls.id
      console.log(`  ✓ ${DAYS[c.dow]} ${c.start}–${endTime}  Yr${c.yl} ${c.subject}  (${c.staff})`)
      await generateSessions(classId, c.dow, c.start, endTime, RECURRENCE_START, RECURRENCE_END)
    }

    // Students + enrolments
    for (const name of c.students) {
      const yl       = studentYearLevels[name] ?? c.yl
      const studentId = await getOrCreateStudent(name, yearLevelMap[yl])
      await prisma.enrolment.upsert({
        where:  { studentId_classId: { studentId, classId } },
        update: {},
        create: { studentId, classId },
      })
    }

    if (c.flag) console.log(`  ${c.flag}`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const [classCount, studentCount, sessionCount, enrolCount] = await Promise.all([
    prisma.class.count(),
    prisma.student.count(),
    prisma.classSession.count(),
    prisma.enrolment.count(),
  ])

  console.log('\n✅ Seed complete!')
  console.log(`   Classes:    ${classCount}`)
  console.log(`   Sessions:   ${sessionCount}`)
  console.log(`   Students:   ${studentCount}`)
  console.log(`   Enrolments: ${enrolCount}`)
  console.log('\n⚠️  Action required after import:')
  console.log('   1. Update placeholder staff emails via /staff')
  console.log('   2. Assign Jamen as co-staff on Thu Yr11 Mathematics Advanced')
  console.log('   3. Confirm teacher for Sun 10:30 Yr11 MX1 and Sun 13:00 Yr10')
  console.log('   4. Confirm subject for Dylan\'s Year 10 Sunday class')
  console.log('   5. Add student surnames, emails and parent contacts via /students')
}

main().catch(console.error).finally(() => prisma.$disconnect())
