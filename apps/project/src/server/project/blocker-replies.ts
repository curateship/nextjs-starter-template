import { and, asc, eq, inArray } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { blockerReplyHeading, teamDayHref } from "@/lib/project/notices"
import { BLOCKER_REPLIES_PER_HOUR } from "@/lib/project/rules"
import { RateLimitError, enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireMembership, requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { writeAppNotices } from "@/server/project/notices"
import {
  projectBlockerReplies,
  projectCheckinItems,
  projectCheckins,
  projectTaskComments,
  projectTasks,
} from "@/server/project/schema"
import { recordTaskEvent } from "@/server/project/task-history"
import type { Actor } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * Answering a blocker where it was written, on the Team dashboard's
 * Check-ins tab. Tyler's rule (11 Oct 2026): anyone on the team replies to a
 * typed Blocker note; only people on a Stuck task's project reply to that
 * task, because its title is private to them. A reply is one line. The
 * blocked person gets "Maya answered your blocker", once per reply, and a
 * reply to a Stuck task also goes into that task's chat, so the answer stays
 * with the task. Replies never grow into a second chat: there is no reply to
 * a reply, and no reply under someone without a blocker.
 */

export type BlockerReply = {
  id: string
  body: string
  createdAt: string
  author: { id: string; name: string; avatarUrl: string } | null
  /** The Stuck task it answers; null for the Blocker note. */
  taskId: string | null
}

export async function addBlockerReply(
  actor: Actor,
  input: { checkinId: string; taskId: string | null; body: string },
  database = db
) {
  const membership = await requireMembership(actor.id, database)
  await countReply(actor.id, database)
  await database.transaction(async (tx) => {
    const [checkin] = await tx
      .select()
      .from(projectCheckins)
      .where(and(eq(projectCheckins.id, input.checkinId), eq(projectCheckins.teamId, membership.teamId)))
    if (!checkin?.checkedInAt) throw new Error(PROJECT_ERRORS.noBlockerHere)

    if (input.taskId) {
      await requireStuckPick(actor.id, checkin, input.taskId, tx)
    } else if (!checkin.noteBlocker) {
      throw new Error(PROJECT_ERRORS.noBlockerHere)
    }

    const at = now()
    await tx.insert(projectBlockerReplies).values({
      id: uuid(),
      checkinId: checkin.id,
      taskId: input.taskId,
      authorUserId: actor.id,
      body: input.body,
      createdAt: at,
    })
    if (input.taskId) {
      // Into the task's chat too. The blocked person hears about it once,
      // below, rather than also as "commented on a task".
      await tx.insert(projectTaskComments).values({
        id: uuid(),
        taskId: input.taskId,
        authorUserId: actor.id,
        body: input.body,
        createdAt: at,
      })
      await recordTaskEvent(tx, { taskId: input.taskId, kind: "commented", actorUserId: actor.id })
    }
    if (checkin.userId !== actor.id) {
      await writeAppNotices(tx, [
        {
          kind: "blocker_reply",
          recipientUserId: checkin.userId,
          actorUserId: actor.id,
          message: blockerReplyHeading(actor.name),
          detail: input.body,
          href: teamDayHref(checkin.day),
        },
      ])
    }
  })
}

/**
 * The task must be one of that check-in's picks and Stuck that day: Stuck at
 * the end of a saved day, or Stuck now on a day still going on. The replier
 * must be able to see it.
 */
async function requireStuckPick(
  userId: string,
  checkin: { id: string; closedAt: Date | null },
  taskId: string,
  database: ProjectDb
) {
  const [pick] = await database
    .select({ endStatus: projectCheckinItems.endStatus, liveStatus: projectTasks.status })
    .from(projectCheckinItems)
    .innerJoin(projectTasks, eq(projectTasks.id, projectCheckinItems.taskId))
    .where(
      and(
        eq(projectCheckinItems.checkinId, checkin.id),
        eq(projectCheckinItems.taskId, taskId),
        eq(projectCheckinItems.kind, "pick")
      )
    )
  const stuck = pick && (checkin.closedAt ? pick.endStatus : pick.liveStatus) === "stuck"
  if (!stuck) throw new Error(PROJECT_ERRORS.noBlockerHere)
  await requireTaskAccess(userId, taskId, database).catch((error: unknown) => {
    if (error instanceof Error && error.message === PROJECT_ERRORS.taskNotFound) {
      throw new Error(PROJECT_ERRORS.stuckTaskNotYours)
    }
    throw error
  })
}

async function countReply(userId: string, database: typeof db) {
  try {
    await enforceRateLimit(
      `project-blocker-reply:${userId}`,
      { maxAttempts: BLOCKER_REPLIES_PER_HOUR, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof RateLimitError) throw new Error(PROJECT_ERRORS.tooManyReplies)
    throw error
  }
}

/** The replies under these check-ins, oldest first. */
export async function repliesFor(checkinIds: string[], database: ProjectDb = db) {
  if (checkinIds.length === 0) return new Map<string, BlockerReply[]>()
  const rows = await database
    .select({
      reply: projectBlockerReplies,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
    })
    .from(projectBlockerReplies)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectBlockerReplies.authorUserId))
    .where(inArray(projectBlockerReplies.checkinId, checkinIds))
    .orderBy(asc(projectBlockerReplies.createdAt))
  const byCheckin = new Map<string, BlockerReply[]>()
  for (const { reply, name, avatarUrl } of rows) {
    const list = byCheckin.get(reply.checkinId) ?? []
    list.push({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      author:
        reply.authorUserId && name !== null
          ? { id: reply.authorUserId, name, avatarUrl: avatarUrl ?? "" }
          : null,
      taskId: reply.taskId,
    })
    byCheckin.set(reply.checkinId, list)
  }
  return byCheckin
}
