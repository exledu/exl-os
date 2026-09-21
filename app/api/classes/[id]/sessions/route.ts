import { prisma } from '@/lib/db'

export async function GET(_req: Request, ctx: RouteContext<'/api/classes/[id]/sessions'>) {
  const { id } = await ctx.params

  const sessions = await prisma.classSession.findMany({
    where: { classId: Number(id) },
    include: { staff: true, term: { select: { id: true, name: true, weeks: true } } },
    orderBy: { date: 'asc' },
  })

  type Week = {
    weekNumber:  number
    id:          number
    date:        string
    originalDate: string | null
    startTime:   string
    endTime:     string
    cancelled:   boolean
    staffId:     number | null
    staffName:   string | null
  }
  type TermGroup = {
    term:     number       // display number (positional for legacy, termNumber for real)
    label:    string       // e.g. "T4 2026" or "Term 1 (legacy)"
    termId:   number | null
    weeks:    Week[]
  }

  const groups: TermGroup[] = []
  const byTermId = new Map<number, TermGroup>()
  // Positional fallback bucket for sessions with termId=null.
  let legacyBucket: TermGroup | null = null
  let legacyIndex = 0

  for (const s of sessions) {
    const week: Week = {
      weekNumber:   s.weekNumber ?? 0,
      id:           s.id,
      date:         s.date.toISOString().split('T')[0],
      originalDate: s.originalDate ? s.originalDate.toISOString().split('T')[0] : null,
      startTime:    s.startTime,
      endTime:      s.endTime,
      cancelled:    s.cancelled,
      staffId:      s.staffId,
      staffName:    s.staff?.name ?? null,
    }
    if (s.termId && s.term) {
      let g = byTermId.get(s.termId)
      if (!g) {
        g = { term: groups.length + 1, label: s.term.name, termId: s.termId, weeks: [] }
        byTermId.set(s.termId, g)
        groups.push(g)
      }
      g.weeks.push(week)
    } else {
      // Legacy positional session (pre-Term migration).
      if (!legacyBucket || legacyBucket.weeks.length >= 10) {
        const num = Math.floor(legacyIndex / 10) + 1
        legacyBucket = { term: num, label: `Legacy · Term ${num}`, termId: null, weeks: [] }
        groups.push(legacyBucket)
      }
      week.weekNumber = (legacyBucket.weeks.length + 1)
      legacyBucket.weeks.push(week)
      legacyIndex++
    }
  }

  // Sort weeks inside each term group.
  for (const g of groups) g.weeks.sort((a, b) => a.weekNumber - b.weekNumber || a.date.localeCompare(b.date))

  return Response.json(groups)
}
