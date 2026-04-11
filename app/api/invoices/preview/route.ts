import { prisma } from '@/lib/db'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'

export async function POST(request: Request) {
  const body = await request.json()
  const { student, lineItems, subtotal, discount, total, year, term, dueDate } = body

  // Peek at the next invoice ID from the database sequence
  const result = await prisma.$queryRawUnsafe<{ val: bigint }[]>(
    `SELECT last_value + 1 as val FROM "Invoice_id_seq"`
  )
  const nextId = Number(result[0].val)

  const { subject, html, recipientEmail, parentName } = buildInvoiceEmailHtml({
    id: nextId,
    student,
    lineItems,
    subtotal,
    discount,
    total,
    year,
    term,
    dueDate,
  })

  return Response.json({ subject, html, recipientEmail, parentName })
}
