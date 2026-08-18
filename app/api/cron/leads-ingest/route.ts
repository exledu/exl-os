import { runLeadsIngest } from '@/lib/leads-ingest'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const url = new URL(request.url)
  const sinceDays = Math.max(1, Math.min(365, Number(url.searchParams.get('sinceDays') ?? '60')))
  try {
    const result = await runLeadsIngest(sinceDays)
    return Response.json({ ok: true, sinceDays, ...result })
  } catch (e) {
    console.error('Leads ingest failed:', e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
