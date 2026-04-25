import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const archived = searchParams.get('archived') === 'true'

  const students = await prisma.student.findMany({
    where: { archived },
    include: { yearLevel: true, _count: { select: { enrolments: true } } },
    orderBy: [{ lastName: 'asc' }, { name: 'asc' }],
  })
  return Response.json(students)
}

export async function POST(request: Request) {
  const body = await request.json()
  const student = await prisma.student.create({
    data: {
      name:            body.name,
      lastName:        body.lastName ?? null,
      email:           body.email ?? null,
      phone:           body.phone ?? null,
      school:          body.school ?? null,
      yearLevelId:     Number(body.yearLevelId),
      parentFirstName: body.parentFirstName ?? null,
      parentLastName:  body.parentLastName ?? null,
      parentEmail:     body.parentEmail ?? null,
      parentPhone:     body.parentPhone ?? null,
    },
    include: { yearLevel: true },
  })
  return Response.json(student, { status: 201 })
}
