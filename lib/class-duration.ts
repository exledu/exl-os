// Per-year class duration rule. Every class at a given year level runs for
// exactly this many hours. Change values here in one place if the policy shifts.

export function durationMinutesForYear(yearLevel: number): number {
  if (yearLevel <= 9)  return 90    // Yr 7 / 8 / 9 → 1.5 hrs
  if (yearLevel <= 11) return 120   // Yr 10 / 11    → 2 hrs
  return 150                        // Yr 12          → 2.5 hrs
}

export function durationLabelForYear(yearLevel: number): string {
  const m = durationMinutesForYear(yearLevel)
  const h = m / 60
  return h === Math.floor(h) ? `${h} hr${h === 1 ? '' : 's'}` : `${h} hrs`
}

/** Given a HH:MM start and a year level, compute the HH:MM end time. */
export function computeEndTime(startTime: string, yearLevel: number): string {
  const [h, m] = startTime.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return startTime
  const total = h * 60 + m + durationMinutesForYear(yearLevel)
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}
