'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'

export function FinanceGate() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        setError('Incorrect password')
        setSubmitting(false)
        return
      }
      router.refresh()
    } catch {
      setError('Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm border border-gray-100"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#002F67]">Financial Forecast</h1>
            <p className="text-xs text-gray-500">Enter password to access</p>
          </div>
        </div>

        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          placeholder="Password"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
        />

        {error && (
          <p className="mt-2 text-xs text-rose-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-4 w-full rounded-lg bg-[#002F67] py-2 text-sm font-medium text-white hover:bg-[#011f42] disabled:opacity-50"
        >
          {submitting ? 'Checking...' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
