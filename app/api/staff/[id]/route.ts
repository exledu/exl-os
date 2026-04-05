import { prisma } from '@/lib/db'

export async function GET(_req: Request, ctx: RouteContext<'/api/staff/[id]'>) {
  const { id } = await ctx.params
  const member = await prisma.staff.findUnique({
    where: { id: Number(id) },
    include: {
      classes: {
        include: { subject: true, yearLevel: true },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { classes: true } },
    },
  })
  if (!member) return new Response('Not found', { status: 404 })
  return Response.json(member)
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/staff/[id]'>) {
  const { id } = await ctx.params
  const body = await request.json()
  const member = await prisma.staff.update({
    where: { id: Number(id) },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone || null }),
      ...(body.roles !== undefined && { roles: body.roles }),
    },
  })
  return Response.json(member)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/staff/[id]'>) {
  const { id } = await ctx.params
  await prisma.staff.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
