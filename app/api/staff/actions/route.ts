import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const staffId = url.searchParams.get('staffId')

  const actions = await prisma.staffAction.findMany({
    where: staffId ? { staffId: Number(staffId) } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { staff: { select: { name: true } } },
  })

  return Response.json(actions)
}
