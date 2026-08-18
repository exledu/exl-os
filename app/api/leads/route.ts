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
    const lastOutbound  = outbound[outbound.length - 1]
    const lastEvent     = l.events[l.events.length - 1]
    const lastInbound   = inbound[inbound.length - 1]
    const firstResponseMs = firstOutbound ? firstOutbound.timestamp.getTime() - l.createdAt.getTime() : null
    const contactRecencyMs    = lastEvent   ? now - lastEvent.timestamp.getTime()   : now - l.createdAt.getTime()
    const engagementRecencyMs = lastInbound ? now - lastInbound.timestamp.getTime() : now - l.createdAt.getTime()

    // Their-reply latency: walk outbound events in order; for each, find the
    // first inbound that came after it. Take the most recent such pair. If the
    // latest outbound has no reply yet, expose it as "waitingMs" so the UI can
    // show "waiting 3.2d" in a muted tone.
    let theirReplyMs: number | null = null
    let waitingForReplyMs: number | null = null
    if (lastOutbound) {
      const nextInbound = inbound.find(i => i.timestamp > lastOutbound.timestamp)
      if (nextInbound) {
        theirReplyMs = nextInbound.timestamp.getTime() - lastOutbound.timestamp.getTime()
      } else {
        waitingForReplyMs = now - lastOutbound.timestamp.getTime()
      }
    }
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
      theirReplyMs,
      waitingForReplyMs,
      contactRecencyMs,
      engagementRecencyMs,
    }
  })
  return Response.json(rows)
}
