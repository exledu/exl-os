import { prisma } from '@/lib/db'
import { extractStudentFromForm } from '@/lib/groq'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const issueId = Number(id)

  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { notes: { orderBy: { createdAt: 'asc' } } },
  })
  if (!issue) return new Response('Issue not found', { status: 404 })

  // Build the source text from issue note + any email notes (gives LLM full context)
  const sourceText = [
    issue.note ?? '',
    ...issue.notes.filter(n => n.isEmail).map(n => n.content),
  ].join('\n\n')

  if (!sourceText.trim()) {
    return Response.json({ error: 'No content to extract from' }, { status: 400 })
  }

  const data = await extractStudentFromForm(sourceText)
  if (!data.firstName) {
    return Response.json({ error: 'Could not extract student name from email' }, { status: 422 })
  }

  // Resolve year level (use parsed value or fallback to highest)
  let yearLevelId: number | undefined
  if (data.yearLevel) {
    const yl = await prisma.yearLevel.findFirst({ where: { level: data.yearLevel } })
    if (yl) yearLevelId = yl.id
  }
  if (!yearLevelId) {
    const fallback = await prisma.yearLevel.findFirst({ orderBy: { level: 'desc' } })
    if (!fallback) return Response.json({ error: 'No year levels in DB' }, { status: 500 })
    yearLevelId = fallback.id
  }

  const student = await prisma.student.create({
    data: {
      name:            data.firstName,
      lastName:        data.lastName        ?? null,
      email:           data.email           ?? null,
      phone:           data.phone           ?? null,
      school:          data.school          ?? null,
      yearLevelId,
      parentFirstName: data.parentFirstName ?? null,
      parentLastName:  data.parentLastName  ?? null,
      parentEmail:     data.parentEmail     ?? null,
      parentPhone:     data.parentPhone     ?? null,
    },
    include: { yearLevel: true },
  })

  // Link the student to the issue
  await prisma.issue.update({
    where: { id: issueId },
    data:  { studentId: student.id },
  })

  return Response.json(student)
}
