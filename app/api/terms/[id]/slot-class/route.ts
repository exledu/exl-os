import { auth } from '@/auth'
import { slotClassIntoTerm, weekNumberFor } from '@/lib/terms'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Slot an existing class into this term. Called after class-create when the
 * new class's start date falls inside the term window; also usable to backfill
 * a class that was created outside any term.
 *
 * Body: { classId, fromWeek?, fromDate? }
 *   - fromWeek: 1..term.weeks — explicit week number to start seeding from.
 *   - fromDate: YYYY-MM-DD — start date, derived to weekNumber against term.
 *   Exactly one of the two is required.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params
  const termId = Number(id)
  const body = await request.json() as { classId: number; fromWeek?: number; fromDate?: string }
  if (!body.classId) return Response.json({ error: 'classId required' }, { status: 400 })

  let fromWeek = body.fromWeek
  if (fromWeek == null && body.fromDate) {
    const term = await prisma.term.findUnique({ where: { id: termId } })
    if (!term) return new Response('Term not found', { status: 404 })
    const w = weekNumberFor(term.startDate, term.weeks, new Date(body.fromDate + 'T00:00:00.000Z'))
    if (w == null) {
      return Response.json({ error: 'fromDate is outside this term' }, { status: 400 })
    }
    fromWeek = w
  }
  if (fromWeek == null || fromWeek < 1) fromWeek = 1

  const result = await slotClassIntoTerm(Number(body.classId), termId, fromWeek)
  return Response.json({ ok: true, fromWeek, ...result })
}
