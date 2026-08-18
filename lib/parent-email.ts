import { format } from 'date-fns'

export type HomeworkStatus = 'UNATTEMPTED' | 'INCOMPLETE' | 'SATISFACTORY' | 'EXCELLENT'

interface ParentEmailParams {
  parentFirstName: string | null
  studentFirstName: string
  studentLastName:  string | null
  classYearLabel:   string   // "Yr 9"
  subject:          string   // "Maths"
  sessionDate:      Date
}

export interface BuiltEmail {
  subject: string
  html:    string
}

const ADMIN_TEAM_SIGN_OFF = `
    <p style="margin-top: 24px;">
      Kind regards,<br/>
      <strong>EXL Education Admin Team</strong>
    </p>`

function wrap(headerLabel: string, bodyHtml: string): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #002F67; padding: 24px; border-radius: 8px 8px 0 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="vertical-align: top;">
          <h1 style="color: white; margin: 0; font-size: 22px;">${headerLabel}</h1>
          <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 13px;">EXL Education</p>
        </td>
      </tr>
    </table>
  </div>
  <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    ${bodyHtml}
    ${ADMIN_TEAM_SIGN_OFF}
  </div>
</div>`
}

function fullName(p: ParentEmailParams) {
  return p.studentLastName ? `${p.studentFirstName} ${p.studentLastName}` : p.studentFirstName
}

function greeting(p: ParentEmailParams) {
  return p.parentFirstName?.trim() || 'Parent/Guardian'
}

// ── Absent Notice ─────────────────────────────────────────────────────────

export function buildAbsentNotice(p: ParentEmailParams): BuiltEmail {
  const studentFull = fullName(p)
  const classLabel  = `${p.classYearLabel} ${p.subject}`
  const dateStr     = format(p.sessionDate, 'EEEE d MMMM')
  return {
    subject: `Absent Notice: ${studentFull} missing from ${classLabel} Class (${dateStr})`,
    html: wrap('Absent Notice', `
    <p>Dear ${greeting(p)},</p>
    <p style="margin-top: 16px;">We've noticed that <strong>${studentFull}</strong> is missing from class today. Please reply if this is unexpected.</p>
    <p style="margin-top: 16px;">If you would like to reschedule, please respond and we'll let you know if makeup classes are available for your child (subject to availability), otherwise all lessons can be completed with our online resources.</p>`),
  }
}

// ── Absent, but pre-notified — acknowledgement ────────────────────────────

export function buildAbsentNotifiedNotice(p: ParentEmailParams): BuiltEmail {
  const studentFull = fullName(p)
  const classLabel  = `${p.classYearLabel} ${p.subject}`
  const dateStr     = format(p.sessionDate, 'EEEE d MMMM')
  return {
    subject: `Absence Confirmed: ${studentFull} — ${classLabel} (${dateStr})`,
    html: wrap('Absence Confirmed', `
    <p>Dear ${greeting(p)},</p>
    <p style="margin-top: 16px;">Thanks for letting us know that <strong>${studentFull}</strong> would be away from today's <strong>${classLabel}</strong> class. This is just to confirm we've recorded the absence.</p>
    <p style="margin-top: 16px;">This week's material and homework can be completed via our online resources.</p>`),
  }
}

// ── Attendance Confirmation (parent of the homework thread) ───────────────

export function buildAttendanceConfirmation(p: ParentEmailParams): BuiltEmail {
  const studentFull = fullName(p)
  const classLabel  = `${p.classYearLabel} ${p.subject}`
  const dateStr     = format(p.sessionDate, 'EEEE d MMMM')
  return {
    subject: `Attendance Confirmation: ${studentFull} attended ${classLabel} Class (${dateStr})`,
    html: wrap('Attendance Confirmation', `
    <p>Dear ${greeting(p)},</p>
    <p style="margin-top: 16px;">This is to confirm that <strong>${studentFull}</strong> attended today's <strong>${classLabel}</strong> class. Their homework update will follow in this email thread.</p>`),
  }
}

// ── Homework Update (sent as reply to the confirmation) ───────────────────

export function buildHomeworkUpdate(p: ParentEmailParams, status: HomeworkStatus): BuiltEmail {
  const studentFull = fullName(p)
  const classLabel  = `${p.classYearLabel} ${p.subject}`
  // Subject MUST match the parent (Attendance Confirmation) for Gmail to thread.
  // We prefix "Re: " — Gmail strips it when matching.
  const parentSubject = buildAttendanceConfirmation(p).subject
  const subject = `Re: ${parentSubject}`

  switch (status) {
    case 'UNATTEMPTED':
      return {
        subject,
        html: wrap('Homework Unattempted', `
    <p>Dear ${greeting(p)},</p>
    <p style="margin-top: 16px;">We wanted to let you know that <strong>${studentFull}</strong> did not attempt this week's homework for <strong>${classLabel}</strong>.</p>
    <p style="margin-top: 16px;">If there's anything we should know (illness, scheduling, or content they're struggling with), please let us know and we'll work with you to get them back on track.</p>`),
      }
    case 'INCOMPLETE':
      return {
        subject,
        html: wrap('Homework Incomplete', `
    <p>Dear ${greeting(p)},</p>
    <p style="margin-top: 16px;"><strong>${studentFull}</strong> made a start on this week's homework for <strong>${classLabel}</strong> but didn't finish it.</p>
    <p style="margin-top: 16px;">If there was any lesson content that felt unclear, please reply and we'll get our top tutors to revisit those concepts with them before the next lesson.</p>`),
      }
    case 'SATISFACTORY':
      return {
        subject,
        html: wrap('Homework Satisfactory', `
    <p>Dear ${greeting(p)},</p>
    <p style="margin-top: 16px;"><strong>${studentFull}</strong> completed this week's homework for <strong>${classLabel}</strong> to a satisfactory standard. Thank you for supporting them at home.</p>`),
      }
    case 'EXCELLENT':
      return {
        subject,
        html: wrap('Homework Excellent', `
    <p>Dear ${greeting(p)},</p>
    <p style="margin-top: 16px;">We reviewed <strong>${studentFull}</strong>'s homework this week and found excellent responses. Well done to them, and thank you for the support at home.</p>`),
      }
  }
}
