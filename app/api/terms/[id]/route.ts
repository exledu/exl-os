import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/terms/[id] → term detail with the class × week grid.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params

  const term = await prisma.term.findUnique({ where: { id: Number(id) } })
  if (!term) return new Response('Not found', { status: 404 })

  const [classes, sessions] = await Promise.all([
    prisma.class.findMany({
      where: { archived: false, isRecurring: true },
      include: {
        subject:   { select: { name: true } },
        yearLevel: { select: { level: true } },
        staff:     { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.classSession.findMany({
      where: { termId: term.id },
      select: {
        id: true, classId: true, weekNumber: true, date: true,
        cancelled: true, startTime: true, endTime: true,
      },
      orderBy: [{ classId: 'asc' }, { weekNumber: 'asc' }],
    }),
  ])

  // Build the class × week grid.
  const grid = classes.map(cls => {
    const row: (typeof sessions[number] | null)[] = Array.from({ length: term.weeks }, () => null)
    for (const s of sessions.filter(x => x.classId === cls.id)) {
      if (s.weekNumber && s.weekNumber >= 1 && s.weekNumber <= term.weeks) {
        row[s.weekNumber - 1] = s
      }
    }
    return {
      classId:    cls.id,
      subject:    cls.subject.name,
      yearLevel:  cls.yearLevel.level,
      staff:      cls.staff.name,
      dayOfWeek:  cls.dayOfWeek,
      startTime:  cls.startTime,
      endTime:    cls.endTime,
      cells:      row,
    }
  })

  return Response.json({ term, grid })
}
