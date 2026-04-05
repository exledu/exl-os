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
    // Page object
    const pageObj = this.addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${streamObj} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`
    )
    this.pages.push(pageObj)
    this.currentStream = ''
  }

  build(): Buffer {
    this.finishPage()

    // Object 1: Catalog
    // Object 2: Pages
    // Object 3: Helvetica font
    // Object 4: Helvetica-Bold font
    const catalogObj = this.objectCount + 1
    const pagesObj = this.objectCount + 2
    const font1Obj = this.objectCount + 3
    const font2Obj = this.objectCount + 4
    const totalObjects = this.objectCount + 4

    const offsets: number[] = []
    let pdf = '%PDF-1.4\n'

    // Write existing objects (streams and pages)
    for (let i = 0; i < this.objects.length; i++) {
      offsets.push(pdf.length)
      pdf += `${i + 1} 0 obj\n${this.objects[i]}\nendobj\n`
    }

    // Catalog
    offsets.push(pdf.length)
    pdf += `${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj\n`

    // Pages
    const kids = this.pages.map(p => `${p} 0 R`).join(' ')
    offsets.push(pdf.length)
    pdf += `${pagesObj} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>\nendobj\n`

    // Fix page parent references
    for (const pageObjNum of this.pages) {
      const idx = pageObjNum - 1
      this.objects[idx] = this.objects[idx].replace('/Parent 2 0 R', `/Parent ${pagesObj} 0 R`)
    }

    // Font 1: Helvetica
    offsets.push(pdf.length)
    pdf += `${font1Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`

    // Font 2: Helvetica-Bold
    offsets.push(pdf.length)
    pdf += `${font2Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`

    // Now rebuild with correct parent refs
    pdf = '%PDF-1.4\n'
    const finalOffsets: number[] = []
    for (let i = 0; i < this.objects.length; i++) {
      finalOffsets.push(pdf.length)
      const obj = this.objects[i].replace('/Parent 2 0 R', `/Parent ${pagesObj} 0 R`)
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
    }
    finalOffsets.push(pdf.length)
    pdf += `${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj\n`
    finalOffsets.push(pdf.length)
    pdf += `${pagesObj} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>\nendobj\n`
    finalOffsets.push(pdf.length)
    pdf += `${font1Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`
    finalOffsets.push(pdf.length)
    pdf += `${font2Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`

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

export function generateInvoicePdf(invoice: InvoiceData): string {
  const pdf = new PdfBuilder()
  const margin = 50
  const pageWidth = 595
  const rightEdge = pageWidth - margin
  let y = 0

  // ── Header bar ──
  pdf.rect(0, 0, pageWidth, 60, 0, 47, 103)
  pdf.text(margin, 25, 'EXL Education', 20, true, 255, 255, 255)
  pdf.text(margin, 42, 'Tutoring Centre', 9, false, 180, 210, 255)
  pdf.textRight(rightEdge, 25, 'admin@exleducation.com.au', 9, false, 200, 220, 255)

  y = 85

  // ── Invoice title + meta ──
  pdf.text(margin, y, 'INVOICE', 18, true, 0, 47, 103)
  const dateStr = format(new Date(invoice.createdAt), 'dd MMM yyyy')
  pdf.textRight(rightEdge, y - 5, `Invoice #${String(invoice.id).padStart(4, '0')}`, 10, false, 100, 100, 100)
  pdf.textRight(rightEdge, y + 8, `Date: ${dateStr}`, 10, false, 100, 100, 100)

  y += 35

  // ── Bill To ──
  pdf.text(margin, y, 'Bill To:', 11, true, 0, 47, 103)
  y += 16

  const studentName = `${invoice.student.name}${invoice.student.lastName ? ' ' + invoice.student.lastName : ''}`
  const parentName = invoice.student.parentFirstName
    ? `${invoice.student.parentFirstName}${invoice.student.parentLastName ? ' ' + invoice.student.parentLastName : ''}`
    : null

  if (parentName) {
    pdf.text(margin, y, parentName, 10, false, 50, 50, 50)
    y += 14
  }
  pdf.text(margin, y, `Student: ${studentName} (Year ${invoice.student.yearLevel.level})`, 10, false, 50, 50, 50)
  y += 14
  const email = invoice.student.parentEmail || invoice.student.email
  if (email) {
    pdf.text(margin, y, email, 10, false, 50, 50, 50)
    y += 14
  }

  y += 10

  // ── Table header ──
  pdf.rect(margin, y - 4, rightEdge - margin, 20, 0, 47, 103)
  pdf.text(margin + 8, y + 8, 'Description', 9, true, 255, 255, 255)
  pdf.text(330, y + 8, 'Sessions', 9, true, 255, 255, 255)
  pdf.text(400, y + 8, 'Unit Price', 9, true, 255, 255, 255)
  pdf.text(490, y + 8, 'Amount', 9, true, 255, 255, 255)
  y += 26

  // ── Line items ──
  for (const li of invoice.lineItems) {
    const desc = li.proRata ? `${li.description} (Pro-rated)` : li.description
    pdf.text(margin + 8, y, desc, 10, false, 50, 50, 50)
    pdf.text(345, y, String(li.sessions), 10, false, 50, 50, 50)
    pdf.text(410, y, `$${li.unitPrice.toFixed(2)}`, 10, false, 50, 50, 50)
    pdf.textRight(rightEdge - 8, y, `$${li.amount.toFixed(2)}`, 10, false, 50, 50, 50)
    y += 8
    pdf.line(margin, y, rightEdge, y, 220, 220, 220)
    y += 14
  }

  y += 8

  // ── Totals ──
  pdf.text(410, y, 'Subtotal', 10, false, 100, 100, 100)
  pdf.textRight(rightEdge - 8, y, `$${invoice.subtotal.toFixed(2)}`, 10, false, 50, 50, 50)
  y += 16

  if (invoice.discount > 0) {
    pdf.text(410, y, 'Discount', 10, false, 22, 163, 74)
    pdf.textRight(rightEdge - 8, y, `-$${invoice.discount.toFixed(2)}`, 10, false, 22, 163, 74)
    y += 16
  }

  pdf.line(400, y, rightEdge, y, 0, 47, 103)
  y += 10

  pdf.text(410, y, 'Total', 14, true, 0, 47, 103)
  pdf.textRight(rightEdge - 8, y, `$${invoice.total.toFixed(2)}`, 14, true, 0, 47, 103)

  y += 40

  // ── Footer ──
  pdf.text(margin, y, 'Thank you for choosing EXL Education.', 9, false, 150, 150, 150)
  pdf.text(margin, y + 12, 'Please direct any queries to admin@exleducation.com.au', 9, false, 150, 150, 150)

  return pdf.build().toString('base64')
}
