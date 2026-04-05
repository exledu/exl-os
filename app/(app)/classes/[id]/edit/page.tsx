import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
import { ClassForm } from '@/components/classes/ClassForm'
import { notFound } from 'next/navigation'

export default async function EditClassPage(props: PageProps<'/classes/[id]/edit'>) {
  const { id } = await props.params
  const cls = await prisma.class.findUnique({ where: { id: Number(id) } })
  if (!cls) notFound()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-zinc-900">Edit Class</h1>
      <ClassForm
        initial={{
          id: cls.id,
          subjectId: cls.subjectId,
          yearLevelId: cls.yearLevelId,
          staffId: cls.staffId,
          roomId: cls.roomId,
          maxCapacity: cls.maxCapacity,
          isRecurring: cls.isRecurring,
          dayOfWeek: cls.dayOfWeek,
          startTime: cls.startTime,
          endTime: cls.endTime,
          recurrenceStart: cls.recurrenceStart?.toISOString() ?? null,
          recurrenceEnd: cls.recurrenceEnd?.toISOString() ?? null,
          sessionDate: cls.sessionDate?.toISOString() ?? null,
        }}
      />
    </div>
  )
}
