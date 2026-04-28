import { format } from 'date-fns'

export type SessionOutcome =
  | { kind: 'absent' }
  | { kind: 'homework'; status: 'UNATTEMPTED' | 'INCOMPLETE' | 'SATISFACTORY' | 'EXCELLENT' }

interface ParentEmailParams {
  parentFirstName: string | null
  studentFirstName: string
  studentLastName:  string | null
  classYearLabel:   string   // "Yr 9"
  subject:          string   // "TEST-Attendance"
  sessionDate:      Date
  outcome:          SessionOutcome
}

const SIGN_OFF = `
  <p style="color:#555;margin-top:24px;">
    Kind regards,<br>
    EXL Education Admin Team
  </p>`

function wrap(bodyHtml: string): string {
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222;line-height:1.55;max-width:560px;">
${bodyHtml}
${SIGN_OFF}
</div>`.trim()
}

export function buildParentEmail(p: ParentEmailParams): { subject: string; html: string } | null {
  const studentFull   = p.studentLastName ? `${p.studentFirstName} ${p.studentLastName}` : p.studentFirstName
  const dateStr       = format(p.sessionDate, 'EEEE d MMMM')
  const classLabel    = `${p.classYearLabel} ${p.subject}`
  const greetingName  = p.parentFirstName?.trim() || 'Parent/Guardian'

  if (p.outcome.kind === 'absent') {
    return {
      subject: `Absent Notice: ${studentFull} missing from ${classLabel} Class (${dateStr})`,
      html: wrap(`
        <p>Dear ${greetingName},</p>
        <p>We've noticed that ${studentFull} is missing from class today. Please reply if this is unexpected.</p>
        <p>If you would like to reschedule, please respond and we'll let you know if makeup classes are available for your child (subject to availability), otherwise all lessons can be completed with our online resources.</p>`),
    }
  }

  switch (p.outcome.status) {
    case 'UNATTEMPTED':
      return {
        subject: `Homework Update: ${studentFull} — ${classLabel} (${dateStr})`,
        html: wrap(`
          <p>Dear ${greetingName},</p>
          <p>We wanted to let you know that ${studentFull} did not attempt this week's homework for ${classLabel}.</p>
          <p>If there's anything we should know (illness, scheduling, or content they're struggling with), please let us know and we'll work with you to get them back on track.</p>`),
      }
    case 'INCOMPLETE':
      return {
        subject: `Homework Update: ${studentFull} — ${classLabel} (${dateStr})`,
        html: wrap(`
          <p>Dear ${greetingName},</p>
          <p>${studentFull} made a start on this week's homework for ${classLabel} but didn't finish it.</p>
          <p>If there was any lesson content that felt unclear, please reply and we'll get our top tutors to revisit those concepts with them before the next lesson.</p>`),
      }
    case 'SATISFACTORY':
      return {
        subject: `Lesson Update: ${studentFull} — ${classLabel} (${dateStr})`,
        html: wrap(`
          <p>Dear ${greetingName},</p>
          <p>${studentFull} completed this week's homework for ${classLabel} to a satisfactory standard. Thank you for supporting them at home.</p>`),
      }
    case 'EXCELLENT':
      return {
        subject: `Great Work: ${studentFull} — ${classLabel} (${dateStr})`,
        html: wrap(`
          <p>Dear ${greetingName},</p>
          <p>We reviewed ${studentFull}'s homework this week and found excellent responses. Well done to them, and thank you for the support at home.</p>`),
      }
  }
}
