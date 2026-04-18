import { verifySlackSignature, postMessage, addReaction } from '@/lib/slack'
import { prisma } from '@/lib/db'
import { format } from 'date-fns'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const timestamp = request.headers.get('X-Slack-Request-Timestamp') ?? ''
  const signature = request.headers.get('X-Slack-Signature') ?? ''

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const payload = JSON.parse(params.get('payload')!)

  // Only handle our cover_request modal submission
  if (payload.type !== 'view_submission' || payload.view?.callback_id !== 'cover_request') {
    return new Response('', { status: 200 })
  }

  const { staffId, staffName, slackUserId } = JSON.parse(payload.view.private_metadata)
  const sessionId = Number(
    payload.view.state.values.session_select.session.selected_option.value
  )
  const note = payload.view.state.values.note_input?.note?.value ?? null

  // Fetch session details
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { include: { subject: true, yearLevel: true, room: true } },
    },
  })

  if (!session) {
    return Response.json({ response_action: 'errors', errors: { session_select: 'Session not found' } })
  }

  const channelId = process.env.SLACK_COVERS_CHANNEL_ID!

  // Build the cover request message
  const className = `Yr ${session.class.yearLevel.level} ${session.class.subject.name}`
  const shortDate = format(session.date, 'EEE d MMM')
  const timeStr = `${session.startTime}–${session.endTime}`

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🔄 *Cover Needed*\n\n*${className}* — ${shortDate}, ${timeStr}\nRequested by ${staffName}${note ? `\n\n_${note}_` : ''}\n\nReact ✅ to cover this session.` },
    },
  ]

  const fallbackText = `🔄 Cover Needed: ${className} — ${shortDate}, ${timeStr}. Requested by ${staffName}. React ✅ to cover.`

  const result = await postMessage(channelId, fallbackText, {
    blocks,
    metadata: {
      event_type: 'cover_request',
      event_payload: {
        sessionId,
        requesterId: staffId,
        requesterSlackId: slackUserId,
        requesterName: staffName,
        className,
        dateStr: shortDate,
        timeStr,
      },
    },
  })

  // Add ✅ reaction as a prompt
  if (result.ok && result.ts) {
    await addReaction(channelId, result.ts, 'white_check_mark')
  }

  // Close the modal
  return Response.json({ response_action: 'clear' })
}
