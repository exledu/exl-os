import { prisma } from '@/lib/db'

export async function GET() {
  const yearLevels = await prisma.yearLevel.findMany({ orderBy: { level: 'asc' } })
  return Response.json(yearLevels)
}
