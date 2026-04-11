import { prisma } from '@/lib/db'

export async function GET() {
  const [students, invoices] = await Promise.all([
    prisma.student.findMany({
      where: { enrolments: { some: {} } },
      include: { yearLevel: true },
      orderBy: [{ lastName: 'asc' }, { name: 'asc' }],
    }),
    prisma.invoice.findMany({
      where: {
        year: { not: null },
        term: { not: null },
      },
      select: {
        id: true,
        studentId: true,
        year: true,
        term: true,
        status: true,
        total: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return Response.json({ students, invoices })
}
