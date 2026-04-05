import { google } from 'googleapis'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const base  = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  if (error || !code) {
    return NextResponse.redirect(new URL('/dashboard?error=admin_email_failed', base))
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    `${base}/api/gmail/callback`,
  )

  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  // Identify which account authorised (so we store it correctly)
  const oauth2    = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data }  = await oauth2.userinfo.get()
  const provider  = `gmail-${data.email}`

  await prisma.oAuthToken.upsert({
    where:  { provider },
    update: {
      accessToken:  tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt:    tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    create: {
      provider,
      accessToken:  tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt:    tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  })

  return NextResponse.redirect(new URL('/dashboard?admin_email=connected', base))
}
