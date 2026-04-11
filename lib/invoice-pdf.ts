import { format } from 'date-fns'

interface LineItem {
  description: string
  sessions: number
  unitPrice: number
  amount: number
  proRata: boolean
}

interface InvoiceData {
  id: number
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
    yearLevel: { level: number }
  }
  lineItems: LineItem[]
  subtotal: number
  discount: number
  total: number
  createdAt: Date | string
}

// ── Minimal PDF builder ──────────────────────────────────────────────────────
// Generates a valid PDF 1.4 document with text and rectangles, no external deps.

class PdfBuilder {
  private objects: string[] = []
  private pages: number[] = []
  private currentStream = ''
  private objectCount = 0
  private font1Obj: number
  private font2Obj: number

  constructor() {
    // Reserve font objects FIRST so pages can reference them by known IDs
    this.font1Obj = this.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    this.font2Obj = this.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  }

  private addObject(content: string): number {
    this.objectCount++
    this.objects.push(content)
    return this.objectCount
  }

  // Escape special PDF chars in text
  private esc(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  }

  // Add text at position (y is from top, internally converted to bottom-up)
  text(x: number, y: number, text: string, size: number, bold = false, r = 0, g = 0, b = 0) {
    const font = bold ? '/F2' : '/F1'
    const py = 842 - y // A4 height = 842 points
    this.currentStream += `BT ${font} ${size} Tf ${r / 255} ${g / 255} ${b / 255} rg ${x} ${py} Td (${this.esc(text)}) Tj ET\n`
  }

  // Right-aligned text
  textRight(x: number, y: number, text: string, size: number, bold = false, r = 0, g = 0, b = 0) {
    const width = text.length * size * 0.5 // approximate
    this.text(x - width, y, text, size, bold, r, g, b)
  }

  // Filled rectangle
  rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number) {
    const py = 842 - y - h
    this.currentStream += `${r / 255} ${g / 255} ${b / 255} rg ${x} ${py} ${w} ${h} re f\n`
  }

  // Line
  line(x1: number, y1: number, x2: number, y2: number, r = 200, g = 200, b = 200) {
    const py1 = 842 - y1
    const py2 = 842 - y2
    this.currentStream += `${r / 255} ${g / 255} ${b / 255} RG 0.5 w ${x1} ${py1} m ${x2} ${py2} l S\n`
  }

  finishPage() {
    // Stream object
    const streamObj = this.addObject(
      `<< /Length ${this.currentStream.length} >>\nstream\n${this.currentStream}endstream`
    )
    // Page object — reference the actual font object IDs
    const pageObj = this.addObject(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 595 842] /Contents ${streamObj} 0 R /Resources << /Font << /F1 ${this.font1Obj} 0 R /F2 ${this.font2Obj} 0 R >> >> >>`
    )
    this.pages.push(pageObj)
    this.currentStream = ''
  }

  build(): Buffer {
    this.finishPage()

    // Catalog and Pages are appended after all page/stream/font objects
    const catalogObj = this.objectCount + 1
    const pagesObj = this.objectCount + 2
    const totalObjects = this.objectCount + 2

    const kids = this.pages.map(p => `${p} 0 R`).join(' ')

    // Build final PDF
    let pdf = '%PDF-1.4\n'
    const finalOffsets: number[] = []
    for (let i = 0; i < this.objects.length; i++) {
      finalOffsets.push(pdf.length)
      // Replace the parent placeholder with the actual Pages object reference
      const obj = this.objects[i].replace('PAGES_REF', `${pagesObj} 0 R`)
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
    }
    finalOffsets.push(pdf.length)
    pdf += `${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj\n`
    finalOffsets.push(pdf.length)
    pdf += `${pagesObj} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>\nendobj\n`

    // Cross-reference table
    const xrefOffset = pdf.length
    pdf += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`
    for (const off of finalOffsets) {
      pdf += `${String(off).padStart(10, '0')} 00000 n \n`
    }

    // Trailer
    pdf += `trailer\n<< /Size ${totalObjects + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

    return Buffer.from(pdf, 'binary')
  }
}

// ── Word-wrap helper ─────────────────────────────────────────────────────────
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current && (current.length + 1 + word.length) > maxChars) {
      lines.push(current)
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}

export function generateInvoicePdf(invoice: InvoiceData): string {
  const pdf = new PdfBuilder()
  const margin = 50
  const pageWidth = 595
  const rightEdge = pageWidth - margin
  let y = 0

  const invoiceNo = String(invoice.id).padStart(4, '0')
  const year = invoice.year ?? new Date().getFullYear()
  const term = invoice.term ?? 1

  // ── Header bar ──
  pdf.rect(0, 0, pageWidth, 70, 0, 47, 103)
  pdf.text(margin, 25, 'EXL Education', 20, true, 255, 255, 255)
  pdf.text(margin, 45, `INVOICE NO. ${invoiceNo}`, 9, false, 180, 210, 255)

  // Due date on right side of header
  if (invoice.dueDate) {
    const dueDateShort = new Date(invoice.dueDate + 'T00:00:00').toLocaleDateString('en-AU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
    pdf.textRight(rightEdge, 30, `DUE ${dueDateShort}`, 14, true, 255, 255, 255)
  }

  pdf.textRight(rightEdge, 50, 'admin@exleducation.com.au', 8, false, 200, 220, 255)

  y = 95

  // ── Invoice title + meta ──
  pdf.text(margin, y, 'INVOICE', 18, true, 0, 47, 103)
  const dateStr = format(new Date(invoice.createdAt), 'dd MMM yyyy')
  pdf.textRight(rightEdge, y - 5, `Invoice #${invoiceNo}`, 10, false, 100, 100, 100)
  pdf.textRight(rightEdge, y + 10, `Date: ${dateStr}`, 10, false, 100, 100, 100)
  pdf.textRight(rightEdge, y + 25, `Term: ${year} T${term}`, 10, false, 100, 100, 100)

  y += 50

  // ── Bill To ──
  pdf.text(margin, y, 'Bill To:', 11, true, 0, 47, 103)
  y += 18

  const studentName = `${invoice.student.name}${invoice.student.lastName ? ' ' + invoice.student.lastName : ''}`
  const parentName = invoice.student.parentFirstName
    ? `${invoice.student.parentFirstName}${invoice.student.parentLastName ? ' ' + invoice.student.parentLastName : ''}`
    : null

  if (parentName) {
    pdf.text(margin, y, parentName, 10, false, 50, 50, 50)
    y += 16
  }
  pdf.text(margin, y, `Student: ${studentName} (Year ${invoice.student.yearLevel.level})`, 10, false, 50, 50, 50)
  y += 16
  const email = invoice.student.parentEmail || invoice.student.email
  if (email) {
    pdf.text(margin, y, email, 10, false, 50, 50, 50)
    y += 16
  }

  y += 16

  // ── Table header ──
  const colDesc = margin + 8
  const colSessions = 340
  const colUnit = 410
  const colAmount = 490

  pdf.rect(margin, y - 4, rightEdge - margin, 22, 0, 47, 103)
  pdf.text(colDesc, y + 9, 'Description', 9, true, 255, 255, 255)
  pdf.text(colSessions, y + 9, 'Sessions', 9, true, 255, 255, 255)
  pdf.text(colUnit, y + 9, 'Unit Price', 9, true, 255, 255, 255)
  pdf.text(colAmount, y + 9, 'Amount', 9, true, 255, 255, 255)
  y += 30

  // ── Line items ──
  for (const li of invoice.lineItems) {
    const desc = li.proRata ? `${li.description} (Pro-rated)` : li.description
    // Word-wrap description to fit before Sessions column
    const maxChars = 48
    const lines = wrapText(desc, maxChars)

    for (let i = 0; i < lines.length; i++) {
      pdf.text(colDesc, y, lines[i], 9, false, 50, 50, 50)
      if (i === 0) {
        // Only show numbers on first line
        pdf.text(colSessions + 15, y, String(li.sessions), 9, false, 50, 50, 50)
        pdf.text(colUnit, y, `$${li.unitPrice.toFixed(2)}`, 9, false, 50, 50, 50)
        pdf.textRight(rightEdge - 8, y, `$${li.amount.toFixed(2)}`, 9, false, 50, 50, 50)
      }
      y += 14
    }

    pdf.line(margin, y, rightEdge, y, 220, 220, 220)
    y += 10
  }

  y += 12

  // ── Totals ──
  pdf.text(colUnit, y, 'Subtotal', 10, false, 100, 100, 100)
  pdf.textRight(rightEdge - 8, y, `$${invoice.subtotal.toFixed(2)}`, 10, false, 50, 50, 50)
  y += 18

  if (invoice.discount > 0) {
    pdf.text(colUnit, y, 'Discount', 10, false, 22, 163, 74)
    pdf.textRight(rightEdge - 8, y, `-$${invoice.discount.toFixed(2)}`, 10, false, 22, 163, 74)
    y += 18
  }

  pdf.line(colUnit - 10, y, rightEdge, y, 0, 47, 103)
  y += 14

  pdf.text(colUnit, y, 'Total', 14, true, 0, 47, 103)
  pdf.textRight(rightEdge - 8, y, `$${invoice.total.toFixed(2)}`, 14, true, 0, 47, 103)

  y += 50

  // ── Payment details ──
  pdf.text(margin, y, 'Payment Methods:', 10, true, 0, 47, 103)
  y += 18
  pdf.text(margin, y, 'Cash on campus or Bank Transfer:', 9, false, 80, 80, 80)
  y += 16
  pdf.text(margin + 20, y, 'Account Name:', 9, false, 120, 120, 120)
  pdf.text(margin + 110, y, 'EXL Education', 9, true, 50, 50, 50)
  y += 14
  pdf.text(margin + 20, y, 'BSB:', 9, false, 120, 120, 120)
  pdf.text(margin + 110, y, '067-873', 9, true, 50, 50, 50)
  y += 14
  pdf.text(margin + 20, y, 'Account Number:', 9, false, 120, 120, 120)
  pdf.text(margin + 110, y, '1219 8062', 9, true, 50, 50, 50)

  y += 30

  // ── Footer ──
  pdf.text(margin, y, 'Thank you for choosing EXL Education.', 9, false, 150, 150, 150)
  pdf.text(margin, y + 14, 'Please direct any queries to admin@exleducation.com.au', 9, false, 150, 150, 150)

  return pdf.build().toString('base64')
}
