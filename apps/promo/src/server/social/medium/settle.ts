import { and, eq } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoMediumArticles, promoMediumListItems, promoMediumResponses } from "./schema"

/**
 * Writes a failure onto the Medium row a failed write job carried, when the
 * job failed before its own code could: refused at the door (retired,
 * paused, no browser), or abandoned when its browser stopped part-way. A
 * row already marked by its own code is left as it is.
 */
export async function settleFailedMediumJob(
  job: { id: string; kind: string },
  message: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const error = message.slice(0, 2_000)
  if (job.kind === "medium_respond") {
    await db
      .update(promoMediumResponses)
      .set({ status: "failed", lastError: error })
      .where(and(eq(promoMediumResponses.jobId, job.id), eq(promoMediumResponses.status, "waiting")))
  } else if (job.kind === "medium_publish") {
    await db
      .update(promoMediumArticles)
      .set({ status: "failed", lastError: error, updatedAt: new Date() })
      .where(and(eq(promoMediumArticles.jobId, job.id), eq(promoMediumArticles.status, "waiting")))
  } else if (job.kind === "medium_list_add") {
    await db
      .update(promoMediumListItems)
      .set({ status: "failed", lastError: error })
      .where(and(eq(promoMediumListItems.jobId, job.id), eq(promoMediumListItems.status, "waiting")))
  }
}
