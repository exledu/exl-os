import { prisma } from '@/lib/db'

export async function GET() {
  const yearLevels = await prisma.yearLevel.findMany({ orderBy: { level: 'asc' } })
  return Response.json(yearLevels, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
