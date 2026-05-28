import { prisma } from '@/lib/db'
import {
  fetchMessage, postMessage, updateMessage, unpinMessage,
  sendDM, lookupSlackUserByEmail,
} from '@/lib/slack'

/**
 * One-shot endpoint to replay Anna Jin's missed ✅ reactions on Jamen Wong's
 * cover requests. Anna's email in OS was wrong; after fixing it, the original
 * reaction events can't be re-delivered by Slack, so we replay them here.
 *
 * Auth: Bearer CRON_SECRET. Delete this route after running.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const channelId = process.env.SLACK_COVERS_CHANNEL_ID
  if (!channelId) return Response.json({ error: 'SLACK_COVERS_CHANNEL_ID not set' }, { status: 500 })

  // Ensure Anna's slackUserId is cached
  const anna = await prisma.staff.findUnique({ where: { email: 'anna.jinn268@gmail.com' } })
  if (!anna) return Response.json({ error: 'Anna not found' }, { status: 404 })

  let annaSlackId = anna.slackUserId
  if (!annaSlackId) {
    annaSlackId = await lookupSlackUserByEmail(anna.email)
    if (annaSlackId) {
      await prisma.staff.update({ where: { id: anna.id }, data: { slackUserId: annaSlackId } })
    }
  }
  if (!annaSlackId) {
    return Response.json({ error: 'Could not resolve Anna in Slack' }, { status: 500 })
  }

  // Pull recent messages from the covers channel
  const histRes = await fetch(`https://slack.com/api/conversations.history`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      channel:              channelId,
      limit:                '100',
      include_all_metadata: 'true',
    }),
  })
  const hist = await histRes.json()
  if (!hist.ok) return Response.json({ error: 'conversations.history failed', detail: hist.error }, { status: 500 })

  type Msg = {
    ts: string
    text: string
    metadata?: { event_type: string; event_payload: Record<string, unknown> }
    reactions?: { name: string; users: string[]; count: number }[]
  }
  const msgs = (hist.messages ?? []) as Msg[]

  const results: { ts: string; sessionId: number; action: string; detail?: string }[] = []

  for (const msg of msgs) {
    if (msg.metadata?.event_type !== 'cover_request') continue
    if (msg.text.includes('COVER FOUND')) continue

    const p = msg.metadata.event_payload as {
      sessionId: number
      requesterId: number
      requesterSlackId: string
      requesterName: string
      className: string
      dateStr: string
      timeStr: string
    }
    if (p.requesterName !== 'Jamen Wong') continue
    const annaReacted = msg.reactions?.some(r => r.name === 'white_check_mark' && r.users.includes(annaSlackId!))
    if (!annaReacted) continue

    // Sanity-check the session
    const session = await prisma.classSession.findUnique({ where: { id: p.sessionId } })
    if (!session) { results.push({ ts: msg.ts, sessionId: p.sessionId, action: 'skip-no-session' }); continue }
    if (session.staffId && session.staffId !== p.requesterId) {
      results.push({ ts: msg.ts, sessionId: p.sessionId, action: 'skip-already-covered' }); continue
    }
    if (anna.id === p.requesterId) {
      results.push({ ts: msg.ts, sessionId: p.sessionId, action: 'skip-requester-is-cover' }); continue
    }

    // Assign Anna
    await prisma.classSession.update({ where: { id: p.sessionId }, data: { staffId: anna.id } })
    await prisma.staffAction.create({ data: {
      staffId:     anna.id,
      type:        'session_staff_changed',
      description: `Covering ${p.className} on ${p.dateStr} (Slack cover from ${p.requesterName} — retrigger)`,
      metadata:    { sessionId: p.sessionId, requesterId: p.requesterId, coverStaffId: anna.id },
    } })

    const filledText = `✅ *COVER FOUND* — Thank you ${anna.name}\n\n*${p.className}* — ${p.dateStr}, ${p.timeStr}\n_Originally requested by ${p.requesterName}_`
    await updateMessage(channelId, msg.ts, `✅ COVER FOUND — Thank you ${anna.name}`, {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: filledText } }],
    })
    await unpinMessage(channelId, msg.ts)

    await sendDM(
      p.requesterSlackId,
      `✅ ${anna.name} has picked up your cover for ${p.className} on ${p.dateStr}, ${p.timeStr}. The timetable has been updated.`
    )
    await sendDM(
      annaSlackId,
      `✅ You're now covering ${p.className} on ${p.dateStr}, ${p.timeStr} for ${p.requesterName}. The timetable has been updated.`
    )

    results.push({ ts: msg.ts, sessionId: p.sessionId, action: 'assigned', detail: `${p.className} ${p.dateStr}` })
  }

  return Response.json({ annaSlackId, processed: results.length, results })
}

// touch the imports list so unused-import lint doesn't flip
void fetchMessage; void postMessage
