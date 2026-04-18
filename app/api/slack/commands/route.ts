import { verifySlackSignature, openModal, getSlackUserEmail } from '@/lib/slack'
import { prisma } from '@/lib/db'
import { format, parse, startOfDay, endOfDay } from 'date-fns'

export const maxDuration = 30

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

  // Parse command text: /cover [email] [date]
  // Examples: /cover, /cover 23/4, /cover tutor@email.com, /cover tutor@email.com 23/4
  const commandText = (params.get('text') ?? '').trim()
  const parts = commandText.split(/\s+/).filter(Boolean)
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase()

  let staffEmail: string | null = null
  let filterDate: Date | null = null

  for (const part of parts) {
    if (part.includes('@')) {
      // Email argument — admin override
      const callerEmail = (await getSlackUserEmail(slackUserId))?.toLowerCase() ?? ''
      if (callerEmail && callerEmail !== adminEmail) {
        return ephemeral('❌ Only admins can submit cover requests on behalf of a tutor.')
      }
      staffEmail = part.toLowerCase()
    } else {
      // Try to parse as a date (d/M, dd/MM, dd/MM/yyyy)
      const parsed = tryParseDate(part)
      if (parsed) {
        filterDate = parsed
      }
    }
  }

  // If no email provided, look up caller's own email
  if (!staffEmail) {
    const callerEmail = await getSlackUserEmail(slackUserId)
    if (!callerEmail) {
      return ephemeral('❌ Could not find your email in Slack. Make sure your Slack profile has an email set.')
    }
    staffEmail = callerEmail.toLowerCase()
  }

  const staff = await prisma.staff.findUnique({ where: { email: staffEmail } })
  if (!staff) {
    return ephemeral(`❌ No staff member found in EXL OS with email ${staffEmail}.`)
  }

  // Query sessions — either for specific date or next 14 days
  const now = new Date()
  const dateStart = filterDate ? startOfDay(filterDate) : now
  const dateEnd = filterDate ? endOfDay(filterDate) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const sessions = filterDate
    ? // When filtering by date, show ALL sessions on that day (any staff)
      await prisma.classSession.findMany({
        where: {
          cancelled: false,
          date: { gte: dateStart, lte: dateEnd },
          OR: [{ staffId: null }, { staffId: { not: null } }],
        },
        include: {
          class: { include: { subject: true, yearLevel: true, room: true, staff: true } },
        },
        orderBy: { date: 'asc' },
      })
    : // Default: show sessions where this staff is primary or session-level override
      await prisma.classSession.findMany({
        where: {
          cancelled: false,
          date: { gte: startOfDay(now), lte: dateEnd },
          OR: [
            // Primary teacher (no session override)
            { class: { staffId: staff.id }, staffId: null },
            // Session-level override to this staff
            { staffId: staff.id },
          ],
        },
        include: {
          class: { include: { subject: true, yearLevel: true, room: true, staff: true } },
        },
        orderBy: { date: 'asc' },
      })

  if (sessions.length === 0) {
    const dateMsg = filterDate
      ? `on ${format(filterDate, 'EEE d MMM')}`
      : 'in the next 2 weeks'
    return ephemeral(`📅 No sessions found ${dateMsg}.`)
  }

  // Build modal with session dropdown
  const options = sessions.map(s => {
    const dateStr = format(s.date, 'EEE d MMM')
    const staffName = s.class.staff?.name ?? 'Unassigned'
    const label = filterDate
      ? `${staffName} — Yr ${s.class.yearLevel.level} ${s.class.subject.name}, ${s.startTime}–${s.endTime}`
      : `Yr ${s.class.yearLevel.level} ${s.class.subject.name} — ${dateStr}, ${s.startTime}–${s.endTime}`
    return {
      text: { type: 'plain_text' as const, text: label.slice(0, 75) },
      value: String(s.id),
    }
  })

  const headerText = filterDate
    ? `Sessions on ${format(filterDate, 'EEEE d MMMM')}:`
    : 'Select the session you need covered:'

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
        text: { type: 'mrkdwn', text: headerText },
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
  return new Response('', { status: 200 })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ephemeral(text: string) {
  return new Response(
    JSON.stringify({ response_type: 'ephemeral', text }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

function tryParseDate(input: string): Date | null {
  // Support: 23/4, 23/04, 23/4/2026, 23/04/2026
  const formats = ['d/M/yyyy', 'd/M', 'dd/MM/yyyy', 'dd/MM']
  for (const fmt of formats) {
    try {
      const parsed = parse(input, fmt, new Date())
      if (!isNaN(parsed.getTime())) return parsed
    } catch { /* try next format */ }
  }
  return null
}
