import { google } from 'googleapis'
import { prisma } from '@/lib/db'

interface SendEmailOpts {
  to: string
  subject: string
  html: string
  from?: string
}

/**
 * Sends an HTML email via Gmail using the stored OAuth token.
 * Throws if Gmail is not connected. Refreshes the access token if needed.
 */
export async function sendGmailEmail({ to, subject, html, from = 'admin@exleducation.com.au' }: SendEmailOpts) {
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

  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyBase64,
  ].join('\r\n')

  const encoded = Buffer.from(mime, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })
}
