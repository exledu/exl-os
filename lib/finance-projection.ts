// Forward-projection helpers for the finance forecast tab.
//
// Schooling-year rollover rules (Australian HSC calendar):
//   T1 → T2, T2 → T3: no movement (continuing school year)
//   T3 → T4:          drop Yr 12 (HSC done). Yr 11 → Yr 12 (early-prep convention)
//   T4 → T1 (next):   Yr 7→8, Yr 8→9, Yr 9→10, Yr 10→11. Yr 12 stays Yr 12.
//
// So a student is in Yr 11 for 3 terms (T1-T3) and Yr 12 for 4 terms
// (T4 of the prior calendar year + T1-T3 of the next).

export interface TermPos { year: number; term: number }
export interface ProjectedStudent { studentId: number; yearLevel: number; subjectIds: number[] }

export function nextBoundary(pos: TermPos): TermPos {
  if (pos.term < 4) return { year: pos.year, term: pos.term + 1 }
  return { year: pos.year + 1, term: 1 }
}

function applyBoundary(students: ProjectedStudent[], from: TermPos, to: TermPos): ProjectedStudent[] {
  // T3 → T4 (same year): drop Yr 12, Yr 11 becomes Yr 12
  if (from.year === to.year && from.term === 3 && to.term === 4) {
    return students
      .filter(s => s.yearLevel !== 12)
      .map(s => (s.yearLevel === 11 ? { ...s, yearLevel: 12 } : s))
  }
  // T4 → T1 (next year): juniors move up by one. Yr 12 stays Yr 12.
  if (to.year === from.year + 1 && from.term === 4 && to.term === 1) {
    return students.map(s => (s.yearLevel <= 10 ? { ...s, yearLevel: s.yearLevel + 1 } : s))
  }
  // T1→T2, T2→T3: no change
  return students
}

/** Compare two (year, term) positions. Negative if a < b, 0 if equal, positive if a > b. */
export function compareTerm(a: TermPos, b: TermPos): number {
  return (a.year * 4 + a.term) - (b.year * 4 + b.term)
}

/** Roll a baseline student snapshot forward through all boundaries to the target term. */
export function projectStudents(
  baseline: ProjectedStudent[],
  from:     TermPos,
  to:       TermPos,
): ProjectedStudent[] {
  if (compareTerm(to, from) <= 0) return baseline
  let current = baseline
  let pos = from
  while (pos.year !== to.year || pos.term !== to.term) {
    const next = nextBoundary(pos)
    current = applyBoundary(current, pos, next)
    pos = next
  }
  return current
}

/** Bucket which positionally-defined "current term" today falls into.
 *  T1 = Jan-Mar, T2 = Apr-Jun, T3 = Jul-Sep, T4 = Oct-Dec. */
export function currentTermPos(now: Date = new Date()): TermPos {
  const m = now.getMonth()
  const term = m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4
  return { year: now.getFullYear(), term }
}
