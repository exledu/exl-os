import { verifySlackSignature, postMessage, addReaction, pinMessage, openModal } from '@/lib/slack'
import { prisma } from '@/lib/db'
import { format } from 'date-fns'
import { buildAttendanceModalView, type HomeworkStatus } from '@/lib/slack-attendance'
import { sendGmailEmail } from '@/lib/gmail-send'
import { buildParentEmail } from '@/lib/parent-email'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const timestamp = request.headers.get('X-Slack-Request-Timestamp') ?? ''
  const signature = request.headers.get('X-Slack-Signature') ?? ''

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const payload = JSON.parse(params.get('payload')!)

  // Route by interaction type + identifier
  if (payload.type === 'block_actions') {
    const action = payload.actions?.[0]
    if (action?.action_id === 'open_attendance_modal') {
      return handleOpenAttendanceModal(payload, action)
    }
    return new Response('', { status: 200 })
  }

  if (payload.type === 'view_submission') {
    if (payload.view?.callback_id === 'attendance_modal') {
      return handleAttendanceSubmit(payload)
    }
    if (payload.view?.callback_id === 'cover_request') {
      return handleCoverRequestSubmit(payload)
    }
  }

  return new Response('', { status: 200 })
}

// ── Attendance: open modal when user clicks the "Mark attendance" button in DM ──
async function handleOpenAttendanceModal(
  payload: { trigger_id: string },
  action: { value: string },
) {
  const sessionId = Number(action.value)
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: {
        include: {
          subject: true,
          yearLevel: true,
          enrolments: {
            include: { student: { select: { id: true, name: true, lastName: true } } },
          },
        },
      },
      trials: { include: { student: { select: { id: true, name: true, lastName: true } } } },
    },
  })

  if (!session) {
    return new Response('', { status: 200 })
  }

  const enrolledIds = new Set(session.class.enrolments.map(e => e.student.id))
  const roster = [
    ...session.class.enrolments.map(e => ({
      id:        e.student.id,
      fullName:  e.student.lastName ? `${e.student.name} ${e.student.lastName}` : e.student.name,
      trial:     false,
    })),
    ...session.trials
      .filter(t => !enrolledIds.has(t.student.id))
      .map(t => ({
        id:        t.student.id,
        fullName:  t.student.lastName ? `${t.student.name} ${t.student.lastName}` : t.student.name,
        trial:     true,
      })),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName))

  const view = buildAttendanceModalView(
    {
      id:        session.id,
      date:      session.date,
      startTime: session.startTime,
      endTime:   session.endTime,
      yearLevel: session.class.yearLevel.level,
      subject:   session.class.subject.name,
    },
    roster,
  )

  await openModal(payload.trigger_id, view)
  return new Response('', { status: 200 })
}

// ── Attendance: persist roster on modal submit ──
async function handleAttendanceSubmit(payload: {
  view: {
    private_metadata: string
    state: { values: Record<string, Record<string, { selected_options?: { value: string }[]; selected_option?: { value: string } }>> }
  }
}) {
  const { sessionId } = JSON.parse(payload.view.private_metadata) as { sessionId: number }
  const values = payload.view.state.values

  // Extract { studentId -> { present, homework } } from block ids
  const updates: { studentId: number; present: boolean; homework: HomeworkStatus }[] = []
  for (const [blockId, block] of Object.entries(values)) {
    const m = blockId.match(/^s(\d+)_p$/)
    if (!m) continue
    const studentId = Number(m[1])
    const presentBlock = block.present
    const present = (presentBlock?.selected_options?.length ?? 0) > 0
    const hwBlock = values[`s${studentId}_h`]?.homework
    const homework = (hwBlock?.selected_option?.value ?? 'UNATTEMPTED') as HomeworkStatus
    updates.push({ studentId, present, homework })
  }

  await Promise.all(updates.map(u =>
    prisma.attendance.upsert({
      where: { sessionId_studentId: { sessionId, studentId: u.studentId } },
      create: { sessionId, studentId: u.studentId, present: u.present, homework: u.homework },
      update: { present: u.present, homework: u.homework },
    })
  ))

  // Send parent emails ONLY on the first submit per session
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { include: { subject: true, yearLevel: true } },
    },
  })
  if (session && !session.parentEmailsSentAt) {
    const students = await prisma.student.findMany({
      where:  { id: { in: updates.map(u => u.studentId) } },
      select: { id: true, name: true, lastName: true, parentFirstName: true, parentEmail: true },
    })
    const studentMap = new Map(students.map(s => [s.id, s]))
    const classYearLabel = `Yr ${session.class.yearLevel.level}`
    const subjectName = session.class.subject.name

    await Promise.allSettled(updates.map(async u => {
      const s = studentMap.get(u.studentId)
      if (!s?.parentEmail) return
      const email = buildParentEmail({
        parentFirstName:  s.parentFirstName,
        studentFirstName: s.name,
        studentLastName:  s.lastName,
        classYearLabel,
        subject:          subjectName,
        sessionDate:      session.date,
        outcome: u.present
          ? { kind: 'homework', status: u.homework }
          : { kind: 'absent' },
      })
      if (!email) return
      try {
        await sendGmailEmail({ to: s.parentEmail, subject: email.subject, html: email.html })
      } catch (e) {
        console.error(`Failed parent email for student ${s.id}:`, e)
      }
    }))

    await prisma.classSession.update({
      where: { id: sessionId },
      data:  { parentEmailsSentAt: new Date() },
    })
  }

  return Response.json({ response_action: 'clear' })
}

// ── Cover request submit (existing flow) ──
async function handleCoverRequestSubmit(payload: {
  user: { id: string }
  view: {
    private_metadata: string
    state: { values: Record<string, Record<string, { selected_option?: { value: string }; value?: string }>> }
  }
}) {
  const { staffId, staffName, slackUserId } = JSON.parse(payload.view.private_metadata)
  const submitterId = payload.user.id
  const sessionId = Number(
    payload.view.state.values.session_select.session.selected_option!.value
  )
  const note = payload.view.state.values.note_input?.note?.value ?? null

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { include: { subject: true, yearLevel: true, room: true } },
    },
  })

  if (!session) {
    return Response.json({ response_action: 'errors', errors: { session_select: 'Session not found' } })
  }

  const channelId = process.env.SLACK_COVERS_CHANNEL_ID!

  const className = `Yr ${session.class.yearLevel.level} ${session.class.subject.name}`
  const shortDate = format(session.date, 'EEE d MMM')
  const timeStr = `${session.startTime}–${session.endTime}`

  const staffRecord = await prisma.staff.findUnique({ where: { id: staffId }, select: { email: true } })
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase()
  const isOnBehalf = staffRecord?.email?.toLowerCase() !== adminEmail && slackUserId === submitterId

  const requestedBy = isOnBehalf
    ? `Requested by <@${submitterId}> for ${staffName}`
    : `Requested by ${staffName}`

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🔄 *COVER NEEDED*\n\n*${className}* — ${shortDate}, ${timeStr}\n${requestedBy}${note ? `\n\n_${note}_` : ''}\n\nReact ✅ to take this cover.` },
    },
  ]

  const fallbackText = `🔄 Cover Needed: ${className} — ${shortDate}, ${timeStr}. ${requestedBy}. React ✅ to cover.`

  const result = await postMessage(channelId, fallbackText, {
    blocks,
    metadata: {
      event_type: 'cover_request',
      event_payload: {
        sessionId,
        requesterId: staffId,
        requesterSlackId: slackUserId,
        requesterName: staffName,
        className,
        dateStr: shortDate,
        timeStr,
      },
    },
  })

  if (result.ok && result.ts) {
    await pinMessage(channelId, result.ts)
    await addReaction(channelId, result.ts, 'white_check_mark')
  }

  return Response.json({ response_action: 'clear' })
}
