'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const AVAILABLE_ROLES = ['admin', 'tutor'] as const

export function StaffForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<string[]>(['tutor'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleRole(role: string) {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (roles.length === 0) {
      setError('Select at least one role')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || null, roles }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message ?? 'Failed to save staff member')
      }
      router.push('/staff')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label>Full Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Jane Smith" />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="jane@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label>Phone (optional)</Label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0400 000 000" />
      </div>
      <div className="space-y-1.5">
        <Label>Roles</Label>
        <div className="flex gap-2">
          {AVAILABLE_ROLES.map(role => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                roles.includes(role)
                  ? role === 'admin'
                    ? 'bg-[#002F67] text-white border-[#002F67]'
                    : 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Staff Member'}</Button>
        <Button type="button" variant="outline" onClick={() => router.push('/staff')}>Cancel</Button>
      </div>
    </form>
  )
}
