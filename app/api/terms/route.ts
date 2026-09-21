import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { createTerm } from '@/lib/terms'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const terms = await prisma.term.findMany({
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { sessions: true } } },
  })
  return Response.json(terms)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const body = await request.json() as {
    name: string; year: number; termNumber: number; startDate: string; weeks?: number
    classIds?: number[]; incrementYearIds?: number[]
  }
  if (!body.name || !body.year || !body.termNumber || !body.startDate) {
    return Response.json({ error: 'name, year, termNumber, startDate required' }, { status: 400 })
  }
  try {
    const result = await createTerm({
      name:       body.name,
      year:       Number(body.year),
      termNumber: Number(body.termNumber),
      startDate:  new Date(body.startDate + 'T00:00:00.000Z'),
      weeks:      body.weeks ? Number(body.weeks) : undefined,
      classIds:         Array.isArray(body.classIds) ? body.classIds.map(Number) : undefined,
      incrementYearIds: Array.isArray(body.incrementYearIds) ? body.incrementYearIds.map(Number) : undefined,
    })
    return Response.json(result, { status: 201 })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 })
  }
}
