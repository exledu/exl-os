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

export function getMultiSubjectDiscount(subjectCount: number): { percent: number; label: string } {
  if (subjectCount >= 3) return { percent: 10, label: '3+ subjects (-10%)' }
  if (subjectCount === 2) return { percent:  5, label: '2 subjects (-5%)' }
  return { percent: 0, label: '' }
}
