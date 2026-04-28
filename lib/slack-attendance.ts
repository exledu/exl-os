import { format } from 'date-fns'

export type HomeworkStatus = 'UNATTEMPTED' | 'INCOMPLETE' | 'SATISFACTORY' | 'EXCELLENT'

const HW_OPTIONS = [
  { text: 'Unattempted',  value: 'UNATTEMPTED'  },
  { text: 'Incomplete',   value: 'INCOMPLETE'   },
  { text: 'Satisfactory', value: 'SATISFACTORY' },
  { text: 'Excellent',    value: 'EXCELLENT'    },
] as const

const PRESENT_OPTION = {
  text:  { type: 'plain_text' as const, text: 'Present' },
  value: 'present',
}

interface SessionInfo {
  id: number
  date: Date
  startTime: string
  endTime: string
  yearLevel: number
  subject: string
}

interface RosterStudent {
  id:        number
  fullName:  string
  trial:     boolean
}

/** Block Kit message body that prompts a teacher to mark attendance. */
export function buildAttendanceDmBlocks(session: SessionInfo, level: 1 | 2 | 3): { text: string; blocks: unknown[] } {
  const className = `Yr ${session.yearLevel} ${session.subject}`
  const dateStr = format(session.date, 'EEE d MMM')
  const timeStr = `${session.startTime}–${session.endTime}`
  const intro = level === 1
    ? `Please mark attendance for *${className}*`
    : level === 2
    ? `Reminder: please mark attendance for *${className}*`
    : `*Final reminder*: please mark attendance for *${className}* — parents need to be notified about absences ASAP`

  const text = `${intro} — ${dateStr}, ${timeStr}`

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${intro}\n*Class Time:* ${dateStr}, ${timeStr}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'open_attendance_modal',
          text: { type: 'plain_text', text: '📋 Mark attendance' },
          style: 'primary',
          value: String(session.id),
        },
      ],
    },
  ]

  return { text, blocks }
}

/** Build the Slack modal view for marking attendance + homework for a session. */
export function buildAttendanceModalView(session: SessionInfo, roster: RosterStudent[]): Record<string, unknown> {
  const className = `Yr ${session.yearLevel} ${session.subject}`
  const dateStr = format(session.date, 'EEE d MMM')
  const timeStr = `${session.startTime}–${session.endTime}`

  const blocks: unknown[] = [
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*${className}* — ${dateStr}, ${timeStr}` },
      ],
    },
    { type: 'divider' },
  ]

  if (roster.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No students enrolled in this session._' },
    })
  }

  for (const s of roster) {
    const labelName = s.trial ? `${s.fullName} (Trial)` : s.fullName

    // Present checkbox — pre-ticked
    blocks.push({
      type: 'input',
      block_id: `s${s.id}_p`,
      optional: true,
      label: { type: 'plain_text', text: labelName },
      element: {
        type: 'checkboxes',
        action_id: 'present',
        options: [PRESENT_OPTION],
        initial_options: [PRESENT_OPTION],
      },
    })

    // Homework dropdown — defaults to Unattempted
    blocks.push({
      type: 'input',
      block_id: `s${s.id}_h`,
      label: { type: 'plain_text', text: 'Homework' },
      element: {
        type: 'static_select',
        action_id: 'homework',
        options: HW_OPTIONS.map(o => ({
          text:  { type: 'plain_text', text: o.text },
          value: o.value,
        })),
        initial_option: {
          text:  { type: 'plain_text', text: HW_OPTIONS[0].text },
          value: HW_OPTIONS[0].value,
        },
      },
    })
  }

  return {
    type: 'modal',
    callback_id: 'attendance_modal',
    title:  { type: 'plain_text', text: 'Attendance' },
    submit: { type: 'plain_text', text: 'Save' },
    close:  { type: 'plain_text', text: 'Cancel' },
    private_metadata: JSON.stringify({ sessionId: session.id }),
    blocks,
  }
}
