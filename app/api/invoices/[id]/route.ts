import { prisma } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const invoiceId = Number(id)

  const body = await request.json()
  const { status } = body as { status: string }

  if (status !== 'PAID') {
    return Response.json({ error: 'Only marking as PAID is supported' }, { status: 400 })
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })

  if (!invoice) {
    return Response.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (invoice.status !== 'SENT') {
    return Response.json(
      { error: `Cannot mark as PAID: invoice is currently ${invoice.status}` },
      { status: 400 }
    )
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'PAID', paidAt: new Date() },
    include: {
      student: { include: { yearLevel: true } },
      lineItems: true,
    },
  })

  return Response.json(updated)
}
