import { prisma } from '@/lib/db'
import { logAction, getActorStaffId, getStaffIdByName } from '@/lib/staff-actions'

export async function PATCH(request: Request, ctx: RouteContext<'/api/issues/[id]'>) {
  const { id } = await ctx.params
  const body = await request.json()
  const issueId = Number(id)
  const actorId = await getActorStaffId()

  const issue = await prisma.issue.update({
    where: { id: issueId },
    data: {
      ...(body.resolved !== undefined && { resolved: body.resolved }),
      ...(body.note !== undefined && { note: body.note }),
      ...(body.resolutionNote !== undefined && { resolutionNote: body.resolutionNote }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.studentId !== undefined && { studentId: body.studentId ? Number(body.studentId) : null }),
      ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo || null }),
    },
    include: { student: true, notes: { orderBy: { createdAt: 'asc' } } },
  })

  // Attribute action to the assigned staff member if one exists, otherwise to the actor
  const assigneeId = issue.assignedTo ? await getStaffIdByName(issue.assignedTo) : null
  const logStaffId = assigneeId ?? actorId

  if (logStaffId) {
    const contactName = issue.contactName
    if (body.resolved === true) {
      logAction({ staffId: logStaffId, type: 'issue_resolved', description: `Resolved issue: ${contactName}`, metadata: { issueId } })
    }
    if (body.priority !== undefined) {
      logAction({ staffId: logStaffId, type: 'issue_priority_changed', description: `Changed priority to ${body.priority} for ${contactName}`, metadata: { issueId } })
    }
    if (body.assignedTo !== undefined) {
      logAction({ staffId: logStaffId, type: 'issue_assigned', description: `Assigned ${contactName} to ${body.assignedTo || 'nobody'}`, metadata: { issueId } })
    }
  }

  return Response.json(issue)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/issues/[id]'>) {
  const { id } = await ctx.params
  await prisma.issue.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
