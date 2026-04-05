import { StaffForm } from '@/components/staff/StaffForm'

export default function NewStaffPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-zinc-900">Add Staff Member</h1>
      <StaffForm />
    </div>
  )
}
