import { and, eq, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoJobs } from "../schema"

import { promoLinkedinComments, promoLinkedinConnects, promoLinkedinDrafts, promoLinkedinInvites, promoLinkedinPosts } from "./schema"

/**
 * Writes a failure onto the LinkedIn row a failed write job carried, when the
 * job failed before its own code could: refused at the door (retired,
 * paused, no browser), or abandoned when its browser stopped part-way. A row
 * already marked by its own code is left as it is. A pasted sign-in code is
 * wiped from its job.
 */
export async function settleFailedLinkedinJob(
  job: { id: string; kind: string },
  message: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const error = message.slice(0, 2_000)
  if (job.kind === "linkedin_code") {
    // A pasted code never outlives its job's one try.
    await db.update(promoJobs).set({ payload: sql`${promoJobs.payload} - 'code'` }).where(eq(promoJobs.id, job.id))
  } else if (job.kind === "linkedin_comment") {
    await db
      .update(promoLinkedinComments)
      .set({ status: "failed", lastError: error })
      .where(and(eq(promoLinkedinComments.jobId, job.id), eq(promoLinkedinComments.status, "waiting")))
  } else if (job.kind === "linkedin_publish") {
    await db
      .update(promoLinkedinPosts)
      .set({ status: "failed", lastError: error, updatedAt: new Date() })
      .where(and(eq(promoLinkedinPosts.jobId, job.id), eq(promoLinkedinPosts.status, "waiting")))
  } else if (job.kind === "linkedin_connect") {
    await db
      .update(promoLinkedinConnects)
      .set({ status: "failed", lastError: error })
      .where(and(eq(promoLinkedinConnects.jobId, job.id), eq(promoLinkedinConnects.status, "waiting")))
  } else if (job.kind === "linkedin_accept") {
    await db
      .update(promoLinkedinInvites)
      .set({ status: "failed", lastError: error })
      .where(and(eq(promoLinkedinInvites.jobId, job.id), eq(promoLinkedinInvites.status, "accepting")))
  }
}

/**
 * Undoes the LinkedIn row a waiting write job carried when the job is taken
 * off the queue from the Jobs dashboard, the way the ten seconds to take it
 * back do: a comment goes and its draft is a draft again, a post goes back to
 * its draft, a connection request goes, and an accept goes back to waiting.
 * Nothing was sent.
 */
export async function takeBackLinkedinJob(job: { id: string; kind: string }, db: CustomShellDb = defaultDb): Promise<void> {
  if (job.kind === "linkedin_comment") {
    const gone = await db
      .delete(promoLinkedinComments)
      .where(and(eq(promoLinkedinComments.jobId, job.id), eq(promoLinkedinComments.status, "waiting")))
      .returning({ draftId: promoLinkedinComments.draftId })
    for (const row of gone) {
      if (row.draftId) await db.update(promoLinkedinDrafts).set({ status: "draft" }).where(eq(promoLinkedinDrafts.id, row.draftId))
    }
  } else if (job.kind === "linkedin_publish") {
    await db
      .update(promoLinkedinPosts)
      .set({ status: "draft", jobId: null, updatedAt: new Date() })
      .where(and(eq(promoLinkedinPosts.jobId, job.id), eq(promoLinkedinPosts.status, "waiting")))
  } else if (job.kind === "linkedin_connect") {
    await db
      .delete(promoLinkedinConnects)
      .where(and(eq(promoLinkedinConnects.jobId, job.id), eq(promoLinkedinConnects.status, "waiting")))
  } else if (job.kind === "linkedin_accept") {
    await db
      .update(promoLinkedinInvites)
      .set({ status: "waiting", jobId: null })
      .where(and(eq(promoLinkedinInvites.jobId, job.id), eq(promoLinkedinInvites.status, "accepting")))
  }
}
