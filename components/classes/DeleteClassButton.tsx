'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DeleteClassButton({ id }: { id: number }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this class? This will remove all sessions and enrolments.')) return
    setLoading(true)
    await fetch(`/api/classes/${id}`, { method: 'DELETE' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-sm text-red-500 hover:underline disabled:opacity-50"
    >
      {loading ? '…' : 'Delete'}
    </button>
  )
}
