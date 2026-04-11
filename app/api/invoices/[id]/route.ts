import { prisma } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const invoiceId = Number(id)

  const body = await request.json()
  const { status } = body as { status: string }

  if (status !== 'PAID' && status !== 'VOID') {
    return Response.json({ error: 'Only PAID and VOID status transitions are supported' }, { status: 400 })
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })

  if (!invoice) {
    return Response.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // PAID: only from SENT
  if (status === 'PAID' && invoice.status !== 'SENT') {
    return Response.json(
      { error: `Cannot mark as PAID: invoice is currently ${invoice.status}` },
      { status: 400 }
    )
  }

  // VOID: from SENT or DRAFT (not from PAID or already VOID)
  if (status === 'VOID' && invoice.status !== 'SENT' && invoice.status !== 'DRAFT') {
    return Response.json(
      { error: `Cannot void: invoice is currently ${invoice.status}` },
      { status: 400 }
    )
  }

  const data = status === 'PAID'
    ? { status: 'PAID' as const, paidAt: new Date() }
    : { status: 'VOID' as const }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data,
    include: {
      student: { include: { yearLevel: true } },
      lineItems: true,
    },
  })

  return Response.json(updated)
}
