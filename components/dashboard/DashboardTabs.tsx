'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { MainDashboard } from './MainDashboard'
import { KpiStrip } from './KpiStrip'
import { PanelLoading } from '@/components/ui/spinner'

const CalendarView = dynamic(
  () => import('@/components/calendar/CalendarView').then(m => m.CalendarView),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm" style={{ height: 'calc(100vh - 140px)' }}>
        <PanelLoading label="Loading calendar…" />
      </div>
    ),
  },
)

const TABS = [
  { id: 'main', label: 'Main Dashboard' },
  { id: 'calendar', label: 'Calendar' },
] as const

type TabId = typeof TABS[number]['id']

export function DashboardTabs() {
  const [active, setActive] = useState<TabId>('main')

  return (
    <div className="space-y-5">
      {/* Header + tab pills */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-[#002F67]">Dashboard</h1>
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

      {/* KPI strip */}
      <KpiStrip />

      {/* Content */}
      <div key={active} className="animate-in fade-in-0 duration-200">
        {active === 'main' ? <MainDashboard /> : <CalendarView />}
      </div>
    </div>
  )
}
