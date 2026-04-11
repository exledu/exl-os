import { prisma } from '@/lib/db'

export async function GET() {
  const invoices = await prisma.invoice.findMany({
    include: {
      student: { include: { yearLevel: true } },
      lineItems: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json(invoices)
}

export async function POST(request: Request) {
  const body = await request.json()
  const { studentId, lineItems, discount, year, term } = body as {
    studentId: number
    lineItems: { description: string; sessions: number; unitPrice: number; amount: number; proRata: boolean }[]
    discount: number
    year?: number
    term?: number
  }

  const subtotal = lineItems.reduce((sum: number, li: { amount: number }) => sum + li.amount, 0)
  const total = Math.max(0, subtotal - (discount || 0))

  const invoice = await prisma.invoice.create({
    data: {
      studentId,
      year: year ?? null,
      term: term ?? null,
      subtotal,
      discount: discount || 0,
      total,
      lineItems: {
        create: lineItems.map(li => ({
          description: li.description,
          sessions: li.sessions,
          unitPrice: li.unitPrice,
          amount: li.amount,
          proRata: li.proRata,
        })),
      },
    },
    include: {
      student: { include: { yearLevel: true } },
      lineItems: true,
    },
  })

  return Response.json(invoice, { status: 201 })
}
