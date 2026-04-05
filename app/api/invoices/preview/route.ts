import { buildInvoiceEmailHtml } from '@/lib/invoice-email'

export async function POST(request: Request) {
  const body = await request.json()
  const { student, lineItems, subtotal, discount, total } = body

  const { subject, html, recipientEmail, parentName } = buildInvoiceEmailHtml({
    student,
    lineItems,
    subtotal,
    discount,
    total,
  })

  return Response.json({ subject, html, recipientEmail, parentName })
}
