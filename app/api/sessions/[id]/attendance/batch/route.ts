import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Batch upsert attendance rows for one session in a single transaction. The
 * client collects all pending Y/N/HW clicks locally and posts them in one hit.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const sessionId = Number(id)
  const body = await request.json() as {
    updates: {
      studentId:      number
      present?:       boolean
      notifiedAbsent?: boolean
      homework?:      'UNATTEMPTED' | 'INCOMPLETE' | 'SATISFACTORY' | 'EXCELLENT' | null
    }[]
  }
  if (!Array.isArray(body.updates)) {
    return Response.json({ error: 'updates array required' }, { status: 400 })
  }

  await prisma.$transaction(body.updates.map(u => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = {}
    if (typeof u.present === 'boolean')        update.present        = u.present
    if (typeof u.notifiedAbsent === 'boolean') update.notifiedAbsent = u.notifiedAbsent
    if ('homework' in u)                       update.homework       = u.homework

    return prisma.attendance.upsert({
      where:  { sessionId_studentId: { sessionId, studentId: u.studentId } },
      create: {
        sessionId, studentId: u.studentId,
        present:        u.present        ?? false,
        notifiedAbsent: u.notifiedAbsent ?? false,
        homework:       u.homework       ?? null,
      },
      update,
    })
  }))

  return Response.json({ ok: true, count: body.updates.length })
}
