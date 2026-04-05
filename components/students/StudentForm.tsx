'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface YearLevel { id: number; level: number }

export function StudentForm() {
  const router = useRouter()
  const [yearLevels, setYearLevels] = useState<YearLevel[]>([])
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [school, setSchool] = useState('')
  const [yearLevelId, setYearLevelId] = useState('')
  const [parentFirstName, setParentFirstName] = useState('')
  const [parentLastName, setParentLastName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/year-levels').then(r => r.json()).then(setYearLevels)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          lastName:        lastName || null,
          email:           email || null,
          phone:           phone || null,
          school:          school || null,
          yearLevelId:     Number(yearLevelId),
          parentFirstName: parentFirstName || null,
          parentLastName:  parentLastName || null,
          parentEmail:     parentEmail || null,
          parentPhone:     parentPhone || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save student')
      router.push('/students')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Student</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>First Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Alex" />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name</Label>
            <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Johnson" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Year Level</Label>
          <Select value={yearLevelId} onValueChange={(v) => setYearLevelId(v ?? '')} required>
            <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
            <SelectContent>
              {yearLevels.map(y => (
                <SelectItem key={y.id} value={y.id.toString()}>Year {y.level}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>School</Label>
          <Input value={school} onChange={e => setSchool(e.target.value)} placeholder="Castle Hill High School" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Student Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alex@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Student Mobile</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0400 000 000" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Parent / Guardian</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>First Name</Label>
            <Input value={parentFirstName} onChange={e => setParentFirstName(e.target.value)} placeholder="Chris" />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name</Label>
            <Input value={parentLastName} onChange={e => setParentLastName(e.target.value)} placeholder="Johnson" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Parent Email</Label>
            <Input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="chris@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Parent Mobile</Label>
            <Input value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="0400 000 000" />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Student'}</Button>
        <Button type="button" variant="outline" onClick={() => router.push('/students')}>Cancel</Button>
      </div>
    </form>
  )
}
