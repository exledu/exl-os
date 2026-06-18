// Centralised tuition pricing. Used by invoicing + the finance forecast.

export const TERMLY_PRICE: Record<number, number> = {
  12: 1375,
  11: 1100,
  10: 980,
  9:  660,
  8:  660,
  7:  660,
}

export const EARLY_BIRD_DISCOUNT: Record<number, number> = {
  12: 75,
  11: 50,
  10: 50,
  9:  50,
  8:  50,
  7:  50,
}

// Admin pay started T3 2026: 10 weeks × 6 hrs/week × $26/hr = $1,560 per term.
const ADMIN_WEEKS_PER_TERM = 10
const ADMIN_HOURS_PER_WEEK = 6
const ADMIN_HOURLY_RATE    = 26
const ADMIN_COST_START_YEAR = 2026
const ADMIN_COST_START_TERM = 3

export function adminCostFor(year: number, term: number): number {
  const before = year < ADMIN_COST_START_YEAR
    || (year === ADMIN_COST_START_YEAR && term < ADMIN_COST_START_TERM)
  if (before) return 0
  return ADMIN_WEEKS_PER_TERM * ADMIN_HOURS_PER_WEEK * ADMIN_HOURLY_RATE
}

export function getMultiSubjectDiscount(subjectCount: number): { percent: number; label: string } {
  if (subjectCount >= 3) return { percent: 10, label: '3+ subjects (-10%)' }
  if (subjectCount === 2) return { percent:  5, label: '2 subjects (-5%)' }
  return { percent: 0, label: '' }
}
