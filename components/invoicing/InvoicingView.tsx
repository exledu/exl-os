'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { FileText, Send, Search, ChevronRight, DollarSign, Check, X, History, Bird, Tag, Minus, Plus, Eye } from 'lucide-react'
import { subjectColour } from '@/lib/subject-colours'

// ── Types ────────────────────────────────────────────────────────────────────

interface StudentSummary {
  id: number
  name: string
  lastName: string | null
  yearLevel: { id: number; level: number }
  _count: { enrolments: number }
}

interface EnrolledClass {
  id: number
  class: {
    id: number
    subject: { name: string }
    yearLevel: { level: number }
    staff: { name: string }
    isRecurring: boolean
    dayOfWeek: number | null
    startTime: string | null
    endTime: string | null
  }
}

interface StudentDetail {
  id: number
  name: string
  lastName: string | null
  email: string | null
  parentFirstName: string | null
  parentLastName: string | null
  parentEmail: string | null
  yearLevel: { id: number; level: number }
  enrolments: EnrolledClass[]
}

const MAX_SESSIONS = 10

interface LineItem {
  classId: number
  subjectName: string
  yearLevel: number
  basePrice: number        // standard termly price (10 sessions)
  earlyBirdDiscount: number // early bird discount amount (on full term)
  sessions: number         // 1–10, default 10
  amount: number           // final line item amount (after early bird + pro-rata)
}

interface InvoiceRecord {
  id: number
  studentId: number
  student: { name: string; lastName: string | null; yearLevel: { level: number } }
  subtotal: number
  discount: number
  total: number
  status: string
  sentAt: string | null
  createdAt: string
  lineItems: { description: string; sessions: number; unitPrice: number; amount: number; proRata: boolean }[]
}

// ── Pricing ──────────────────────────────────────────────────────────────────

const TERMLY_PRICE: Record<number, number> = {
  12: 1375,
  11: 1100,
  10: 980,
  9: 660,
  8: 660,
  7: 660,
}

const EARLY_BIRD_DISCOUNT: Record<number, number> = {
  12: 75,
  11: 50,
  10: 50,
  9: 50,
  8: 50,
  7: 50,
}

function getMultiSubjectDiscount(subjectCount: number): { percent: number; label: string } {
  if (subjectCount >= 3) return { percent: 10, label: '3+ subjects (-10%)' }
  if (subjectCount === 2) return { percent: 5, label: '2 subjects (-5%)' }
  return { percent: 0, label: '' }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fullName(s: { name: string; lastName: string | null }) {
  return s.lastName ? `${s.name} ${s.lastName}` : s.name
}

function lineItemDescription(earlyBird: boolean, yearLevel: number, subjectName: string, sessions: number) {
  const pricing = earlyBird ? 'Early Bird' : 'Standard'
  const type = sessions < MAX_SESSIONS ? 'Pro-Rata Invoice Amount' : 'Termly Invoice Amount'
  return `${pricing} Year ${yearLevel} ${subjectName} ${type}`
}

function calcAmount(basePrice: number, ebDiscount: number, sessions: number) {
  const fullTermPrice = basePrice - ebDiscount
  return Math.round((fullTermPrice * sessions / MAX_SESSIONS) * 100) / 100
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT:  'bg-blue-50 text-blue-700',
  PAID:  'bg-emerald-50 text-emerald-700',
}

// ── Component ────────────────────────────────────────────────────────────────

export function InvoicingView() {
  // ── State ──
  const [students, setStudents]     = useState<StudentSummary[]>([])
  const [search, setSearch]         = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail]         = useState<StudentDetail | null>(null)
  const [loading, setLoading]       = useState(false)

  // Invoice builder
  const [lineItems, setLineItems]   = useState<LineItem[]>([])
  const [earlyBird, setEarlyBird]   = useState(false)
  const [manualDiscount, setManualDiscount]         = useState(0)
  const [editingDiscount, setEditingDiscount]       = useState(false)
  const [discountInput, setDiscountInput]           = useState('')

  // Sending
  const [creating, setCreating] = useState(false)
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // History
  const [invoices, setInvoices]       = useState<InvoiceRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Preview
  const [previewHtml, setPreviewHtml]         = useState<string | null>(null)
  const [previewSubject, setPreviewSubject]   = useState('')
  const [previewTo, setPreviewTo]             = useState('')
  const [loadingPreview, setLoadingPreview]   = useState(false)

  // ── Load students ──
  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(setStudents)
    fetch('/api/invoices').then(r => r.json()).then(setInvoices)
  }, [])

  // ── Recalculate line items when early bird toggles ──
  useEffect(() => {
    setLineItems(prev => prev.map(li => {
      const ebDiscount = earlyBird ? (EARLY_BIRD_DISCOUNT[li.yearLevel] ?? 50) : 0
      return {
        ...li,
        earlyBirdDiscount: ebDiscount,
        amount: calcAmount(li.basePrice, ebDiscount, li.sessions),
      }
    }))
  }, [earlyBird])

  // ── Select student ──
  async function selectStudent(id: number) {
    if (id === selectedId) return
    setSelectedId(id)
    setLoading(true)
    setDetail(null)
    setLineItems([])
    setEarlyBird(false)
    setManualDiscount(0)
    setSent(false)
    setError(null)
    setShowHistory(false)
    try {
      const res = await fetch(`/api/students/${id}`)
      const data: StudentDetail = await res.json()
      setDetail(data)
      // Auto-populate line items from enrolled classes
      setLineItems(
        data.enrolments.map(e => {
          const yl = e.class.yearLevel.level
          const base = TERMLY_PRICE[yl] ?? 660
          return {
            classId: e.class.id,
            subjectName: e.class.subject.name,
            yearLevel: yl,
            basePrice: base,
            earlyBirdDiscount: 0,
            sessions: MAX_SESSIONS,
            amount: base,
          }
        })
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Session count change ──
  function updateSessions(idx: number, sessions: number) {
    const clamped = Math.max(1, Math.min(MAX_SESSIONS, sessions))
    setLineItems(prev => prev.map((li, i) => {
      if (i !== idx) return li
      return { ...li, sessions: clamped, amount: calcAmount(li.basePrice, li.earlyBirdDiscount, clamped) }
    }))
  }

  // ── Calculations ──
  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
  const multiSubject = getMultiSubjectDiscount(lineItems.length)
  const multiSubjectAmount = subtotal * (multiSubject.percent / 100)
  const afterMultiSubject = subtotal - multiSubjectAmount
  const total = Math.max(0, afterMultiSubject - manualDiscount)

  // ── Create and send ──
  async function handleSend() {
    if (!detail || lineItems.length === 0) return
    setCreating(true)
    setSending(false)
    setError(null)

    try {
      const createRes = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: detail.id,
          lineItems: lineItems.map(li => ({
            description: lineItemDescription(earlyBird && li.earlyBirdDiscount > 0, li.yearLevel, li.subjectName, li.sessions),
            sessions: li.sessions,
            unitPrice: li.basePrice,
            amount: li.amount,
            proRata: li.sessions < MAX_SESSIONS,
          })),
          discount: multiSubjectAmount + manualDiscount,
        }),
      })
      if (!createRes.ok) throw new Error('Failed to create invoice')
      const invoice: InvoiceRecord = await createRes.json()

      setSending(true)
      setCreating(false)
      const sendRes = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' })
      if (!sendRes.ok) {
        const err = await sendRes.json()
        throw new Error(err.error || 'Failed to send invoice')
      }
      const updated: InvoiceRecord = await sendRes.json()
      setInvoices(prev => [updated, ...prev])
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setCreating(false)
      setSending(false)
    }
  }

  // ── Preview ──
  async function handlePreview() {
    if (!detail || lineItems.length === 0) return
    setLoadingPreview(true)
    try {
      const res = await fetch('/api/invoices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: {
            name: detail.name,
            lastName: detail.lastName,
            parentFirstName: detail.parentFirstName,
            parentLastName: detail.parentLastName,
            parentEmail: detail.parentEmail,
            email: detail.email,
          },
          lineItems: lineItems.map(li => ({
            description: lineItemDescription(earlyBird && li.earlyBirdDiscount > 0, li.yearLevel, li.subjectName, li.sessions),
            sessions: li.sessions,
            amount: li.amount,
            proRata: li.sessions < MAX_SESSIONS,
          })),
          subtotal,
          discount: multiSubjectAmount + manualDiscount,
          total,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setPreviewSubject(data.subject)
        setPreviewTo(data.recipientEmail || 'No email on file')
        setPreviewHtml(data.html)
      }
    } finally {
      setLoadingPreview(false)
    }
  }

  // ── Filtered students ──
  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      (s.lastName ?? '').toLowerCase().includes(q) ||
      `yr ${s.yearLevel.level}`.includes(q)
    )
  })

  const studentInvoices = invoices.filter(inv => inv.studentId === selectedId)

  return (
    <div className="flex h-[calc(100vh-48px)] gap-6">
      {/* ── Left Panel: Student List ── */}
      <div className="flex w-72 flex-col rounded-2xl bg-white shadow-sm border border-gray-100">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Select Student</h2>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => selectStudent(s.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all ${
                selectedId === s.id
                  ? 'bg-blue-50 ring-1 ring-blue-200'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{fullName(s)}</p>
                <p className="text-xs text-gray-500">
                  Yr {s.yearLevel.level} &middot; {s._count.enrolments} class{s._count.enrolments !== 1 ? 'es' : ''}
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Right Panel: Invoice Builder ── */}
      <div className="flex-1 overflow-y-auto">
        {!detail && !loading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">Select a student to create an invoice</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {detail && (
          <div className="space-y-5">
            {/* Student header + Early Bird toggle */}
            <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">{fullName(detail)}</h2>
                  <p className="text-sm text-gray-500">
                    Year {detail.yearLevel.level}
                    {detail.parentEmail && <> &middot; {detail.parentEmail}</>}
                    {!detail.parentEmail && detail.email && <> &middot; {detail.email}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Early Bird toggle */}
                  <button
                    onClick={() => setEarlyBird(!earlyBird)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      earlyBird
                        ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <Bird className="h-3.5 w-3.5" />
                    Early Bird
                  </button>
                  {studentInvoices.length > 0 && (
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        showHistory ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      History ({studentInvoices.length})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Invoice history */}
            {showHistory && studentInvoices.length > 0 && (
              <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Previous Invoices</h3>
                <div className="space-y-2">
                  {studentInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-500">#{String(inv.id).padStart(4, '0')}</span>
                        <span className="text-sm text-gray-700">{format(new Date(inv.createdAt), 'dd MMM yyyy')}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[inv.status]}`}>
                          {inv.status}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800">${inv.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Success banner */}
            {sent && (
              <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-3">
                <Check className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">
                  Invoice sent to {detail.parentEmail || detail.email}
                </p>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 px-5 py-3">
                <X className="h-5 w-5 text-red-500" />
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}

            {/* Line items */}
            <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_110px_100px_110px_36px] gap-2 bg-[#002F67] px-5 py-3">
                <span className="text-xs font-semibold text-white">Description</span>
                <span className="text-xs font-semibold text-white text-right">Termly Price</span>
                <span className="text-xs font-semibold text-white text-center">Sessions</span>
                <span className="text-xs font-semibold text-white text-right">Amount</span>
                <span />
              </div>

              {lineItems.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  No enrolled classes found
                </div>
              )}

              {lineItems.map((li, idx) => {
                const colour = subjectColour(li.subjectName, li.yearLevel)
                const isProRata = li.sessions < MAX_SESSIONS
                const desc = lineItemDescription(earlyBird && li.earlyBirdDiscount > 0, li.yearLevel, li.subjectName, li.sessions)
                return (
                  <div
                    key={li.classId}
                    className="grid grid-cols-[1fr_110px_100px_110px_36px] gap-2 items-center px-5 py-3 border-b border-gray-100 last:border-b-0"
                    style={{ borderLeft: `3px solid ${colour}` }}
                  >
                    {/* Description */}
                    <div>
                      <span className="text-sm font-medium text-gray-800">{desc}</span>
                      {earlyBird && li.earlyBirdDiscount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                          <Bird className="h-2.5 w-2.5" />
                          -${li.earlyBirdDiscount}
                        </span>
                      )}
                    </div>

                    {/* Base termly price */}
                    <div className="text-right">
                      <span className={`text-sm ${isProRata ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
                        ${(li.basePrice - li.earlyBirdDiscount).toFixed(2)}
                      </span>
                    </div>

                    {/* Sessions stepper */}
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => updateSessions(idx, li.sessions - 1)}
                        disabled={li.sessions <= 1}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className={`w-6 text-center text-sm font-semibold ${isProRata ? 'text-amber-700' : 'text-gray-700'}`}>
                        {li.sessions}
                      </span>
                      <button
                        onClick={() => updateSessions(idx, li.sessions + 1)}
                        disabled={li.sessions >= MAX_SESSIONS}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Amount */}
                    <div className={`text-right text-sm font-semibold px-2 py-1 rounded ${
                      isProRata ? 'bg-amber-50 text-amber-700' : 'text-gray-800'
                    }`}>
                      ${li.amount.toFixed(2)}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}
                      className="flex items-center justify-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Totals */}
            {lineItems.length > 0 && (
              <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
                <div className="space-y-3">
                  {/* Subtotal */}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium text-gray-800">${subtotal.toFixed(2)}</span>
                  </div>

                  {/* Multi-subject discount */}
                  {multiSubject.percent > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="flex items-center gap-1.5 text-violet-600">
                        <Tag className="h-3.5 w-3.5" />
                        Multiple Subject Discount ({multiSubject.label})
                      </span>
                      <span className="font-medium text-violet-600">-${multiSubjectAmount.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Manual discount */}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Additional Discount</span>
                    {editingDiscount ? (
                      <div className="relative w-32">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={discountInput}
                          onChange={e => setDiscountInput(e.target.value)}
                          onBlur={() => { setManualDiscount(Math.max(0, Number(discountInput) || 0)); setEditingDiscount(false) }}
                          onKeyDown={e => { if (e.key === 'Enter') { setManualDiscount(Math.max(0, Number(discountInput) || 0)); setEditingDiscount(false) } }}
                          className="w-full rounded border-2 border-emerald-400 bg-emerald-50 py-1 pl-6 pr-2 text-right text-sm font-medium focus:outline-none"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => { setDiscountInput(String(manualDiscount)); setEditingDiscount(true) }}
                        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                          manualDiscount > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                        }`}
                      >
                        {manualDiscount > 0 ? `-$${manualDiscount.toFixed(2)}` : 'Add discount'}
                      </button>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t-2 border-[#002F67]/20" />

                  {/* Total */}
                  <div className="flex justify-between">
                    <span className="text-base font-bold text-[#002F67]">Total</span>
                    <span className="text-xl font-bold text-[#002F67]">${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-5 flex gap-3">
                  {/* Preview button */}
                  <button
                    onClick={handlePreview}
                    disabled={loadingPreview || lineItems.length === 0}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[#002F67] px-4 py-3 text-sm font-semibold text-[#002F67] transition-all hover:bg-blue-50 disabled:opacity-50"
                  >
                    {loadingPreview ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#002F67] border-t-transparent" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Preview Email
                  </button>

                  {/* Send button */}
                  <button
                    onClick={handleSend}
                    disabled={creating || sending || sent || lineItems.length === 0}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                      sent
                        ? 'bg-emerald-500 text-white cursor-default'
                        : creating || sending
                          ? 'bg-[#002F67]/70 text-white cursor-wait'
                          : 'bg-[#002F67] text-white hover:bg-[#001f47] shadow-lg shadow-blue-900/20'
                    }`}
                  >
                    {sent ? (
                      <>
                        <Check className="h-4 w-4" />
                        Invoice Sent
                      </>
                    ) : creating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Creating...
                      </>
                    ) : sending ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Create &amp; Send Invoice
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Email Preview Modal ── */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Email Preview</h3>
                <p className="mt-0.5 text-xs text-gray-500">This is how the email will appear to the recipient</p>
              </div>
              <button
                onClick={() => setPreviewHtml(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Email metadata */}
            <div className="border-b border-gray-100 px-6 py-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-gray-500">From</span>
                <span className="text-gray-700">admin@exleducation.com.au</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-gray-500">To</span>
                <span className="text-gray-700">{previewTo}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-gray-500">Subject</span>
                <span className="font-medium text-gray-700">{previewSubject}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-gray-500">Attach</span>
                <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                  <FileText className="h-3 w-3" />
                  Invoice.pdf
                </span>
              </div>
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div
                className="mx-auto max-w-[600px]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setPreviewHtml(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => { setPreviewHtml(null); handleSend() }}
                disabled={creating || sending || sent}
                className="flex items-center gap-2 rounded-lg bg-[#002F67] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001f47] transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
