import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { LeadStage } from '@/lib/generated/prisma/enums'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params
  const lead = await prisma.lead.findUnique({
    where: { id: Number(id) },
    include: {
      owner: { select: { id: true, name: true } },
      events: { orderBy: { timestamp: 'asc' } },
    },
  })
  if (!lead) return new Response('Not found', { status: 404 })
  return Response.json(lead)
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params
  const body = await request.json() as {
    stage?:        LeadStage
    ownerId?:      number | null
    closedReason?: string | null
    notes?:        string | null
  }
  const data: Record<string, unknown> = {}
  if (body.stage) data.stage = body.stage
  if ('ownerId' in body) data.ownerId = body.ownerId
  if ('closedReason' in body) data.closedReason = body.closedReason
  if ('notes' in body) data.notes = body.notes
  if (body.stage === 'CLOSED_LOST') data.closedAt = new Date()
  const lead = await prisma.lead.update({ where: { id: Number(id) }, data })
  return Response.json(lead)
}
