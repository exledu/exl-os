import { IssuesPanel } from './IssuesPanel'
import { TodaySchedule } from './TodaySchedule'

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
