import { auth } from '@/auth'
import { runLeadsIngest } from '@/lib/leads-ingest'

export const dynamic = 'force-dynamic'

// Manual re-ingest triggered from the /leads UI. Auth = logged-in admin session.
export async function POST(request: Request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const url = new URL(request.url)
  const sinceDays = Math.max(1, Math.min(365, Number(url.searchParams.get('sinceDays') ?? '30')))
  try {
    const result = await runLeadsIngest(sinceDays)
    return Response.json({ ok: true, sinceDays, ...result })
  } catch (e) {
    console.error('Manual leads ingest failed:', e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
