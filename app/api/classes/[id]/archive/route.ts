import { prisma } from '@/lib/db'
import { startOfDay } from 'date-fns'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const classId = Number(id)
  const { archived } = await request.json() as { archived: boolean }

  const cls = await prisma.class.update({
    where: { id: classId },
    data: { archived },
  })

  // When archiving, delete all future (>= today) sessions for the class
  if (archived) {
    await prisma.classSession.deleteMany({
      where: {
        classId,
        date: { gte: startOfDay(new Date()) },
      },
    })
  }

  return Response.json(cls)
}
