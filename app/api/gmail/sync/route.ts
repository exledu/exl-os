import { google, gmail_v1 } from 'googleapis'
import { prisma } from '@/lib/db'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { extractStudentFromForm, classifyEmail } from '@/lib/groq'

// ── MIME helpers ──────────────────────────────────────────────────────────────

function decodeBase64(data: string): string {
  return Buffer.from(data, 'base64').toString('utf-8')
}

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function extractPlainText(part: gmail_v1.Schema$MessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeQuotedPrintable(decodeBase64(part.body.data))
  }
  for (const child of part.parts ?? []) {
    const result = extractPlainText(child)
    if (result) return result
  }
  return ''
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

// ── Contact Form parser ───────────────────────────────────────────────────────

function parseContactForm(text: string) {
  const labels = [
    'Full Name', 'Email Address', 'Phone Number', 'Age',
    'Course of Interest', 'Message', 'Submission Date & Time',
  ]
  const result: Record<string, string> = {}
  let collectingMessage = false
  const messageLines: string[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const matched = labels.find(l => line.startsWith(l))
    if (matched) {
      collectingMessage = false
      const value = line.slice(matched.length).trim()
      if (value) result[matched] = value
      else if (matched === 'Message') collectingMessage = true
    } else if (collectingMessage) {
      if (line.startsWith('Admin Notification') || line.startsWith('Reply to:') || line.startsWith('This is an automated')) {
        collectingMessage = false
      } else {
        messageLines.push(line)
      }
    }
  }
  if (messageLines.length) result['Message'] = messageLines.join('\n')
  return result
}

// ── Free Trial Booking parser ─────────────────────────────────────────────────

function parseFreeTrial(text: string) {
  const labels = [
    'Student Full Name', 'Student Email', 'Student Mobile', 'School',
    'Year Level (2025)', 'Year Level (2026)',
    'Parent Full Name', 'Parent Email', 'Parent Mobile',
    'Subjects of Interest', 'Submitted On', 'Form Submitted By',
  ]
  const result: Record<string, string> = {}
  let collectingSubjects = false
  const subjectLines: string[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^[^\x00-\x7F]/.test(line) && line.length < 40) continue

    const matched = labels.find(l => line.startsWith(l))
    if (matched) {
      collectingSubjects = false
      const value = line.slice(matched.length).trim()
      if (value) result[matched] = value
      else if (matched === 'Subjects of Interest') collectingSubjects = true
    } else if (collectingSubjects) {
      if (line.startsWith('Admin Notification') || line.startsWith('Submitted On') || line.startsWith('Form Submitted')) {
        collectingSubjects = false
      } else {
        subjectLines.push(line)
      }
    }
  }
  if (subjectLines.length) result['Subjects of Interest'] = subjectLines.join(', ')
  return result
}

// ── Auto-create student from LLM-extracted fields ────────────────────────────

async function autoCreateStudent(note: string, issueId: number) {
  try {
    const data = await extractStudentFromForm(note)
    if (!data.firstName) return

    // Find year level record
    let yearLevelId: number | undefined
    if (data.yearLevel) {
      const yl = await prisma.yearLevel.findFirst({ where: { level: data.yearLevel } })
      if (yl) yearLevelId = yl.id
    }
    if (!yearLevelId) {
      const fallback = await prisma.yearLevel.findFirst({ orderBy: { level: 'desc' } })
      if (!fallback) return
      yearLevelId = fallback.id
    }

    const student = await prisma.student.create({
      data: {
        name:            data.firstName,
        lastName:        data.lastName   ?? null,
        email:           data.email      ?? null,
        phone:           data.phone      ?? null,
        school:          data.school     ?? null,
        yearLevelId,
        parentFirstName: data.parentFirstName ?? null,
        parentLastName:  data.parentLastName  ?? null,
        parentEmail:     data.parentEmail     ?? null,
        parentPhone:     data.parentPhone     ?? null,
      },
    })

    // Link student to the issue
    await prisma.issue.update({
      where: { id: issueId },
      data:  { studentId: student.id },
    })
  } catch (err) {
    console.error('autoCreateStudent failed:', err)
  }
}

// ── Build a Gmail client from a stored token ──────────────────────────────────

function makeGmailClient(tokenRecord: { accessToken: string; refreshToken: string | null }) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  )
  oauth2Client.setCredentials({
    access_token:  tokenRecord.accessToken,
    refresh_token: tokenRecord.refreshToken ?? undefined,
  })
  oauth2Client.on('tokens', async (tokens) => {
    // best-effort token refresh persistence (fire and forget)
    if (tokens.access_token) {
      prisma.oAuthToken.updateMany({
        where: { accessToken: tokenRecord.accessToken },
        data:  { accessToken: tokens.access_token, expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null },
      }).catch(() => {})
    }
  })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// ── Scan llicap inbox for booking form emails ─────────────────────────────────

async function syncBookingForms(token: { accessToken: string; refreshToken: string | null }) {
  const gmail   = makeGmailClient(token)
  const listRes = await gmail.users.messages.list({
    userId:     'me',
    q:          'subject:"Contact Us" {from:admin@exleducation.com.au from:williamleong06@gmail.com}',
    maxResults: 50,
  })

  const messages = listRes.data.messages ?? []

  // Bulk dedup check
  const ids = messages.map(m => m.id!).filter(Boolean)
  const existing = await prisma.issue.findMany({
    where: { gmailMessageId: { in: ids } },
    select: { gmailMessageId: true },
  })
  const seen = new Set(existing.map(e => e.gmailMessageId))
  const newMessages = messages.filter(m => m.id && !seen.has(m.id))

  if (newMessages.length === 0) return 0

  // Fetch + process in parallel batches of 5
  const BATCH = 5
  let created = 0

  for (let i = 0; i < newMessages.length; i += BATCH) {
    const batch = newMessages.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (msg) => {
        const full    = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' })
        const payload = full.data.payload
        if (!payload) return

        const plainText   = extractPlainText(payload)
        const isFreeTrial = plainText.includes('Student Full Name') || plainText.includes('Free Trial')

        let contactName = 'Unknown'
        let note = ''

        if (isFreeTrial) {
          const f = parseFreeTrial(plainText)
          contactName = f['Student Full Name'] || f['Parent Full Name'] || 'Unknown'
          note = [
            f['Student Email']        && `Student Email: ${f['Student Email']}`,
            f['Student Mobile']       && `Student Mobile: ${f['Student Mobile']}`,
            f['School']               && `School: ${f['School']}`,
            (f['Year Level (2026)'] || f['Year Level (2025)']) &&
              `Year Level: ${f['Year Level (2026)'] || f['Year Level (2025)']}`,
            f['Parent Full Name']     && `Parent: ${f['Parent Full Name']}`,
            f['Parent Email']         && `Parent Email: ${f['Parent Email']}`,
            f['Parent Mobile']        && `Parent Mobile: ${f['Parent Mobile']}`,
            f['Subjects of Interest'] && `Subjects: ${f['Subjects of Interest']}`,
          ].filter(Boolean).join('\n')
        } else {
          const f = parseContactForm(plainText)
          contactName = f['Full Name'] || 'Unknown'
          note = [
            f['Email Address']      && `Email: ${f['Email Address']}`,
            f['Phone Number']       && `Phone: ${f['Phone Number']}`,
            f['Age']                && `Age: ${f['Age']}`,
            f['Course of Interest'] && `Course: ${f['Course of Interest']}`,
            f['Message']            && `\nMessage:\n${f['Message']}`,
          ].filter(Boolean).join('\n')
        }

        if (contactName === 'Unknown' && !note.trim()) return

        const issue = await prisma.issue.create({
          data: {
            type:           'FREE_TRIAL',
            priority:       'MEDIUM',
            contactName,
            note,
            source:         'gmail',
            gmailMessageId: msg.id!,
            resolved:       false,
          },
        })
        autoCreateStudent(note, issue.id)
        return 1
      })
    )
    created += results.filter(r => r.status === 'fulfilled' && r.value === 1).length
  }

  return created
}

// ── Scan admin@exleducation.com.au inbox for general communications ───────────

async function syncAdminInbox(token: { accessToken: string; refreshToken: string | null }) {
  const gmail = makeGmailClient(token)

  const since   = new Date(); since.setDate(since.getDate() - 60)
  const dateStr = `${since.getFullYear()}/${since.getMonth() + 1}/${since.getDate()}`

  const listRes = await gmail.users.messages.list({
    userId:     'me',
    q:          `in:inbox after:${dateStr} -subject:"Contact Us" -from:noreply -from:no-reply -from:notifications -from:emailjs -from:mailer-daemon`,
    maxResults: 20,
  })

  const messages = listRes.data.messages ?? []

  // Filter out already-processed messages in one DB query
  const ids = messages.map(m => m.id!).filter(Boolean)
  const existing = await prisma.issue.findMany({
    where: { gmailMessageId: { in: ids } },
    select: { gmailMessageId: true },
  })
  const seen = new Set(existing.map(e => e.gmailMessageId))
  const newMessages = messages.filter(m => m.id && !seen.has(m.id))

  if (newMessages.length === 0) return 0

  // Fetch full content in parallel (batches of 5)
  const BATCH = 5
  let created = 0

  for (let i = 0; i < newMessages.length; i += BATCH) {
    const batch = newMessages.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (msg) => {
        const full    = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' })
        const payload = full.data.payload
        if (!payload) return

        const subject   = getHeader(payload.headers, 'subject')
        const from      = getHeader(payload.headers, 'from')
        const plainText = extractPlainText(payload)
        if (!plainText.trim()) return

        let classification: Awaited<ReturnType<typeof classifyEmail>>
        try {
          classification = await classifyEmail(subject, from, plainText)
        } catch { return }
        if (!classification.isIssue || !classification.type) return

        const issue = await prisma.issue.create({
          data: {
            type:           classification.type,
            priority:       classification.priority ?? 'MEDIUM',
            contactName:    classification.contactName ?? from,
            note:           classification.summary ?? '',
            source:         'gmail',
            gmailMessageId: msg.id!,
            resolved:       false,
          },
        })

        if (plainText.length > 50) autoCreateStudent(plainText, issue.id)
        return 1
      })
    )
    created += results.filter(r => r.status === 'fulfilled' && r.value === 1).length
  }

  return created
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await prisma.oAuthToken.findUnique({ where: { provider: 'google' } })
  if (!token?.refreshToken) {
    return NextResponse.json(
      { error: 'Gmail not connected. Sign out and sign back in to grant Gmail access.' },
      { status: 400 },
    )
  }

  const results: Record<string, number> = {}

  // Booking forms (Contact Us subject)
  results.bookingForms = await syncBookingForms(token)

  // General comms forwarded from admin@exleducation.com.au — classified by LLM
  results.adminInbox = await syncAdminInbox(token)

  const created = Object.values(results).reduce((a, b) => a + b, 0)
  return NextResponse.json({ created, details: results })
}
