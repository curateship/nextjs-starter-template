import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { userGet, userPost } from "@/server/guards"
import {
  analyseVideo,
  deleteVideo,
  finishUpload,
  listVideos,
  loadVideo,
  moveVideo,
  refreshVideos,
  retryVideo,
  saveLink,
  saveNote,
  tickStep,
} from "@/server/note/videos"
import {
  NO_FOLDER,
  NOTE_SAYS,
  NOTE_TEXT_MAX,
  type NoteVideoCard,
  type NoteVideoDetail,
  type NoteVideoPage,
} from "@/lib/note/videos"

/**
 * The saved videos, for the member who saved them. Open to every signed-in
 * member, not admins only (Tyler, 17 Oct 2026), and each function passes on
 * only the id the session resolved to, so every query is that person's own.
 *
 * Saving and Analyse write a row and return at once. The work happens in the
 * `note-videos` worker, which is why the screen asks again every few seconds
 * while a card is still moving.
 */

/** The app's own sentences pass through as they are; anything else is said plainly. */
const describe = createErrorMessage(
  {
    ...Object.fromEntries(Object.values(NOTE_SAYS).map((sentence) => [sentence, sentence])),
    AI_LIMIT_REACHED: NOTE_SAYS.aiLimitReached,
    RATE_LIMITED: NOTE_SAYS.tooManyLinks,
    SECRET_UNREADABLE: NOTE_SAYS.geminiKeyUnreadable,
    ENCRYPTION_NOT_CONFIGURED: NOTE_SAYS.geminiKeyUnreadable,
    "Only a video or sound file": "Only a video or sound file can be saved here.",
    "That step is not on the plan": "That step is not on the plan any more. Reload the video.",
    "is not set. Add it on Settings": "No storage bucket is set up yet. An admin can add one in Settings → General.",
  },
  "That did not work. Try again in a moment."
)

export function getNoteErrorMessage(error: unknown) {
  return describe(error)
}

const id = z.string().min(1).max(36)
const folder = z.union([z.literal(NO_FOLDER), id]).optional()

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      folder,
      search: z.string().max(200).optional(),
      cursor: z.string().max(100).nullable().optional(),
    })
  )
  .handler(
    async ({ data, context }): Promise<NoteVideoPage> =>
      listVideos(context.user.id, data)
  )

/** One page of cards, newest first, narrowed to a folder and a search. */
export function loadVideos(data: { folder?: string; search?: string; cursor?: string | null }) {
  return listFn({ data })
}

const refreshFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ ids: z.array(id).min(1).max(200) }))
  .handler(
    async ({ data, context }): Promise<NoteVideoCard[]> => refreshVideos(context.user.id, data.ids)
  )

/** The cards still moving, as they are now. A missing one is gone. */
export function refreshVideoCards(ids: string[]) {
  return refreshFn({ data: { ids } })
}

const readFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ id }))
  .handler(
    async ({ data, context }): Promise<NoteVideoDetail> => loadVideo(context.user.id, data.id)
  )

/** Everything the right panel shows about one video. */
export function loadVideoDetail(videoId: string) {
  return readFn({ data: { id: videoId } })
}

const saveLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ url: z.string().trim().min(1).max(2048) }))
  .handler(
    async ({ data, context }): Promise<{ video: NoteVideoCard; alreadySaved: boolean }> =>
      saveLink(context.user.id, data.url)
  )

/** Saves a link, or hands back the video it already saved. Downloads start on their own. */
export function saveVideoLink(url: string) {
  return saveLinkFn({ data: { url } })
}

const finishUploadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ mediaId: id }))
  .handler(
    async ({ data, context }): Promise<NoteVideoCard> =>
      finishUpload(context.user.id, data.mediaId)
  )

/** Turns a file the shell's uploader stored into a saved video. */
export function finishVideoUpload(mediaId: string) {
  return finishUploadFn({ data: { mediaId } })
}

const analyseFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(
    async ({ data, context }): Promise<NoteVideoDetail> => analyseVideo(context.user.id, data.id)
  )

/** Queues the video for the AI. Pressing twice is one job. */
export function analyseNoteVideo(videoId: string) {
  return analyseFn({ data: { id: videoId } })
}

const retryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(
    async ({ data, context }): Promise<NoteVideoDetail> => retryVideo(context.user.id, data.id)
  )

export function retryNoteVideo(videoId: string) {
  return retryFn({ data: { id: videoId } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }) => {
    await deleteVideo(context.user.id, data.id)
    return { id: data.id }
  })

/** Removes the video, its file, its cover and its analysis. */
export function deleteNoteVideo(videoId: string) {
  return deleteFn({ data: { id: videoId } })
}

const moveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id, folderId: id.nullable() }))
  .handler(
    async ({ data, context }): Promise<NoteVideoCard> =>
      moveVideo(context.user.id, data.id, data.folderId)
  )

/** Into a folder, or out of every folder with null. */
export function moveNoteVideo(videoId: string, folderId: string | null) {
  return moveFn({ data: { id: videoId, folderId } })
}

const tickFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id, index: z.number().int().min(0).max(100), done: z.boolean() }))
  .handler(
    async ({ data, context }): Promise<NoteVideoCard> =>
      tickStep(context.user.id, data.id, data.index, data.done)
  )

export function tickPlanStep(videoId: string, index: number, done: boolean) {
  return tickFn({ data: { id: videoId, index, done } })
}

const noteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id, note: z.string().max(NOTE_TEXT_MAX) }))
  .handler(
    async ({ data, context }): Promise<NoteVideoCard> =>
      saveNote(context.user.id, data.id, data.note)
  )

export function saveVideoNote(videoId: string, note: string) {
  return noteFn({ data: { id: videoId, note } })
}
