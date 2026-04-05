interface EmailLineItem {
  description: string
  sessions: number
  amount: number
  proRata: boolean
}

interface EmailInvoiceData {
  student: {
    name: string
    lastName: string | null
    parentFirstName: string | null
    parentLastName: string | null
    parentEmail: string | null
    email: string | null
  }
  lineItems: EmailLineItem[]
  subtotal: number
  discount: number
  total: number
}

export function buildInvoiceEmailHtml(invoice: EmailInvoiceData): { subject: string; html: string; recipientEmail: string | null; parentName: string } {
  const studentName = `${invoice.student.name}${invoice.student.lastName ? ' ' + invoice.student.lastName : ''}`
  const parentName = invoice.student.parentFirstName
    ? `${invoice.student.parentFirstName}${invoice.student.parentLastName ? ' ' + invoice.student.parentLastName : ''}`
    : studentName
  const recipientEmail = invoice.student.parentEmail || invoice.student.email

  const subject = `EXL Education — Invoice for ${studentName}`
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #002F67; padding: 24px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px;">EXL Education</h1>
    <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 13px;">Tutoring Centre</p>
  </div>
  <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hi ${parentName},</p>
    <p>Please find attached the invoice for <strong>${studentName}</strong>'s upcoming tutoring sessions at EXL Education.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr style="border-bottom: 2px solid #002F67;">
        <th style="text-align: left; padding: 8px; color: #002F67;">Description</th>
        <th style="text-align: center; padding: 8px; color: #002F67;">Sessions</th>
        <th style="text-align: right; padding: 8px; color: #002F67;">Amount</th>
      </tr>
      ${invoice.lineItems.map(li => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px;">${li.description}</td>
        <td style="text-align: center; padding: 8px;">${li.sessions}</td>
        <td style="text-align: right; padding: 8px;">$${li.amount.toFixed(2)}</td>
      </tr>`).join('')}
      <tr>
        <td colspan="2" style="text-align: right; padding: 8px; font-weight: 600;">Subtotal</td>
        <td style="text-align: right; padding: 8px;">$${invoice.subtotal.toFixed(2)}</td>
      </tr>
      ${invoice.discount > 0 ? `
      <tr>
        <td colspan="2" style="text-align: right; padding: 8px; color: #16a34a; font-weight: 600;">Discount</td>
        <td style="text-align: right; padding: 8px; color: #16a34a;">-$${invoice.discount.toFixed(2)}</td>
      </tr>` : ''}
      <tr style="border-top: 2px solid #002F67;">
        <td colspan="2" style="text-align: right; padding: 8px; font-weight: 700; font-size: 16px; color: #002F67;">Total</td>
        <td style="text-align: right; padding: 8px; font-weight: 700; font-size: 16px; color: #002F67;">$${invoice.total.toFixed(2)}</td>
      </tr>
    </table>
    <p>If you have any questions, please don't hesitate to reach out.</p>
    <p style="margin-top: 24px;">
      Kind regards,<br/>
      <strong>EXL Education</strong><br/>
      <a href="mailto:admin@exleducation.com.au" style="color: #002F67;">admin@exleducation.com.au</a>
    </p>
  </div>
</div>`

  return { subject, html, recipientEmail, parentName }
}
