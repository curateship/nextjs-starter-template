import { and, eq } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoXDrafts, promoXFollows, promoXListItems, promoXPosts, promoXReplies } from "./schema"

/**
 * Writes a failure onto the X row a failed write job carried, when the job
 * failed before its own code could: refused at the door (retired, paused, no
 * browser), or abandoned when its browser stopped part-way. A row already
 * marked by its own code is left as it is.
 */
export async function settleFailedXJob(
  job: { id: string; kind: string },
  message: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const error = message.slice(0, 2_000)
  if (job.kind === "x_reply") {
    await db
      .update(promoXReplies)
      .set({ status: "failed", lastError: error })
      .where(and(eq(promoXReplies.jobId, job.id), eq(promoXReplies.status, "waiting")))
  } else if (job.kind === "x_publish") {
    await db
      .update(promoXPosts)
      .set({ status: "failed", lastError: error, updatedAt: new Date() })
      .where(and(eq(promoXPosts.jobId, job.id), eq(promoXPosts.status, "waiting")))
  } else if (job.kind === "x_list_add") {
    await db
      .update(promoXListItems)
      .set({ status: "failed", lastError: error })
      .where(and(eq(promoXListItems.jobId, job.id), eq(promoXListItems.status, "waiting")))
  } else if (job.kind === "x_follow") {
    await db
      .update(promoXFollows)
      .set({ status: "failed" })
      .where(and(eq(promoXFollows.jobId, job.id), eq(promoXFollows.status, "waiting")))
  }
}

/**
 * Undoes the X row a waiting write job carried when the job is taken off the
 * queue from the Jobs dashboard, the way the ten seconds to take it back do:
 * a reply goes and its draft is a draft again, a post goes back to its draft
 * (or to Failed when part of a thread is already on X). Nothing was sent.
 */
export async function takeBackXJob(job: { id: string; kind: string }, db: CustomShellDb = defaultDb): Promise<void> {
  if (job.kind === "x_reply") {
    const gone = await db
      .delete(promoXReplies)
      .where(and(eq(promoXReplies.jobId, job.id), eq(promoXReplies.status, "waiting")))
      .returning({ draftId: promoXReplies.draftId })
    for (const row of gone) {
      if (row.draftId) await db.update(promoXDrafts).set({ status: "draft" }).where(eq(promoXDrafts.id, row.draftId))
    }
  } else if (job.kind === "x_publish") {
    const rows = await db
      .select({ id: promoXPosts.id, pieces: promoXPosts.pieces })
      .from(promoXPosts)
      .where(and(eq(promoXPosts.jobId, job.id), eq(promoXPosts.status, "waiting")))
    for (const row of rows) {
      const back = row.pieces.some((piece) => piece.postId) ? "failed" : "draft"
      await db.update(promoXPosts).set({ status: back, jobId: null, updatedAt: new Date() }).where(eq(promoXPosts.id, row.id))
    }
  } else {
    await settleFailedXJob(job, "Taken off the queue on the Jobs dashboard. Nothing was sent.", db)
  }
}
