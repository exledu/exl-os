// Shared compensation logic — used by /api/payroll (per-tutor breakdown)
// and /api/finance/forecast (term-level tutor-cost roll-up).
//
// Rule: $40/hr for 1–2 students, +$2/hr per student beyond 2, capped at
// 6 students → $48/hr.

export function rateFor(students: number): number {
  if (students <= 2) return 40
  if (students >= 6) return 48
  return 40 + (students - 2) * 2
}

export function parseHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60
}
