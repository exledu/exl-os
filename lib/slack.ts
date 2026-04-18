import crypto from 'crypto'

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!

// ── Signature verification ──────────────────────────────────────────────────

export function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const fiveMinutes = 5 * 60
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > fiveMinutes) return false

  const sigBasestring = `v0:${timestamp}:${body}`
  const mySignature =
    'v0=' +
    crypto
      .createHmac('sha256', SLACK_SIGNING_SECRET)
      .update(sigBasestring, 'utf8')
      .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(signature, 'utf8')
  )
}

// ── Slack Web API helpers ───────────────────────────────────────────────────

async function slackApi(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!data.ok) {
    console.error(`Slack API error (${method}):`, data.error, data.response_metadata)
  }
  return data
}

/** Look up a Slack user's profile (includes email). */
export async function getUserInfo(userId: string) {
  const data = await slackApi('users.info', { user: userId })
  return data.user as {
    id: string
    real_name: string
    profile: { email?: string; display_name?: string }
  } | undefined
}

/** Open a modal (views.open). */
export async function openModal(triggerId: string, view: Record<string, unknown>) {
  return slackApi('views.open', { trigger_id: triggerId, view })
}

/** Post a message to a channel. */
export async function postMessage(
  channel: string,
  text: string,
  opts?: {
    blocks?: unknown[]
    metadata?: { event_type: string; event_payload: Record<string, unknown> }
    thread_ts?: string
  }
) {
  return slackApi('chat.postMessage', {
    channel,
    text,
    ...(opts?.blocks && { blocks: opts.blocks }),
    ...(opts?.metadata && { metadata: opts.metadata }),
    ...(opts?.thread_ts && { thread_ts: opts.thread_ts }),
  })
}

/** Fetch a single message by its timestamp. */
export async function fetchMessage(channel: string, ts: string) {
  const data = await slackApi('conversations.history', {
    channel,
    latest: ts,
    inclusive: true,
    limit: 1,
    include_all_metadata: true,
  })
  return data.messages?.[0] as
    | { ts: string; text: string; metadata?: { event_type: string; event_payload: Record<string, unknown> } }
    | undefined
}

/** Add a reaction to a message. */
export async function addReaction(channel: string, timestamp: string, name: string) {
  return slackApi('reactions.add', { channel, timestamp, name })
}

/** Remove a reaction from a message. */
export async function removeReaction(channel: string, timestamp: string, name: string) {
  return slackApi('reactions.remove', { channel, timestamp, name })
}

/** Send a DM to a user. */
export async function sendDM(userId: string, text: string) {
  // Open a DM conversation first
  const conv = await slackApi('conversations.open', { users: userId })
  if (!conv.ok) return conv
  return postMessage(conv.channel.id, text)
}

/** Get the bot's own user ID (for filtering out bot reactions). */
export async function getBotUserId() {
  const data = await slackApi('auth.test', {})
  return data.user_id as string | undefined
}
