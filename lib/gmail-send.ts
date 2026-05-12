import { google } from 'googleapis'
import { prisma } from '@/lib/db'

interface SendEmailOpts {
  to: string
  subject: string
  html: string
  from?: string
  /** If set, this email becomes a reply within an existing Gmail thread. */
  threadId?: string
  /** Message-ID of the message we're replying to (without surrounding < >). */
  inReplyTo?: string
}

export interface SentEmail {
  /** Gmail's internal message id (NOT the RFC 5322 Message-ID). */
  id: string
  /** Gmail thread id — pass this back as threadId for subsequent replies. */
  threadId: string
  /** RFC 5322 Message-ID of the message we just sent (without < >). */
  messageId: string
}

/**
 * Sends an HTML email via Gmail using the stored OAuth token.
 * Throws if Gmail is not connected. Refreshes the access token if needed.
 *
 * To start a thread, omit threadId/inReplyTo and capture the returned
 * { threadId, messageId } from this call. To reply within that thread,
 * pass both threadId and inReplyTo on the next call (and use the same
 * recipient + a subject that matches or is prefixed with "Re: ").
 */
export async function sendGmailEmail({
  to, subject, html, from = 'admin@exleducation.com.au', threadId, inReplyTo,
}: SendEmailOpts): Promise<SentEmail> {
  const token = await prisma.oAuthToken.findUnique({ where: { provider: 'google' } })
  if (!token) throw new Error('Gmail not connected')

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  )
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

  const gmail = google.gmail({ version: 'v1', auth: oauth2 })

  // Subject must be ASCII; encode non-ASCII as RFC 2047 encoded-word (base64).
  const encodeHeader = (s: string) =>
    /^[\x20-\x7E]*$/.test(s)
      ? s
      : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`

  // Body is base64 so any UTF-8 bytes survive intact.
  const bodyBase64 = Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')

  // Generate a Message-ID we can later reference for threading.
  const localPart = `exl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const domain    = (from.split('@')[1] ?? 'exleducation.com.au').trim()
  const messageId = `${localPart}@${domain}`

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: <${messageId}>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
  ]
  if (inReplyTo) {
    headers.push(`In-Reply-To: <${inReplyTo}>`)
    headers.push(`References: <${inReplyTo}>`)
  }

  const mime = [...headers, ``, bodyBase64].join('\r\n')

  const encoded = Buffer.from(mime, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: threadId ? { raw: encoded, threadId } : { raw: encoded },
  })

  return {
    id:        res.data.id!,
    threadId:  res.data.threadId!,
    messageId,
  }
}
