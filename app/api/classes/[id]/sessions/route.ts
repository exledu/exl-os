import { prisma } from '@/lib/db'

export async function GET(_req: Request, ctx: RouteContext<'/api/classes/[id]/sessions'>) {
  const { id } = await ctx.params

  const sessions = await prisma.classSession.findMany({
    where: { classId: Number(id) },
    include: { staff: true },
    orderBy: { date: 'asc' },
  })

  // Group into terms of 10
  const terms: {
    term: number
    weeks: {
      weekNumber: number
      id: number
      date: string
      originalDate: string | null
      startTime: string
      endTime: string
      cancelled: boolean
      staffId: number | null
      staffName: string | null
    }[]
  }[] = []

  sessions.forEach((s, index) => {
    const termIndex = Math.floor(index / 10)
    const weekNumber = (index % 10) + 1
    if (!terms[termIndex]) {
      terms[termIndex] = { term: termIndex + 1, weeks: [] }
    }
    terms[termIndex].weeks.push({
      weekNumber,
      id: s.id,
      date: s.date.toISOString().split('T')[0],
      originalDate: s.originalDate ? s.originalDate.toISOString().split('T')[0] : null,
      startTime: s.startTime,
      endTime: s.endTime,
      cancelled: s.cancelled,
      staffId: s.staffId,
      staffName: s.staff?.name ?? null,
    })
  })

  return Response.json(terms)
}
