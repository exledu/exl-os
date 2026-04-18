import { verifySlackSignature, getUserInfo, openModal } from '@/lib/slack'
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
  const triggerId = params.get('trigger_id')!
  const slackUserId = params.get('user_id')!

  // Look up Slack user's email → match to Staff
  const slackUser = await getUserInfo(slackUserId)
  const callerEmail = slackUser?.profile?.email
  if (!callerEmail) {
    return new Response(
      JSON.stringify({ response_type: 'ephemeral', text: '❌ Could not find your email in Slack. Make sure your Slack profile has an email set.' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Admin can submit on behalf of a tutor: /cover tutor@email.com
  const commandText = (params.get('text') ?? '').trim()
  const adminEmail = process.env.ADMIN_EMAIL ?? ''
  let staffEmail = callerEmail

  if (commandText && commandText.includes('@')) {
    if (callerEmail.toLowerCase() !== adminEmail.toLowerCase()) {
      return new Response(
        JSON.stringify({ response_type: 'ephemeral', text: '❌ Only admins can submit cover requests on behalf of a tutor.' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    staffEmail = commandText
  }

  const staff = await prisma.staff.findUnique({ where: { email: staffEmail } })
  if (!staff) {
    return new Response(
      JSON.stringify({ response_type: 'ephemeral', text: `❌ No staff member found in EXL OS with email ${staffEmail}.` }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Find upcoming sessions for this staff member (next 14 days)
  const now = new Date()
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const sessions = await prisma.classSession.findMany({
    where: {
      cancelled: false,
      date: { gte: now, lte: twoWeeksOut },
      class: { staffId: staff.id },
      // Exclude sessions already covered by someone else
      OR: [{ staffId: null }, { staffId: staff.id }],
    },
    include: {
      class: {
        include: { subject: true, yearLevel: true, room: true },
      },
    },
    orderBy: { date: 'asc' },
  })

  if (sessions.length === 0) {
    return new Response(
      JSON.stringify({ response_type: 'ephemeral', text: '📅 You have no upcoming sessions in the next 2 weeks to request cover for.' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Build modal with session dropdown
  const options = sessions.map(s => {
    const dateStr = format(s.date, 'EEE d MMM')
    const label = `Yr ${s.class.yearLevel.level} ${s.class.subject.name} — ${dateStr}, ${s.startTime}–${s.endTime}`
    return {
      text: { type: 'plain_text' as const, text: label.slice(0, 75) },
      value: String(s.id),
    }
  })

  const view = {
    type: 'modal',
    callback_id: 'cover_request',
    title: { type: 'plain_text', text: 'Request Cover' },
    submit: { type: 'plain_text', text: 'Post Request' },
    close: { type: 'plain_text', text: 'Cancel' },
    private_metadata: JSON.stringify({ staffId: staff.id, staffName: staff.name, slackUserId }),
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'Select the session you need covered:' },
      },
      {
        type: 'input',
        block_id: 'session_select',
        element: {
          type: 'static_select',
          action_id: 'session',
          placeholder: { type: 'plain_text', text: 'Choose a session...' },
          options,
        },
        label: { type: 'plain_text', text: 'Session' },
      },
      {
        type: 'input',
        block_id: 'note_input',
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'note',
          placeholder: { type: 'plain_text', text: 'Any notes (e.g. what to cover)...' },
        },
        label: { type: 'plain_text', text: 'Note (optional)' },
      },
    ],
  }

  await openModal(triggerId, view)

  // Must return 200 within 3s
  return new Response('', { status: 200 })
}
