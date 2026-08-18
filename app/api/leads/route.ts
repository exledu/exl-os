import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/leads → list with derived response-time + recency metrics.
export async function GET() {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, name: true } },
      events: {
        orderBy: { timestamp: 'asc' },
        select: { id: true, timestamp: true, direction: true, channel: true, subject: true },
      },
    },
  })

  const now = Date.now()
  const rows = leads.map(l => {
    const outbound = l.events.filter(e => e.direction === 'outbound')
    const inbound  = l.events.filter(e => e.direction === 'inbound')
    const firstOutbound = outbound[0]
    const lastEvent     = l.events[l.events.length - 1]
    const lastInbound   = inbound[inbound.length - 1]
    const firstResponseMs = firstOutbound ? firstOutbound.timestamp.getTime() - l.createdAt.getTime() : null
    const contactRecencyMs    = lastEvent   ? now - lastEvent.timestamp.getTime()   : now - l.createdAt.getTime()
    const engagementRecencyMs = lastInbound ? now - lastInbound.timestamp.getTime() : now - l.createdAt.getTime()
    return {
      id:            l.id,
      createdAt:     l.createdAt,
      formType:      l.formType,
      parentName:    l.parentName,
      studentName:   l.studentName,
      email:         l.email,
      phone:         l.phone,
      yearLevel:     l.yearLevel,
      subjects:      l.subjects,
      stage:         l.stage,
      owner:         l.owner,
      closedReason:  l.closedReason,
      eventCount:    l.events.length,
      outboundCount: outbound.length,
      inboundCount:  inbound.length,
      firstResponseMs,
      contactRecencyMs,
      engagementRecencyMs,
    }
  })
  return Response.json(rows)
}
