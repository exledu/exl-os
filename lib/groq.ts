import Groq from 'groq-sdk'

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const MODEL = 'llama-3.1-8b-instant'

function parseJSON(text: string): Record<string, unknown> {
  try { return JSON.parse(text) } catch { /* fall through */ }
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch { /* fall through */ }
  }
  return {}
}

async function complete(system: string, user: string) {
  const res = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
  })
  return res.choices[0]?.message?.content ?? '{}'
}

// ── Extract structured student data from a booking/contact form note ──────────
export async function extractStudentFromForm(note: string): Promise<{
  firstName: string | null
  lastName:  string | null
  email:     string | null
  phone:     string | null
  yearLevel: number | null
  school:    string | null
  parentFirstName: string | null
  parentLastName:  string | null
  parentEmail:     string | null
  parentPhone:     string | null
}> {
  const raw = await complete(
    'You extract student data from tutoring centre forms. Return valid JSON only, no other text.',
    `Extract student info from this tutoring centre booking/contact form submission.
Return JSON with these exact keys (use null if not found):
{
  "firstName": string | null,
  "lastName": string | null,
  "email": string | null,
  "phone": string | null,
  "yearLevel": number | null,
  "school": string | null,
  "parentFirstName": string | null,
  "parentLastName": string | null,
  "parentEmail": string | null,
  "parentPhone": string | null
}

Notes:
- yearLevel should be a number only (e.g. 12 for "Year 12", 11 for "Year 11")
- phone numbers: strip leading 0 and country code if present, keep digits only
- if "Full Name" appears without a last name context, put it in firstName

Form data:
${note}`,
  )
  return parseJSON(raw) as ReturnType<typeof extractStudentFromForm> extends Promise<infer T> ? T : never
}

// ── Classify a general email as an issue ─────────────────────────────────────
export async function classifyEmail(subject: string, from: string, body: string): Promise<{
  isIssue:     boolean
  type:        'FREE_TRIAL' | 'CANCELLATION' | 'RESCHEDULE' | 'ENQUIRY' | null
  priority:    'LOW' | 'MEDIUM' | 'URGENT'
  contactName: string | null
  summary:     string
}> {
  const raw = await complete(
    'You classify student/parent emails for a tutoring centre. Return valid JSON only, no other text.',
    `Classify this email. Decide if it needs action from the tutoring centre admin.

Return JSON:
{
  "isIssue": boolean,
  "type": "FREE_TRIAL" | "CANCELLATION" | "RESCHEDULE" | "ENQUIRY" | null,
  "priority": "LOW" | "MEDIUM" | "URGENT",
  "contactName": string | null,
  "summary": string
}

Rules:
- isIssue = true if a student/parent is requesting something (free trial, cancellation, reschedule, info)
- isIssue = false for automated system emails, receipts, spam, newsletters
- priority = URGENT if cancellation with <24h notice or urgent reschedule
- priority = MEDIUM for normal requests
- priority = LOW for general enquiries
- contactName = the person's name from the email (not the email address)
- summary = one sentence describing what they want

Subject: ${subject}
From: ${from}
Body:
${body.slice(0, 1500)}`,
  )
  return parseJSON(raw) as ReturnType<typeof classifyEmail> extends Promise<infer T> ? T : never
}
