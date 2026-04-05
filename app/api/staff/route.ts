import { prisma } from '@/lib/db'

export async function GET() {
  const staff = await prisma.staff.findMany({
    include: {
      _count: { select: { classes: true } },
      classes: {
        select: { _count: { select: { enrolments: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Compute avgStudentsPerClass for each staff member
  const result = staff.map(s => {
    const totalStudents = s.classes.reduce((sum, c) => sum + c._count.enrolments, 0)
    const avgStudents = s.classes.length > 0
      ? Math.round((totalStudents / s.classes.length) * 10) / 10
      : 0
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      roles: s.roles,
      _count: s._count,
      avgStudentsPerClass: avgStudents,
      totalStudents,
    }
  })

  return Response.json(result)
}

export async function POST(request: Request) {
  const body = await request.json()
  const member = await prisma.staff.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      roles: body.roles ?? ['tutor'],
    },
  })
  return Response.json(member, { status: 201 })
}
