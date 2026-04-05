/**
 * One-time migration: convert existing Issue.rawEmail and Issue.note
 * into IssueNote entries for the conversation chain.
 *
 * Run with: npx tsx scripts/migrate-issue-notes.ts
 */
import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const issues = await prisma.issue.findMany({
    include: { notes: true },
  })

  let created = 0

  for (const issue of issues) {
    // Skip if notes already exist (already migrated)
    if (issue.notes.length > 0) continue

    // 1. rawEmail → first IssueNote (the verbatim email content)
    if (issue.rawEmail) {
      await prisma.issueNote.create({
        data: {
          issueId: issue.id,
          author: issue.contactName,
          content: issue.rawEmail,
          isEmail: true,
          createdAt: issue.createdAt,
        },
      })
      created++
    }

    // 2. note → second IssueNote (the LLM summary / manual note)
    //    Only if it's different from rawEmail (avoid duplication)
    if (issue.note && issue.note !== issue.rawEmail) {
      await prisma.issueNote.create({
        data: {
          issueId: issue.id,
          author: issue.source === 'gmail' ? 'System' : 'Admin',
          content: issue.note,
          isEmail: false,
          createdAt: new Date(issue.createdAt.getTime() + 1000), // 1s after original
        },
      })
      created++
    }

    // 3. resolutionNote → IssueNote from Admin
    if (issue.resolutionNote) {
      await prisma.issueNote.create({
        data: {
          issueId: issue.id,
          author: 'Admin',
          content: issue.resolutionNote,
          isEmail: false,
          createdAt: new Date(issue.createdAt.getTime() + 2000),
        },
      })
      created++
    }
  }

  console.log(`Migration complete. Created ${created} IssueNote entries from ${issues.length} issues.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
