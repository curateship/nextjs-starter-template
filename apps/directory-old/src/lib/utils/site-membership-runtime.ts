import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { siteMemberships } from '@/lib/db/schema'

type UpsertSiteMembershipInput = {
  siteId: string
  userId: string
  role?: 'owner' | 'admin' | 'member'
  status?: 'active' | 'suspended'
  lastEngagedAt?: Date | null
  createdAt?: Date | null
}

const MEMBERSHIP_TOUCH_WINDOW_MS = 60 * 60 * 1000

export async function upsertSiteMembership(input: UpsertSiteMembershipInput) {
  const now = new Date()
  const role = input.role ?? 'member'
  const status = input.status ?? 'active'

  await db
    .insert(siteMemberships)
    .values({
      siteId: input.siteId,
      userId: input.userId,
      role,
      status,
      lastEngagedAt: input.lastEngagedAt ?? null,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [siteMemberships.siteId, siteMemberships.userId],
      set: {
        role,
        status,
        updatedAt: now,
        ...(input.lastEngagedAt ? { lastEngagedAt: input.lastEngagedAt } : {}),
      },
    })
}

export async function getActiveSiteMembership(siteId: string, userId: string) {
  const [membership] = await db
    .select({
      id: siteMemberships.id,
      lastEngagedAt: siteMemberships.lastEngagedAt,
    })
    .from(siteMemberships)
    .where(and(
      eq(siteMemberships.siteId, siteId),
      eq(siteMemberships.userId, userId),
      eq(siteMemberships.status, 'active')
    ))
    .limit(1)

  return membership || null
}

export async function touchSiteMembershipActivity(siteId: string, userId: string, touchedAt: Date = new Date()) {
  const cutoff = new Date(touchedAt.getTime() - MEMBERSHIP_TOUCH_WINDOW_MS)
  const membership = await getActiveSiteMembership(siteId, userId)

  if (!membership) {
    return false
  }

  if (membership.lastEngagedAt && membership.lastEngagedAt >= cutoff) {
    return true
  }

  await db
    .update(siteMemberships)
    .set({
      lastEngagedAt: touchedAt,
      updatedAt: touchedAt,
    })
    .where(eq(siteMemberships.id, membership.id))

  return true
}
