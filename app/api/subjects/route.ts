import { prisma } from '@/lib/db'

export async function GET() {
  const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } })
  return Response.json(subjects)
}
