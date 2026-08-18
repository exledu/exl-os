import { google, gmail_v1 } from 'googleapis'
import { prisma } from '@/lib/db'

/**
 * Lead ingestion from admin@ Gmail.
 *
 * Two passes:
 *   1. Sent messages with subject "Contact Us" → new Lead rows (dedupe on
 *      gmailMessageId). The form emails us its own notification, so those
 *      messages both mark the lead's created_at and carry the form data.
 *   2. For each open lead: search recent messages involving lead.email in
 *      either direction, upsert as LeadContactEvent (dedupe on gmailMessageId).
 *
 * Uses the same OAuth token as gmail-send (scope: gmail.readonly).
 */

const NOTIFICATION_TO = 'llicapitalptyltdmanagement@gmail.com'
const NOTIFICATION_SUBJECT = 'Contact Us'
const ADMIN_ADDRESSES = new Set(['admin@exleducation.com.au'])

async function getGmailClient() {
  const token = await prisma.oAuthToken.findUnique({ where: { provider: 'google' } })
  if (!token) throw new Error('Gmail not connected')

  const oauth2 = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET)
  oauth2.setCredentials({
    access_token:  token.accessToken,
    refresh_token: token.refreshToken,
  })
  if (token.expiresAt && new Date() >= token.expiresAt) {
    const { credentials } = await oauth2.refreshAccessToken()
    oauth2.setCredentials(credentials)
    await prisma.oAuthToken.update({
      where: { provider: 'google' },
      data: {
        accessToken: credentials.access_token!,
        expiresAt:   credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      },
    })
  }
  return google.gmail({ version: 'v1', auth: oauth2 })
}

function header(msg: gmail_v1.Schema$Message, name: string): string | undefined {
  return msg.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined
}

// Recursively pull the first text/html and text/plain parts out of a message.
function extractBodies(payload: gmail_v1.Schema$MessagePart | undefined): { html: string; text: string } {
  let html = ''
  let text = ''
  const walk = (p: gmail_v1.Schema$MessagePart | undefined) => {
    if (!p) return
    if (p.mimeType === 'text/html' && p.body?.data && !html) {
      html = Buffer.from(p.body.data, 'base64').toString('utf-8')
    } else if (p.mimeType === 'text/plain' && p.body?.data && !text) {
      text = Buffer.from(p.body.data, 'base64').toString('utf-8')
    }
    p.parts?.forEach(walk)
  }
  walk(payload)
  return { html, text }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;|&apos;/g, `'`)
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_RE = /\b0\d{9,}\b|\+?\d[\d\s\-()]{7,}\d/

interface ParsedLead {
  formType:    string
  parentName?: string
  studentName?: string
  email:       string
  otherEmails: string[]
  phone?:      string
  yearLevel?:  number
  subjects?:   string
  message?:    string
  rawBody:     string
}

// Field labels the form templates use, in the order we prefer them.
const LABEL_KEYS = [
  'FULL NAME',
  'STUDENT FULL NAME',
  'PARENT NAME',
  'PARENT FULL NAME',
  'EMAIL ADDRESS',
  'STUDENT EMAIL',
  'PARENT EMAIL',
  'PHONE NUMBER',
  'MOBILE',
  'YEAR LEVEL',
  'CURRENT YEAR',
  'SUBJECT',
  'SUBJECTS',
  'MESSAGE',
  'ADDITIONAL COMMENTS',
] as const

// Grab the value that follows a labeled section header. The form templates
// render labels in a header row and the value immediately below, so after
// stripHtml the pattern is "LABEL\nVALUE\n(next LABEL or blank)".
function extractField(text: string, label: string): string | undefined {
  const re = new RegExp(
    `(?:^|\\n)\\s*${label.replace(/ /g, '\\s+')}\\s*[:\\n]\\s*([^\\n]+)`,
    'i',
  )
  const m = re.exec(text)
  return m?.[1]?.trim()
}

function parseYear(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /(\d{1,2})/.exec(s)
  if (!m) return undefined
  const n = Number(m[1])
  return n >= 6 && n <= 12 ? n : undefined
}

export function parseLeadFromBody(text: string, from: string | undefined): ParsedLead | null {
  const fullName    = extractField(text, 'FULL NAME')
  const studentFull = extractField(text, 'STUDENT FULL NAME')
  const parentName  = extractField(text, 'PARENT NAME') ?? extractField(text, 'PARENT FULL NAME')

  // Only accept the labeled email if it actually looks like an email — the
  // regex can otherwise capture the next section's label when the value is
  // blank (e.g. "EMAIL ADDRESS\nPHONE NUMBER").
  const looksLikeEmail = (s: string | undefined): s is string =>
    !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
  const primaryEmailField = [
    extractField(text, 'STUDENT EMAIL'),
    extractField(text, 'EMAIL ADDRESS'),
    extractField(text, 'PARENT EMAIL'),
  ].find(looksLikeEmail)

  const allEmails = Array.from(new Set((text.match(EMAIL_RE) ?? [])
    .map(e => e.toLowerCase())
    .filter(e => !ADMIN_ADDRESSES.has(e) && !e.endsWith('@exleducation.com.au'))
  ))

  const email = (primaryEmailField ?? allEmails[0])?.toLowerCase()
  if (!email || !looksLikeEmail(email)) return null

  const phoneField = extractField(text, 'PHONE NUMBER') ?? extractField(text, 'MOBILE')
  const phone      = phoneField ?? PHONE_RE.exec(text)?.[0]?.trim()

  const yearLevel = parseYear(extractField(text, 'YEAR LEVEL') ?? extractField(text, 'CURRENT YEAR'))
  const subjects  = extractField(text, 'SUBJECTS') ?? extractField(text, 'SUBJECT')
  const message   = extractField(text, 'MESSAGE') ?? extractField(text, 'ADDITIONAL COMMENTS')

  const formType = /trial|booking/i.test(text.slice(0, 400)) ? 'trial' : 'contact'
  const parentNameGuess = formType === 'trial' ? (parentName ?? fullName) : fullName
  const studentName = studentFull ?? (formType === 'contact' ? fullName : undefined)

  return {
    formType,
    parentName:  parentNameGuess,
    studentName,
    email,
    otherEmails: allEmails.filter(e => e !== email),
    phone,
    yearLevel,
    subjects,
    message,
    rawBody: text,
  }
}

async function fetchMessageIds(gmail: gmail_v1.Gmail, q: string): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const res: { data: gmail_v1.Schema$ListMessagesResponse } = await gmail.users.messages.list({
      userId: 'me', q, maxResults: 100, pageToken,
    })
    res.data.messages?.forEach(m => { if (m.id) ids.push(m.id) })
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return ids
}

async function fetchMessage(gmail: gmail_v1.Gmail, id: string) {
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  return res.data
}

// ── Pass 1: ingest notification emails as Lead rows ───────────────────────

async function ingestNotifications(gmail: gmail_v1.Gmail, sinceDays: number) {
  const q = `in:sent to:${NOTIFICATION_TO} subject:"${NOTIFICATION_SUBJECT}" newer_than:${sinceDays}d`
  const ids = await fetchMessageIds(gmail, q)

  const existing = new Set(
    (await prisma.lead.findMany({
      where: { gmailMessageId: { in: ids } },
      select: { gmailMessageId: true },
    })).map(l => l.gmailMessageId),
  )

  const toInsert = ids.filter(id => !existing.has(id))
  let created = 0, skippedNoEmail = 0

  for (const id of toInsert) {
    const msg = await fetchMessage(gmail, id)
    const { html, text } = extractBodies(msg.payload)
    const body = text || stripHtml(html)
    const from = header(msg, 'From')
    const parsed = parseLeadFromBody(body, from)
    if (!parsed) { skippedNoEmail++; continue }

    const internalMs = msg.internalDate ? Number(msg.internalDate) : Date.now()
    // Dedupe by email across a small window: if the same email has submitted
    // in the last 24h, treat this as noise (double-submit) rather than a new
    // lead. Still record the notification message id so we don't re-check.
    const dupe = await prisma.lead.findFirst({
      where: {
        email: parsed.email,
        createdAt: { gte: new Date(internalMs - 24 * 3600_000) },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (dupe) {
      // record the gmail id on the existing lead's rawBody trailer so we don't
      // count it twice next run (best-effort — separate row not needed)
      continue
    }

    await prisma.lead.create({
      data: {
        createdAt:      new Date(internalMs),
        formType:       parsed.formType,
        parentName:     parsed.parentName ?? null,
        studentName:    parsed.studentName ?? null,
        email:          parsed.email,
        otherEmails:    parsed.otherEmails,
        phone:          parsed.phone ?? null,
        yearLevel:      parsed.yearLevel ?? null,
        subjects:       parsed.subjects ?? null,
        message:        parsed.message ?? null,
        rawBody:        parsed.rawBody.slice(0, 20_000),
        gmailMessageId: id,
        gmailThreadId:  msg.threadId ?? null,
      },
    })
    created++
  }

  return { scanned: ids.length, created, skippedNoEmail }
}

// ── Pass 2: match subsequent emails to existing leads ─────────────────────

async function ingestEventsForLead(gmail: gmail_v1.Gmail, lead: {
  id: number; email: string; createdAt: Date;
}, sinceDays: number) {
  // Look at both directions within the window. sinceDays is bounded from
  // lead.createdAt if that's more recent than the window.
  const afterDate = new Date(Math.max(
    lead.createdAt.getTime(),
    Date.now() - sinceDays * 86_400_000,
  ))
  const after = Math.floor(afterDate.getTime() / 1000)
  const q = `(to:${lead.email} OR from:${lead.email}) after:${after}`
  const ids = await fetchMessageIds(gmail, q)
  if (ids.length === 0) return { scanned: 0, added: 0 }

  const already = new Set(
    (await prisma.leadContactEvent.findMany({
      where: { gmailMessageId: { in: ids } },
      select: { gmailMessageId: true },
    })).map(e => e.gmailMessageId),
  )

  let added = 0
  for (const id of ids) {
    if (already.has(id)) continue
    const msg = await fetchMessage(gmail, id)
    const from = header(msg, 'From') ?? ''
    const to   = header(msg, 'To')   ?? ''
    const subj = header(msg, 'Subject') ?? undefined
    const internalMs = msg.internalDate ? Number(msg.internalDate) : Date.now()

    // Direction: from the admin address = outbound; from the lead's address = inbound.
    // Anything else (BCC to some other recipient etc.) we default to inbound.
    const fromLower = from.toLowerCase()
    const isOutbound = Array.from(ADMIN_ADDRESSES).some(a => fromLower.includes(a))
                     || fromLower.includes('@exleducation.com.au')
    const direction = isOutbound ? 'outbound' : 'inbound'

    // Skip the notification-to-self emails; they're leads, not conversation.
    if (isOutbound && to.toLowerCase().includes(NOTIFICATION_TO)) continue

    await prisma.leadContactEvent.create({
      data: {
        leadId:         lead.id,
        timestamp:      new Date(internalMs),
        direction,
        channel:        'email',
        subject:        subj?.slice(0, 500) ?? null,
        snippet:        msg.snippet?.slice(0, 500) ?? null,
        fromAddress:    from.slice(0, 500),
        toAddress:      to.slice(0, 500),
        gmailMessageId: id,
      },
    })
    added++
  }

  return { scanned: ids.length, added }
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function runLeadsIngest(sinceDays = 60) {
  const gmail = await getGmailClient()

  const notifications = await ingestNotifications(gmail, sinceDays)

  const leads = await prisma.lead.findMany({
    where: { stage: { notIn: ['CLOSED_LOST'] } },
    select: { id: true, email: true, createdAt: true },
  })

  let totalEventsAdded = 0
  for (const lead of leads) {
    const r = await ingestEventsForLead(gmail, lead, sinceDays)
    totalEventsAdded += r.added
  }

  return {
    notifications,
    activeLeadsScanned: leads.length,
    eventsAdded: totalEventsAdded,
  }
}
