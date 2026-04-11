import { prisma } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const invoiceId = Number(id)

  const body = await request.json()
  const { status } = body as { status: string }

  const ALLOWED = ['PAID', 'SENT', 'VOID'] as const
  if (!ALLOWED.includes(status as typeof ALLOWED[number])) {
    return Response.json({ error: 'Invalid status transition' }, { status: 400 })
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })

  if (!invoice) {
    return Response.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Allowed transitions:
  // SENT → PAID, PAID → SENT (unpay), SENT → VOID, DRAFT → VOID
  const transitions: Record<string, string[]> = {
    PAID: ['SENT'],          // can mark as paid from SENT
    SENT: ['PAID'],          // can unpay back to SENT from PAID
    VOID: ['SENT', 'DRAFT'], // can void from SENT or DRAFT
  }

  const allowed = transitions[status] ?? []
  if (!allowed.includes(invoice.status)) {
    return Response.json(
      { error: `Cannot change from ${invoice.status} to ${status}` },
      { status: 400 }
    )
  }

  // Build update data
  let data: Record<string, unknown>
  if (status === 'PAID') {
    data = { status: 'PAID', paidAt: new Date() }
  } else if (status === 'SENT') {
    data = { status: 'SENT', paidAt: null }
  } else {
    data = { status: 'VOID' }
  }

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
