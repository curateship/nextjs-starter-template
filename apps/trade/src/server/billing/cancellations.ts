import { and, asc, desc, eq, gt, inArray } from "drizzle-orm"

import type { CancellationReason } from "@/lib/billing/cancellation"
import { db, type CustomShellDb } from "@/server/db"
import { now } from "@/server/auth/security"
import {
  customShellCancellations,
  customShellPlans,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"

export type ScheduledCancellation = {
  userId: string
  name: string
  email: string
  planName: string
  endsAt: string
  reason: CancellationReason | null
  feedback: string | null
}

/** The next people due to leave, with their latest answer when they gave one. */
export async function listScheduledCancellations(
  limit: number,
  database: CustomShellDb = db
): Promise<ScheduledCancellation[]> {
  const leaving = await database
    .select({
      userId: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
      planName: customShellPlans.name,
      endsAt: customShellSubscriptions.currentPeriodEnd,
    })
    .from(customShellSubscriptions)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellSubscriptions.userId)
    )
    .innerJoin(
      customShellPlans,
      eq(customShellPlans.id, customShellSubscriptions.planId)
    )
    .where(
      and(
        eq(customShellSubscriptions.cancelAtPeriodEnd, true),
        inArray(customShellSubscriptions.status, [
          "active",
          "trialing",
          "past_due",
        ]),
        gt(customShellSubscriptions.currentPeriodEnd, now())
      )
    )
    .orderBy(asc(customShellSubscriptions.currentPeriodEnd))
    .limit(limit)

  const userIds = leaving.map((row) => row.userId)
  const answers = userIds.length
    ? await database
        .selectDistinctOn([customShellCancellations.userId])
        .from(customShellCancellations)
        .where(inArray(customShellCancellations.userId, userIds))
        .orderBy(
          customShellCancellations.userId,
          desc(customShellCancellations.createdAt)
        )
    : []
  const latestByUser = new Map(answers.map((answer) => [answer.userId, answer]))

  return leaving.flatMap((row) => {
    if (!row.endsAt) return []
    const latestAnswer = latestByUser.get(row.userId)
    // A person can leave, return, and leave again. Only attach an answer from
    // this scheduled end; a reason from their previous subscription is stale.
    const answer =
      latestAnswer?.endsAt.getTime() === row.endsAt.getTime()
        ? latestAnswer
        : undefined
    return [
      {
        userId: row.userId,
        name: row.name,
        email: row.email,
        planName: row.planName,
        endsAt: row.endsAt.toISOString(),
        reason: (answer?.reason as CancellationReason | null) ?? null,
        feedback: answer?.feedback ?? null,
      },
    ]
  })
}
