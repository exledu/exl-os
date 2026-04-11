'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { InvoicingView } from '@/components/invoicing/InvoicingView'
import { TermTracker } from '@/components/invoicing/TermTracker'

const TABS = [
  { id: 'invoicing', label: 'Invoicing' },
  { id: 'tracker', label: 'Term Tracker' },
] as const

type TabId = typeof TABS[number]['id']

export default function InvoicingPage() {
  const [active, setActive] = useState<TabId>('invoicing')

  return (
    <div className="space-y-5 h-[calc(100vh-48px)]">
      {/* Header + tab pills */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-[#002F67]">Invoicing</h1>
        <div className="flex rounded-xl border border-gray-200 bg-gray-100/80 p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200',
                active === tab.id
                  ? 'bg-white text-[#002F67] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {active === 'invoicing' ? <InvoicingView /> : <TermTracker />}
    </div>
  )
}
