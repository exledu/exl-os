import { prisma } from '@/lib/db'

export async function GET() {
  const issues = await prisma.issue.findMany({
    where: { resolved: false },
    include: {
      student: true,
      notes: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
  })
  return Response.json(issues)
}

export async function POST(request: Request) {
  const body = await request.json()
  const issue = await prisma.issue.create({
    data: {
      type: body.type,
      priority: body.priority ?? 'MEDIUM',
      contactName: body.contactName,
      studentId: body.studentId ? Number(body.studentId) : null,
      assignedTo: body.assignedTo ?? null,
      note: body.note ?? null,
      source: body.source ?? 'manual',
      rawEmail: body.rawEmail ?? null,
    },
    include: { student: true, notes: true },
  })
  return Response.json(issue, { status: 201 })
}
