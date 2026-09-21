import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { TermsEmpty } from '@/components/terms/TermsEmpty'

export const dynamic = 'force-dynamic'

/**
 * Land on the current term's grid — the term that contains today, else the
 * most-recently-started term, else an empty state prompting the admin to
 * create the first one.
 */
export default async function TermsPage() {
  const terms = await prisma.term.findMany({
    orderBy: { startDate: 'asc' },
    select: { id: true, startDate: true, weeks: true },
  })
  if (terms.length === 0) {
    return <TermsEmpty />
  }
  const now = new Date()
  const nowMs = now.getTime()
  // Pick the term that contains today.
  const containing = terms.find(t => {
    const start = t.startDate.getTime()
    const end   = start + t.weeks * 7 * 86_400_000
    return nowMs >= start && nowMs < end
  })
  if (containing) redirect(`/terms/${containing.id}`)
  // Else the most-recently-started term.
  const latest = terms.reduce((a, b) => a.startDate > b.startDate ? a : b)
  redirect(`/terms/${latest.id}`)
}
