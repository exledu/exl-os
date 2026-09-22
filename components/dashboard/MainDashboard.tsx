'use client'

import dynamic from 'next/dynamic'
import { IssuesPanel } from './IssuesPanel'
import { PanelLoading } from '@/components/ui/spinner'

const TodaySchedule = dynamic(
  () => import('./TodaySchedule').then(m => m.TodaySchedule),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col h-full rounded-xl border border-zinc-200 bg-white shadow-sm">
        <PanelLoading label="Loading schedule…" />
      </div>
    ),
  },
)

export function MainDashboard() {
  return (
    <div className="grid grid-cols-[3fr_2fr] gap-4" style={{ height: 'calc(100vh - 140px)' }}>
      {/* LHS — Outstanding issues */}
      <IssuesPanel />

      {/* RHS — Today's schedule */}
      <TodaySchedule />
    </div>
  )
}
