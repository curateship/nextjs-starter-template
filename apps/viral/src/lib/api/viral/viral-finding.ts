import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { CREATOR_PLATFORMS } from "@/lib/viral/creators"
import { adminGet, adminPost } from "@/server/guards"
import { loadVideoComments, type ViralComments } from "@/server/viral/comments"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { findSameIdea, loadSameIdea, type SameIdeaView } from "@/server/viral/same-idea"
import { markVideoSeen } from "@/server/viral/seen"
import { loadViralToday, searchEveryProject, type ViralSearchHit, type ViralToday } from "@/server/viral/today"

/**
 * Finding winners: the Today page and its search across every project, the
 * New mark, Top comments and "same idea, other creators"
 * (`workspace/docs/today-page.md`, `workspace/docs/finding-content.md`).
 * Admin only, like every Viral door. The owner comes from the session, never
 * from the request, and every project id is checked to be theirs.
 */

export type { SameIdeaView, ViralComments, ViralSearchHit, ViralToday }

const id = z.string().min(1).max(36)
const videoRef = z.object({
  platform: z.enum(CREATOR_PLATFORMS),
  platformVideoId: z.string().min(1).max(100),
})

const todayFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ViralToday> => loadViralToday(context.user.id))

/** Each project's best new and rising videos, and the vault's counts by status. */
export function loadViralTodayFn() {
  return todayFn()
}

const searchFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ q: z.string().max(200) }))
  .handler(async ({ data, context }): Promise<ViralSearchHit[]> => searchEveryProject(context.user.id, data.q))

/** Titles and channels in every project that isn't archived. */
export function searchEveryProjectFn(q: string) {
  return searchFn({ data: { q } })
}

const seenFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(videoRef)
  .handler(async ({ data, context }) => {
    await markVideoSeen(context.user.id, data)
  })

/** The video was opened on the right panel: its New mark clears for this person. */
export function markViralVideoSeenFn(video: z.infer<typeof videoRef>) {
  return seenFn({ data: video })
}

const commentsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(videoRef.extend({ projectId: id }))
  .handler(async ({ data, context }): Promise<ViralComments> => {
    const project = await requireOwnedViralProject(context.user.id, data.projectId)
    return loadVideoComments({ ...data, sample: project.isSample })
  })

/**
 * The 20 most-liked comments. A POST, because the first read of a YouTube
 * video spends a unit.
 */
export function loadVideoCommentsFn(input: z.infer<typeof videoRef> & { projectId: string }) {
  return commentsFn({ data: input })
}

const keptSameIdeaFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(videoRef.extend({ projectId: id }))
  .handler(async ({ data, context }): Promise<SameIdeaView | null> =>
    loadSameIdea(context.user.id, data.projectId, data)
  )

/** The last "same idea" search for this video in this project, or null. Spends nothing. */
export function loadSameIdeaFn(input: z.infer<typeof videoRef> & { projectId: string }) {
  return keptSameIdeaFn({ data: input })
}

const sameIdeaFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(videoRef.extend({ projectId: id }))
  .handler(async ({ data, context }): Promise<SameIdeaView> => findSameIdea(context.user.id, data.projectId, data))

/** Asks the AI for one search line and searches YouTube with it: about 1 cent and 102 units. */
export function findSameIdeaFn(input: z.infer<typeof videoRef> & { projectId: string }) {
  return sameIdeaFn({ data: input })
}
