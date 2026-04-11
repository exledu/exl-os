import { google } from 'googleapis'
import { prisma } from '@/lib/db'
import { generateInvoicePdf } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const invoiceId = Number(id)

  // Read optional dueDate from request body
  let dueDate: string | null = null
  try {
    const body = await request.json()
    dueDate = body.dueDate ?? null
  } catch {
    // No body provided — that's fine
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      student: { include: { yearLevel: true } },
      lineItems: true,
    },
  })

  if (!invoice) {
    return Response.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const { subject, html: htmlBody, recipientEmail } = buildInvoiceEmailHtml({ ...invoice, dueDate })

  if (!recipientEmail) {
    return Response.json({ error: 'No email address found for student or parent' }, { status: 400 })
  }

  // Generate PDF
  const pdfBase64 = generateInvoicePdf({ ...invoice, dueDate })

  // Get OAuth tokens for sending
  const token = await prisma.oAuthToken.findUnique({ where: { provider: 'google' } })
  if (!token) {
    return Response.json({ error: 'Gmail not connected' }, { status: 400 })
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  )
  oauth2.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
  })

  // Refresh token if expired
  if (token.expiresAt && new Date() >= token.expiresAt) {
    const { credentials } = await oauth2.refreshAccessToken()
    oauth2.setCredentials(credentials)
    await prisma.oAuthToken.update({
      where: { provider: 'google' },
      data: {
        accessToken: credentials.access_token!,
        expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      },
    })
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2 })

  // Build MIME message with PDF attachment
  const boundary = 'invoice_boundary_' + Date.now()
  const mimeMessage = [
    `From: admin@exleducation.com.au`,
    `To: ${recipientEmail}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf; name="Invoice-${invoice.id}.pdf"`,
    `Content-Disposition: attachment; filename="Invoice-${invoice.id}.pdf"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfBase64,
    ``,
    `--${boundary}--`,
  ].join('\r\n')

  const encodedMessage = Buffer.from(mimeMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  })

  // Update invoice status
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'SENT', sentAt: new Date() },
    include: {
      student: { include: { yearLevel: true } },
      lineItems: true,
    },
  })

  return Response.json(updated)
}
