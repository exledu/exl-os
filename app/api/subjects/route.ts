import { prisma } from '@/lib/db'

export async function GET() {
  const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } })
  return Response.json(subjects, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
