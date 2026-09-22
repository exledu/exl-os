import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/terms/[id]?includeArchived=1 → term detail with the class × week grid.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params
  const url = new URL(req.url)
  const includeArchived = url.searchParams.get('includeArchived') === '1'

  const term = await prisma.term.findUnique({ where: { id: Number(id) } })
  if (!term) return new Response('Not found', { status: 404 })

  const [classes, sessions] = await Promise.all([
    prisma.class.findMany({
      where: {
        ...(includeArchived ? {} : { archived: false }),
        isRecurring: true,
        // Only classes that actually have a session in this term. Excluded
        // classes (Yr 12 opted out, etc.) don't render a mostly-empty row.
        sessions: { some: { termId: term.id } },
      },
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
        cancelled: true, startTime: true, endTime: true, staffId: true,
        staff:     { select: { id: true, name: true } },
        yearLevel: { select: { level: true } },
      },
      orderBy: [{ classId: 'asc' }, { weekNumber: 'asc' }],
    }),
  ])

  // Build the class × week grid.
  const grid = classes.map(cls => {
    const row: (typeof sessions[number] | null)[] = Array.from({ length: term.weeks }, () => null)
    const mine = sessions.filter(x => x.classId === cls.id)
    for (const s of mine) {
      if (s.weekNumber && s.weekNumber >= 1 && s.weekNumber <= term.weeks) {
        row[s.weekNumber - 1] = s
      }
    }
    // Prefer this term's sessions' yearLevel over the class's current yearLevel —
    // otherwise a class bumped to Yr 12 for T4 would mislabel its T3 row.
    const termYearLevel = mine.find(s => s.yearLevel)?.yearLevel?.level ?? cls.yearLevel.level
    return {
      classId:    cls.id,
      subject:    cls.subject.name,
      yearLevel:  termYearLevel,
      staff:      cls.staff.name,
      staffId:    cls.staff.id,
      dayOfWeek:  cls.dayOfWeek,
      startTime:  cls.startTime,
      endTime:    cls.endTime,
      archived:   cls.archived,
      cells:      row,
    }
  })

  return Response.json({ term, grid }, {
    headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
  })
}
