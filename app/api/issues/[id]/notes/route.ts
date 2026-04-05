import { prisma } from '@/lib/db'
import { logAction, getActorStaffId, getStaffIdByName } from '@/lib/staff-actions'

export async function POST(request: Request, ctx: RouteContext<'/api/issues/[id]/notes'>) {
  const { id } = await ctx.params
  const body = await request.json()
  const issueId = Number(id)

  const note = await prisma.issueNote.create({
    data: {
      issueId,
      author: body.author ?? 'Admin',
      content: body.content,
      isEmail: body.isEmail ?? false,
    },
  })

  // Attribute to assigned staff member if one exists, otherwise to the actor
  const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { contactName: true, assignedTo: true } })
  const assigneeId = issue?.assignedTo ? await getStaffIdByName(issue.assignedTo) : null
  const actorId = await getActorStaffId()
  const logStaffId = assigneeId ?? actorId

  if (logStaffId) {
    logAction({
      staffId: logStaffId,
      type: 'issue_note_added',
      description: `Added note to issue: ${issue?.contactName ?? 'Unknown'}`,
      metadata: { issueId, noteId: note.id },
    })
  }

  return Response.json(note, { status: 201 })
}
