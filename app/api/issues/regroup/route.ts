/**
 * One-time backfill: fetch Gmail threadIds for existing unresolved issues,
 * then merge duplicate issues in the same thread into a single issue with notes.
 *
 * Hit with: GET /api/issues/regroup (must be logged in)
 */

import { google } from 'googleapis'
import { prisma } from '@/lib/db'

export const maxDuration = 60

function makeGmailClient(tokenRecord: { accessToken: string; refreshToken: string | null }) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  )
  oauth2Client.setCredentials({
    access_token: tokenRecord.accessToken,
    refresh_token: tokenRecord.refreshToken ?? undefined,
  })
  // Persist refreshed access tokens
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.access_token) {
      prisma.oAuthToken.updateMany({
        where: { accessToken: tokenRecord.accessToken },
        data: {
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      }).catch(() => {})
    }
  })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

export async function GET() {
  const log: string[] = []

  // ── Phase 1: backfill threadIds ──────────────────────────────────────────
  const token = await prisma.oAuthToken.findUnique({ where: { provider: 'google' } })
  if (!token) return new Response('Gmail not connected', { status: 400 })
  const gmail = makeGmailClient(token)

  const issuesNeedingThread = await prisma.issue.findMany({
    where: {
      resolved: false,
      gmailMessageId: { not: null },
      gmailThreadId: null,
    },
    select: { id: true, gmailMessageId: true },
  })
  log.push(`Phase 1: backfilling threadId for ${issuesNeedingThread.length} issues`)

  for (const i of issuesNeedingThread) {
    try {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: i.gmailMessageId!,
        format: 'minimal',
      })
      const threadId = full.data.threadId
      if (threadId) {
        await prisma.issue.update({
          where: { id: i.id },
          data: { gmailThreadId: threadId },
        })
        log.push(`  [ok] Issue #${i.id} → thread ${threadId.slice(0, 12)}`)
      } else {
        log.push(`  [skip] Issue #${i.id} — no threadId returned`)
      }
    } catch (err) {
      log.push(`  [fail] Issue #${i.id}: ${(err as Error).message}`)
    }
  }

  // ── Phase 2: merge duplicates ────────────────────────────────────────────
  const groups = await prisma.issue.groupBy({
    by: ['gmailThreadId'],
    where: { resolved: false, gmailThreadId: { not: null } },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  })

  log.push(`\nPhase 2: ${groups.length} threads have duplicate issues`)

  let merged = 0
  for (const g of groups) {
    const threadIssues = await prisma.issue.findMany({
      where: { resolved: false, gmailThreadId: g.gmailThreadId },
      include: { notes: true },
      orderBy: { createdAt: 'asc' },
    })

    const [primary, ...duplicates] = threadIssues
    log.push(`  Thread ${g.gmailThreadId?.slice(0, 12)}: keep #${primary.id}, merge ${duplicates.length}`)

    for (const dup of duplicates) {
      // Move dup's primary content as a note on primary
      if (dup.note?.trim()) {
        await prisma.issueNote.create({
          data: {
            issueId:        primary.id,
            author:         dup.contactName,
            content:        dup.note,
            isEmail:        true,
            gmailMessageId: dup.gmailMessageId,
            createdAt:      dup.createdAt,
          },
        })
      }

      // Move dup's existing notes to primary
      for (const note of dup.notes) {
        await prisma.issueNote.create({
          data: {
            issueId:   primary.id,
            author:    note.author,
            content:   note.content,
            isEmail:   note.isEmail,
            createdAt: note.createdAt,
          },
        })
      }

      // Delete the duplicate (cascades to its notes)
      await prisma.issue.delete({ where: { id: dup.id } })
      merged++
    }
  }

  log.push(`\nDone. Merged ${merged} duplicate issues.`)
  return new Response(log.join('\n'), { headers: { 'Content-Type': 'text/plain' } })
}
