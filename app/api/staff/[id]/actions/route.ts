import { prisma } from '@/lib/db'

export async function GET(request: Request, ctx: RouteContext<'/api/staff/[id]/actions'>) {
  const { id } = await ctx.params
  const staffId = Number(id)

  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const limit = Number(url.searchParams.get('limit')) || 50

  const actions = await prisma.staffAction.findMany({
    where: {
      staffId,
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { staff: { select: { name: true } } },
  })

  return Response.json(actions)
}

export async function POST(request: Request, ctx: RouteContext<'/api/staff/[id]/actions'>) {
  const { id } = await ctx.params
  const staffId = Number(id)
  const body = await request.json()

  const allowedTypes = ['booklet_work', 'student_message', 'online_class']
  if (!allowedTypes.includes(body.type)) {
    return new Response(`Invalid type. Must be one of: ${allowedTypes.join(', ')}`, { status: 400 })
  }

  if (!body.description) {
    return new Response('description is required', { status: 400 })
  }

  const action = await prisma.staffAction.create({
    data: {
      staffId,
      type: body.type,
      automatic: false,
      description: body.description,
      value: body.value ?? null,
    },
  })

  return Response.json(action, { status: 201 })
}
