import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const studentId = Number(id)
  const { sessionId } = await request.json() as { sessionId: number }

  const trial = await prisma.trialEnrolment.upsert({
    where: { studentId_sessionId: { studentId, sessionId } },
    create: { studentId, sessionId },
    update: {},
  })

  return Response.json(trial, { status: 201 })
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const studentId = Number(id)
  const { sessionId } = await request.json() as { sessionId: number }

  await prisma.trialEnrolment.deleteMany({
    where: { studentId, sessionId },
  })

  return new Response(null, { status: 204 })
}
