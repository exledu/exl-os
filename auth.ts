import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { prisma } from '@/lib/db'

// Comma-separated list of allowed emails in env, plus ADMIN_EMAIL always allowed
function getAllowedEmails(): string[] {
  const emails: string[] = []
  if (process.env.ADMIN_EMAIL) emails.push(process.env.ADMIN_EMAIL)
  if (process.env.ALLOWED_EMAILS) {
    emails.push(...process.env.ALLOWED_EMAILS.split(',').map(e => e.trim()).filter(Boolean))
  }
  return emails.map(e => e.toLowerCase())
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const allowed = getAllowedEmails()
      if (allowed.length === 0) return false
      if (!user.email || !allowed.includes(user.email.toLowerCase())) return false

      // Store Gmail tokens only for the admin account (used for Gmail sync)
      const adminEmail = process.env.ADMIN_EMAIL
      if (account?.access_token && user.email === adminEmail) {
        await prisma.oAuthToken.upsert({
          where: { provider: 'google' },
          update: {
            accessToken:  account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt:    account.expires_at ? new Date(account.expires_at * 1000) : null,
          },
          create: {
            provider:     'google',
            accessToken:  account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt:    account.expires_at ? new Date(account.expires_at * 1000) : null,
          },
        })
      }

      return true
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
})
