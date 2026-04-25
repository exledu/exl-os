import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const { archived } = await request.json() as { archived: boolean }

  const cls = await prisma.class.update({
    where: { id: Number(id) },
    data: { archived },
  })

  return Response.json(cls)
}
