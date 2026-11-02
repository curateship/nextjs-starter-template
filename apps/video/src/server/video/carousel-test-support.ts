import { eq } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { createOwnedCarousel } from "@/server/video/carousels"
import { videoCarouselProjects } from "@/server/video/schema"

/**
 * For tests only: every carousel is in a carousel project
 * (workspace/docs/carousel-project-carousels.md), so a test making a
 * carousel gets the person's first carousel project, made the first time.
 */
export async function testCarouselProjectId(userId: string, database: CustomShellDb) {
  const [found] = await database
    .select({ id: videoCarouselProjects.id })
    .from(videoCarouselProjects)
    .where(eq(videoCarouselProjects.userId, userId))
    .limit(1)
  if (found) return found.id
  const at = now()
  const id = uuid()
  await database
    .insert(videoCarouselProjects)
    .values({ id, userId, name: "My carousels", createdAt: at, updatedAt: at })
  return id
}

/** A blank 4:5 carousel in the person's first carousel project. */
export async function makeTestCarousel(userId: string, name: string, database: CustomShellDb) {
  return createOwnedCarousel(userId, await testCarouselProjectId(userId, database), name, "4:5", database)
}
