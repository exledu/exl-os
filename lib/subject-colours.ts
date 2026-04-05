// Colour palettes — 6 shades from lightest (index 0) to darkest (index 5)
const CHEMISTRY: string[] = ['#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239']
const PHYSICS:   string[] = ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59']
const MATHS:     string[] = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af']
const DEFAULT:   string[] = ['#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a']

// Year level → palette index, scoped to each subject's actual range
const MATHS_IDX: Record<number, number>     = { 7: 0, 8: 1, 9: 2, 10: 3, 11: 4, 12: 5 }
const CHEM_PHYS_IDX: Record<number, number> = { 11: 2, 12: 3 }

export function subjectColour(subject: string, yearLevel: number): string {
  if (/chem/i.test(subject)) return CHEMISTRY[CHEM_PHYS_IDX[yearLevel] ?? 2]
  if (/phys/i.test(subject)) return PHYSICS[CHEM_PHYS_IDX[yearLevel] ?? 2]
  if (/math/i.test(subject)) return MATHS[MATHS_IDX[yearLevel] ?? Math.min(Math.max(yearLevel - 7, 0), 5)]
  return DEFAULT[Math.min(Math.max(yearLevel - 7, 0), 5)]
}
