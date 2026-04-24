/**
 * Backfill old cover request messages in #covers-tutors with the new format.
 *
 * For each cover_request message in the channel:
 * - If the session has a covering tutor different from the requester → mark as COVER FOUND
 * - If there is a ❌ reaction from the requester → mark as COVER CANCELLED
 * - Otherwise leave it as COVER NEEDED (re-render in new format)
 *
 * Run with: SLACK_BOT_TOKEN=... SLACK_COVERS_CHANNEL_ID=... npx tsx scripts/backfill-cover-messages.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!
const SLACK_COVERS_CHANNEL_ID = process.env.SLACK_COVERS_CHANNEL_ID!

if (!SLACK_BOT_TOKEN || !SLACK_COVERS_CHANNEL_ID) {
  console.error('Missing SLACK_BOT_TOKEN or SLACK_COVERS_CHANNEL_ID env vars')
  process.exit(1)
}

async function slackApi(method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

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

async function main() {
  console.log('Fetching messages from #covers-tutors...')

  // Build email cache from Slack
  const usersRes = await slackApi('users.list')
  const slackEmailById = new Map<string, string>()
  for (const m of usersRes.members ?? []) {
    if (m.profile?.email) slackEmailById.set(m.id, m.profile.email)
  }

  // Fetch up to 200 most recent messages with metadata
  const histRes = await slackApi('conversations.history', {
    channel: SLACK_COVERS_CHANNEL_ID,
    limit: 200,
    include_all_metadata: true,
  })

  if (!histRes.ok) {
    console.error('Failed to fetch history:', histRes.error)
    process.exit(1)
  }

  const messages: SlackMessage[] = histRes.messages ?? []
  const coverMessages = messages.filter(
    m => m.metadata?.event_type === 'cover_request'
  )

  console.log(`Found ${coverMessages.length} cover request messages`)

  let updated = 0
  for (const msg of coverMessages) {
    const payload = msg.metadata!.event_payload as CoverPayload
    const { sessionId, requesterId, requesterSlackId, requesterName, className, dateStr, timeStr } = payload

    // Determine current state from DB + reactions
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { class: { select: { staffId: true } } },
    })

    if (!session) {
      console.log(`  [skip] Session ${sessionId} not found in DB`)
      continue
    }

    let newText = ''
    let newBlocks: unknown[] = []

    // Check for ❌ reaction from requester (cancelled)
    const xReaction = msg.reactions?.find(r => r.name === 'x')
    const cancelledByRequester = xReaction?.users?.includes(requesterSlackId)

    // Check if session has been covered by someone other than requester/class default
    const isCovered =
      session.staffId !== null &&
      session.staffId !== requesterId &&
      session.staffId !== session.class.staffId

    if (cancelledByRequester) {
      // CANCELLED
      const email = slackEmailById.get(requesterSlackId)
      const canceller = email
        ? await prisma.staff.findUnique({ where: { email } })
        : null
      const cancellerName = canceller?.name ?? requesterName
      newText = `❌ COVER CANCELLED by ${cancellerName}`
      newBlocks = [{
        type: 'section',
        text: { type: 'mrkdwn', text: `❌ *COVER CANCELLED* by ${cancellerName}` },
      }]
    } else if (isCovered) {
      // FILLED
      const coverStaff = await prisma.staff.findUnique({ where: { id: session.staffId! } })
      const coverName = coverStaff?.name ?? 'someone'
      newText = `✅ COVER FOUND — Thank you ${coverName}`
      newBlocks = [{
        type: 'section',
        text: { type: 'mrkdwn', text: `✅ *COVER FOUND* — Thank you ${coverName}\n\n*${className}* — ${dateStr}, ${timeStr}\n_Originally requested by ${requesterName}_` },
      }]
    } else {
      // NEEDED — re-render in new format
      newText = `🔄 COVER NEEDED: ${className} — ${dateStr}, ${timeStr}. React ✅ to take this cover.`
      newBlocks = [{
        type: 'section',
        text: { type: 'mrkdwn', text: `🔄 *COVER NEEDED*\n\n*${className}* — ${dateStr}, ${timeStr}\nRequested by ${requesterName}\n\nReact ✅ to take this cover.` },
      }]
    }

    const updateRes = await slackApi('chat.update', {
      channel: SLACK_COVERS_CHANNEL_ID,
      ts: msg.ts,
      text: newText,
      blocks: newBlocks,
    })

    if (updateRes.ok) {
      console.log(`  [ok] Updated ${msg.ts} → ${newText.slice(0, 60)}`)
      updated++
    } else {
      console.error(`  [fail] ${msg.ts}: ${updateRes.error}`)
    }
  }

  console.log(`\nDone. Updated ${updated}/${coverMessages.length} messages.`)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
