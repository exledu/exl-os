/**
 * One-time backfill endpoint for old cover request messages.
 * Hit with: GET /api/slack/backfill?secret=YOUR_SIGNING_SECRET
 */

import { prisma } from '@/lib/db'

export const maxDuration = 60

interface CoverPayload {
  sessionId: number
  requesterId: number
  requesterSlackId: string
  requesterName: string
  className: string
  dateStr: string
  timeStr: string
}

interface SlackMessage {
  ts: string
  text: string
  metadata?: { event_type: string; event_payload: CoverPayload }
  reactions?: Array<{ name: string; users: string[]; count: number }>
}

async function slackApi(method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (!secret || secret !== process.env.SLACK_SIGNING_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const channelId = process.env.SLACK_COVERS_CHANNEL_ID!
  const log: string[] = []

  // Build email cache from Slack
  const usersRes = await slackApi('users.list')
  const slackEmailById = new Map<string, string>()
  for (const m of usersRes.members ?? []) {
    if (m.profile?.email) slackEmailById.set(m.id, m.profile.email)
  }

  // Fetch up to 200 most recent messages with metadata
  const histRes = await slackApi('conversations.history', {
    channel: channelId,
    limit: 200,
    include_all_metadata: true,
  })

  if (!histRes.ok) {
    return Response.json({ error: histRes.error }, { status: 500 })
  }

  const messages: SlackMessage[] = histRes.messages ?? []
  const coverMessages = messages.filter(m => m.metadata?.event_type === 'cover_request')
  log.push(`Found ${coverMessages.length} cover request messages`)

  let updated = 0
  for (const msg of coverMessages) {
    const payload = msg.metadata!.event_payload
    const { sessionId, requesterId, requesterSlackId, requesterName, className, dateStr, timeStr } = payload

    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { class: { select: { staffId: true } } },
    })

    if (!session) {
      log.push(`[skip] Session ${sessionId} not found`)
      continue
    }

    let newText = ''
    let newBlocks: unknown[] = []

    const xReaction = msg.reactions?.find(r => r.name === 'x')
    const cancelledByRequester = xReaction?.users?.includes(requesterSlackId)

    const isCovered =
      session.staffId !== null &&
      session.staffId !== requesterId &&
      session.staffId !== session.class.staffId

    if (cancelledByRequester) {
      const email = slackEmailById.get(requesterSlackId)
      const canceller = email ? await prisma.staff.findUnique({ where: { email } }) : null
      const cancellerName = canceller?.name ?? requesterName
      newText = `❌ COVER CANCELLED by ${cancellerName}`
      newBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: `❌ *COVER CANCELLED* by ${cancellerName}` } }]
    } else if (isCovered) {
      const coverStaff = await prisma.staff.findUnique({ where: { id: session.staffId! } })
      const coverName = coverStaff?.name ?? 'someone'
      newText = `✅ COVER FOUND — Thank you ${coverName}`
      newBlocks = [{
        type: 'section',
        text: { type: 'mrkdwn', text: `✅ *COVER FOUND* — Thank you ${coverName}\n\n*${className}* — ${dateStr}, ${timeStr}\n_Originally requested by ${requesterName}_` },
      }]
    } else {
      newText = `🔄 COVER NEEDED: ${className} — ${dateStr}, ${timeStr}. React ✅ to take this cover.`
      newBlocks = [{
        type: 'section',
        text: { type: 'mrkdwn', text: `🔄 *COVER NEEDED*\n\n*${className}* — ${dateStr}, ${timeStr}\nRequested by ${requesterName}\n\nReact ✅ to take this cover.` },
      }]
    }

    const updateRes = await slackApi('chat.update', {
      channel: channelId,
      ts: msg.ts,
      text: newText,
      blocks: newBlocks,
    })

    if (updateRes.ok) {
      log.push(`[ok] ${msg.ts} → ${newText.slice(0, 60)}`)
      updated++
    } else {
      log.push(`[fail] ${msg.ts}: ${updateRes.error}`)
    }
  }

  log.push(`\nDone. Updated ${updated}/${coverMessages.length} messages.`)
  return new Response(log.join('\n'), { headers: { 'Content-Type': 'text/plain' } })
}
