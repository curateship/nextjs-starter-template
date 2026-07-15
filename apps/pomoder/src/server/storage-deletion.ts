import { asc, eq } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { logger } from "@/server/observability"
import { deleteMediaObject } from "@/server/pomoder-media"
import { storageDeletionJobs } from "@/server/schema"

export async function processStorageDeletionJobs(
  database: PomoderDb = db,
  removeObject: (storageKey: string) => Promise<void> = deleteMediaObject
) {
  const jobs = await database
    .select()
    .from(storageDeletionJobs)
    .orderBy(asc(storageDeletionJobs.createdAt))
    .limit(25)
  for (const job of jobs) {
    try {
      await removeObject(job.storageKey)
      await database
        .delete(storageDeletionJobs)
        .where(eq(storageDeletionJobs.id, job.id))
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 200)
          : "STORAGE_DELETE_FAILED"
      await database
        .update(storageDeletionJobs)
        .set({
          attempts: job.attempts + 1,
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(storageDeletionJobs.id, job.id))
      logger.warn(
        {
          event: "storage_delete_failed",
          jobId: job.id,
          attempts: job.attempts + 1,
        },
        "Media object deletion will be retried"
      )
    }
  }
  return jobs.length
}
