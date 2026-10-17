import { and, asc, eq, inArray } from "drizzle-orm"

import {
  isMemberEvent,
  memberEventNode,
  type MemberEvent,
} from "@/lib/automations/nodes/member-event"
import { now } from "@/server/auth/security"
import {
  automationSubjectLabel,
  fireAutomationTrigger,
} from "@/server/automations/triggers"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellNotifications,
  customShellUsers,
  customShellWorkspaces,
  type CustomShellUser,
} from "@/server/schema"

/** Starts every live flow watching this one member lifecycle change. */
export async function emitMemberEvent(
  event: MemberEvent,
  user: Pick<CustomShellUser, "id" | "name" | "email" | "currentWorkspaceId">,
  database: CustomShellDb = db
): Promise<number> {
  const workspaceId =
    user.currentWorkspaceId ?? (await oldestWorkspaceId(database))
  if (!workspaceId) return 0

  return fireAutomationTrigger(
    memberEventNode.kind,
    isMemberEvent(event),
    {
      subjectUserId: user.id,
      workspaceId,
      memberEvent: event,
      subjectLabel: automationSubjectLabel(user),
      // Member and event make the deduplication key. A webhook replay, a second
      // verification link, or two servers observing it still creates one run.
      key: `${event}:${user.id}`,
      facts: { event },
    },
    database
  )
}

/** Loads an active member before emitting an event known only by their id. */
export async function emitMemberEventForUser(
  event: MemberEvent,
  userId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [user] = await database
    .select({
      id: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
      currentWorkspaceId: customShellUsers.currentWorkspaceId,
    })
    .from(customShellUsers)
    .where(
      and(
        eq(customShellUsers.id, userId),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)

  return user ? emitMemberEvent(event, user, database) : 0
}

/** New accounts belong to the first site until sign-in points them elsewhere. */
async function oldestWorkspaceId(database: CustomShellDb) {
  const [workspace] = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellWorkspaces)
    .orderBy(asc(customShellWorkspaces.createdAt))
    .limit(1)
  return workspace?.id ?? null
}

/**
 * Stops unfinished runs about accounts that have just been closed.
 * The account-closing transaction is passed in so the status, runs, sessions,
 * and obsolete approval notices change together or not at all.
 */
export async function cancelPendingMemberRuns(
  userIds: string[],
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  if (userIds.length === 0) return 0

  const canceled = await database
    .update(customShellAutomationRuns)
    .set({
      status: "canceled",
      error: "Stopped because the member's account was closed.",
      finishedAt: timestamp,
      claimToken: null,
      claimedAt: null,
      updatedAt: timestamp,
    })
    .where(
      and(
        inArray(customShellAutomationRuns.subjectUserId, userIds),
        inArray(customShellAutomationRuns.status, [
          "active",
          "waiting_approval",
        ])
      )
    )
    .returning({ id: customShellAutomationRuns.id })

  if (canceled.length > 0) {
    await database.delete(customShellNotifications).where(
      inArray(
        customShellNotifications.automationRunId,
        canceled.map((run) => run.id)
      )
    )
  }

  return canceled.length
}
