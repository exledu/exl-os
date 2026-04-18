import { verifySlackSignature, getUserInfo, fetchMessage, postMessage, getBotUserId, sendDM } from '@/lib/slack'
import { prisma } from '@/lib/db'
import { logAction } from '@/lib/staff-actions'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const timestamp = request.headers.get('X-Slack-Request-Timestamp') ?? ''
  const signature = request.headers.get('X-Slack-Signature') ?? ''

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  // Slack URL verification challenge (one-time setup)
  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge })
  }

  // Handle events
  if (payload.type === 'event_callback') {
    const event = payload.event

    // Only handle ✅ reactions on messages
    if (event.type === 'reaction_added' && event.reaction === 'white_check_mark') {
      // Process in background so we return 200 quickly
      handleCoverReaction(event).catch(err =>
        console.error('Cover reaction handler error:', err)
      )
    }
  }

  // Must respond within 3 seconds
  return new Response('', { status: 200 })
}

async function handleCoverReaction(event: {
  user: string
  item: { type: string; channel: string; ts: string }
}) {
  const { user: reactingUserId, item } = event
  if (item.type !== 'message') return

  const channelId = process.env.SLACK_COVERS_CHANNEL_ID!
  if (item.channel !== channelId) return

  // Ignore bot's own reactions
  const botUserId = await getBotUserId()
  if (reactingUserId === botUserId) return

  // Fetch the message to get metadata
  const message = await fetchMessage(item.channel, item.ts)
  if (!message?.metadata || message.metadata.event_type !== 'cover_request') return

  const { sessionId, requesterId, requesterSlackId, requesterName, className, dateStr, timeStr } =
    message.metadata.event_payload as {
      sessionId: number
      requesterId: number
      requesterSlackId: string
      requesterName: string
      className: string
      dateStr: string
      timeStr: string
    }

  // Look up the reacting user's email → Staff record
  const slackUser = await getUserInfo(reactingUserId)
  const email = slackUser?.profile?.email
  if (!email) {
    await postMessage(item.channel, `⚠️ <@${reactingUserId}> — could not find your email in Slack. Make sure your profile has an email set.`, {
      thread_ts: item.ts,
    })
    return
  }

  const coverStaff = await prisma.staff.findUnique({ where: { email } })
  if (!coverStaff) {
    await postMessage(item.channel, `⚠️ <@${reactingUserId}> — no staff record found in EXL OS for ${email}. Ask an admin to add you.`, {
      thread_ts: item.ts,
    })
    return
  }

  // Don't let the requester cover their own session
  if (coverStaff.id === requesterId) return

  // Check if session is already covered by someone else
  const session = await prisma.classSession.findUnique({ where: { id: sessionId } })
  if (!session) return
  if (session.staffId && session.staffId !== requesterId && session.staffId !== session.classId) {
    // Already covered by a different person
    await postMessage(item.channel, `⚠️ This session has already been covered.`, {
      thread_ts: item.ts,
    })
    return
  }

  // Assign the covering staff member
  await prisma.classSession.update({
    where: { id: sessionId },
    data: { staffId: coverStaff.id },
  })

  // Log the action
  logAction({
    staffId: coverStaff.id,
    type: 'session_staff_changed',
    description: `Covering ${className} on ${dateStr} (via Slack cover request from ${requesterName})`,
    metadata: { sessionId, requesterId, coverStaffId: coverStaff.id },
  })

  // Post confirmation in thread
  await postMessage(
    item.channel,
    `✅ <@${reactingUserId}> (${coverStaff.name}) is covering ${className} on ${dateStr}, ${timeStr}. The timetable has been updated automatically.`,
    { thread_ts: item.ts }
  )

  // DM both tutors
  await sendDM(
    requesterSlackId,
    `✅ ${coverStaff.name} has picked up your cover for ${className} on ${dateStr}, ${timeStr}. The timetable has been updated.`
  )
  await sendDM(
    reactingUserId,
    `✅ You're now covering ${className} on ${dateStr}, ${timeStr} for ${requesterName}. The timetable has been updated.`
  )
}
