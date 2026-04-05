import { StudentForm } from '@/components/students/StudentForm'

export default function NewStudentPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-zinc-900">Add Student</h1>
      <StudentForm />
    </div>
  )
}
