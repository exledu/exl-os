import { prisma } from './db'
import { auth } from '@/auth'

/**
 * Log an OS action (automatic) performed by a staff member.
 * Fire-and-forget — does not throw, does not block the caller.
 */
export function logAction(params: {
  staffId: number
  type: string
  description: string
  metadata?: Record<string, unknown>
}) {
  prisma.staffAction.create({
    data: {
      staffId: params.staffId,
      type: params.type,
      automatic: true,
      description: params.description,
      metadata: (params.metadata as never) ?? undefined,
    },
  }).catch(() => {}) // fire-and-forget, never block the main operation
}

/**
 * Resolve the current staff member from the auth session.
 * Returns null if the user is not matched to a staff record.
 */
export async function getActorStaffId(): Promise<number | null> {
  try {
    const session = await auth()
    if (!session?.user?.email) return null
    const staff = await prisma.staff.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    return staff?.id ?? null
  } catch {
    return null
  }
}

/**
 * Resolve a staff member ID by name (for attributing actions to the assigned person).
 * Returns null if no match found.
 */
export async function getStaffIdByName(name: string): Promise<number | null> {
  try {
    const staff = await prisma.staff.findFirst({
      where: { name },
      select: { id: true },
    })
    return staff?.id ?? null
  } catch {
    return null
  }
}
