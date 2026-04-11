interface EmailLineItem {
  description: string
  sessions: number
  amount: number
  proRata: boolean
}

interface EmailInvoiceData {
  id?: number
  year?: number | null
  term?: number | null
  dueDate?: string | null
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
  const parentFirstName = invoice.student.parentFirstName || invoice.student.name
  const parentName = invoice.student.parentFirstName
    ? `${invoice.student.parentFirstName}${invoice.student.parentLastName ? ' ' + invoice.student.parentLastName : ''}`
    : studentName
  const recipientEmail = invoice.student.parentEmail || invoice.student.email

  const year = invoice.year ?? new Date().getFullYear()
  const term = invoice.term ?? 1
  const invoiceNo = invoice.id ? String(invoice.id).padStart(4, '0') : '0000'
  const dueDateLong = invoice.dueDate
    ? new Date(invoice.dueDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const dueDateShort = invoice.dueDate
    ? new Date(invoice.dueDate + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const subject = `${year} Term ${term} Invoice ${invoiceNo} from EXL Education for ${studentName}`
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #002F67; padding: 24px; border-radius: 8px 8px 0 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="vertical-align: top;">
          <h1 style="color: white; margin: 0; font-size: 22px;">EXL Education</h1>
          <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 13px;">INVOICE NO. ${invoiceNo}</p>
        </td>
        ${dueDateShort ? `<td style="vertical-align: top; text-align: right;">
          <p style="color: white; margin: 0; font-size: 18px; font-weight: 700;">DUE ${dueDateShort}</p>
        </td>` : ''}
      </tr>
    </table>
  </div>
  <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear ${parentFirstName},</p>
    <p style="margin-top: 16px;">We hope this message finds you well.</p>
    <p style="margin-top: 16px;">Please find the invoice of <strong>$${invoice.total.toFixed(2)}</strong> for <strong>${studentName}</strong>'s ${year} Term ${term} tuition attached.</p>
    <p style="margin-top: 16px;">We accept payment through Cash on campus or Bank Transfer:</p>
    <table style="margin: 16px 0; border-collapse: collapse;">
      <tr>
        <td style="padding: 4px 16px 4px 0; color: #6b7280;">Account Name</td>
        <td style="padding: 4px 0; font-weight: 600;">EXL Education</td>
      </tr>
      <tr>
        <td style="padding: 4px 16px 4px 0; color: #6b7280;">BSB</td>
        <td style="padding: 4px 0; font-weight: 600;">067-873</td>
      </tr>
      <tr>
        <td style="padding: 4px 16px 4px 0; color: #6b7280;">Account Number</td>
        <td style="padding: 4px 0; font-weight: 600;">1219 8062</td>
      </tr>
    </table>
    <p>We also request that a screenshot of payment is emailed to <a href="mailto:admin@exleducation.com.au" style="color: #002F67;">admin@exleducation.com.au</a> as bank transfer can take several days to process.</p>
    <p style="margin-top: 16px;">We kindly ask you to make the payment${dueDateLong ? ` by <strong>${dueDateLong}</strong>` : ' at your earliest convenience'}. If you have any questions or need assistance, feel free to reach out.</p>
    <p style="margin-top: 24px;">
      Kind regards,<br/>
      <strong>EXL Education Admin Team</strong>
    </p>
  </div>
</div>`

  return { subject, html, recipientEmail, parentName }
}
