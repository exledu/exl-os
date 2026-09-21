'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Calendar } from 'lucide-react'
import { CreateTermModal } from './TermsView'

export function TermsEmpty() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#002F67]">Terms</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Shared 10-week calendar. Creating a term seeds W1–W10 sessions for every non-archived recurring class.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div>
      )}

      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#002F67]">
          <Calendar className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-[#002F67]">No terms yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          Create your first term to start seeding the calendar. Pick the Monday of W1 and the system will lay down 10 weekly sessions for every non-archived recurring class.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[#002F67] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#011f42]"
        >
          <Plus className="h-3.5 w-3.5" /> New term
        </button>
      </div>

      {open && (
        <CreateTermModal
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); router.refresh() }}
          onError={setError}
        />
      )}
    </div>
  )
}
