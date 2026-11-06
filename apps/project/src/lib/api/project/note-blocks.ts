import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { teamScope } from "@/lib/api/project/scope"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import { findMembership, inTeam, isSiteAdmin } from "@/server/project/access"
import { loadNoteRecordCard, loadNoteTaskCards } from "@/server/project/note-blocks"
import { previewPage } from "@/server/project/page-preview"
import { searchPhotos, trackDownload, unsplashEnabled } from "@/server/project/unsplash"

export type { NoteRecordCard, NoteTaskCard } from "@/server/project/note-blocks"
export type { PagePreview } from "@/server/project/page-preview"
export type { UnsplashPhoto } from "@/server/project/unsplash"

const id = z.string().min(1).max(36)

/** The most Task cards one note asks about at once. */
const MAX_CARDS = 50

/**
 * Unsplash allows few calls an hour and a web page card visits another site,
 * so one person can only ask so often: generous for writing, a stop on a script.
 */
async function limit(kind: string, userId: string, maxAttempts: number) {
  try {
    await enforceRateLimit(`project-${kind}:${userId}`, { maxAttempts, windowSeconds: 10 * 60 })
  } catch (error) {
    if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(PROJECT_ERRORS.tooManySearches)
    throw error
  }
}

/**
 * Unsplash and web pages are for people who write Project notes: someone on a
 * team, or the site admin, who is on none. Any other signed-in account of the
 * shell can't make Project's server visit a page or spend its Unsplash calls.
 */
async function requireNoteWriter(userId: string) {
  if (await findMembership(userId)) return
  if (await isSiteAdmin(userId)) return
  throw new Error(PROJECT_ERRORS.noTeam)
}

const loadNoteServicesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () => ({ unsplash: unsplashEnabled() }))

const searchUnsplashFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ query: z.string().trim().min(1).max(100), page: z.number().int().min(1).max(50) }))
  .handler(async ({ data, context }) => {
    await requireNoteWriter(context.user.id)
    await limit("unsplash", context.user.id, 60)
    return searchPhotos(data.query, data.page)
  })

const pickUnsplashPhotoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ downloadLocation: z.string().max(500) }))
  .handler(async ({ data, context }) => {
    await requireNoteWriter(context.user.id)
    await limit("unsplash-pick", context.user.id, 60)
    return trackDownload(data.downloadLocation)
  })

const loadTaskCardsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ taskIds: z.array(id).min(1).max(MAX_CARDS), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadNoteTaskCards(context.user.id, data.taskIds)))

const loadRecordCardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ taskId: id, ...teamScope }))
  .handler(async ({ data, context }) => {
    await limit("record-card", context.user.id, 300)
    return inTeam(data.teamId, () => loadNoteRecordCard(context.user, data.taskId))
  })

const previewPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ url: z.string().trim().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    await requireNoteWriter(context.user.id)
    await limit("page-preview", context.user.id, 120)
    return previewPage(data.url)
  })

/** Whether Unsplash has a key on this server, for the Image block's Unsplash button. */
export function loadNoteServices() {
  return loadNoteServicesFn()
}
export function searchUnsplash(query: string, page: number) {
  return searchUnsplashFn({ data: { query, page } })
}
/** Tells Unsplash a photo was used, as their rules require. */
export function pickUnsplashPhoto(downloadLocation: string) {
  return pickUnsplashPhotoFn({ data: { downloadLocation } })
}
/** What each Task card in a note shows this reader. */
export function loadTaskCards(taskIds: string[], teamId?: string) {
  return loadTaskCardsFn({ data: { taskIds, teamId } })
}
/** The task's Video or Promo record as its card shows it, or null when the task points at none. */
export function loadRecordCard(taskId: string, teamId?: string) {
  return loadRecordCardFn({ data: { taskId, teamId } })
}
/** A Web page card's title, site icon and picture. */
export function previewNotePage(url: string) {
  return previewPageFn({ data: { url } })
}
