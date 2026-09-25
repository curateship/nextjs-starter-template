import { z } from "zod"

import {
  clipSchema,
  MAX_TIMELINE_TRACKS,
  MAX_TRACK_CLIPS,
  type ProjectTimeline,
} from "./timeline-schema"
import { editorId } from "./timeline-utils"

/**
 * Clips copied out of one project, waiting to be pasted into another.
 *
 * They are kept in this browser's localStorage, so a copy outlives closing the
 * project and is offered in any project opened afterwards, but only on this
 * browser. Nothing is written to the server until the paste. Signing out does
 * not empty localStorage, so the copy carries the id of the person who made
 * it, and anybody else signed in on the same browser sees an empty clipboard.
 * Their text and file names are not theirs to paste.
 *
 * A copied clip is the whole clip: its trim, speed, volume, colour, fit, move,
 * text and style all travel. What does not travel is the file itself. The clip
 * names a file by its id, and the paste puts that file on the new project's
 * shelf. The one exception is a clip's blend into the clip before it, which
 * travels only when that clip was copied too.
 */

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]

/**
 * One copied clip. `startMs` counts from the start of the earliest copied clip
 * and `lane` from the highest lane copied from, so the group lands in the same
 * shape wherever it is pasted.
 */
export type ClipboardClip = { clip: Clip; lane: number }

// The copy is read back from storage anything could have written to, so it is
// checked against the same rules as a saved timeline. A value that fails is
// treated as an empty clipboard.
const clipboardSchema = z.object({
  ownerId: z.string().min(1),
  clips: z
    .array(
      z.object({
        clip: clipSchema,
        lane: z
          .number()
          .int()
          .min(0)
          .max(MAX_TIMELINE_TRACKS - 1),
      })
    )
    .min(1)
    .max(MAX_TRACK_CLIPS),
})

export const CLIP_CLIPBOARD_STORAGE_KEY = "video-clip-clipboard"

/**
 * The selected clips as a group ready to store, in timeline order. Ids that
 * name no clip are skipped; null when none of them do.
 */
export function copyClips(
  tracks: Track[],
  clipIds: string[]
): ClipboardClip[] | null {
  const wanted = new Set(clipIds)
  const picked: { clip: Clip; trackIndex: number }[] = []
  tracks.forEach((track, trackIndex) => {
    const inOrder = [...track.clips].sort((a, b) => a.startMs - b.startMs)
    inOrder.forEach((clip, index) => {
      if (!wanted.has(clip.id)) return
      const before = index > 0 ? inOrder[index - 1] : null
      // A blend belongs to the seam with the clip before. Without that clip
      // in the copy, the blend would land against whatever is on the new lane.
      const keepsBlend = !!before && wanted.has(before.id)
      picked.push({
        clip: keepsBlend ? clip : { ...clip, transition: undefined },
        trackIndex,
      })
    })
  })
  if (!picked.length) return null

  const firstMs = Math.min(...picked.map(({ clip }) => clip.startMs))
  const firstLane = Math.min(...picked.map(({ trackIndex }) => trackIndex))
  return picked
    .map(({ clip, trackIndex }) => ({
      clip: { ...clip, startMs: clip.startMs - firstMs },
      lane: trackIndex - firstLane,
    }))
    .sort((a, b) => a.clip.startMs - b.clip.startMs || a.lane - b.lane)
}

export function writeClipClipboard(ownerId: string, clips: ClipboardClip[]) {
  window.localStorage.setItem(
    CLIP_CLIPBOARD_STORAGE_KEY,
    JSON.stringify({ ownerId, clips })
  )
}

/** The copy `ownerId` made, or null when there is none of theirs. */
export function readClipClipboard(ownerId: string): ClipboardClip[] | null {
  let stored: unknown
  try {
    stored = JSON.parse(
      window.localStorage.getItem(CLIP_CLIPBOARD_STORAGE_KEY) ?? "null"
    )
  } catch {
    return null
  }
  const parsed = clipboardSchema.safeParse(stored)
  return parsed.success && parsed.data.ownerId === ownerId
    ? parsed.data.clips
    : null
}

/** Every file the copied clips use, once each. */
export function clipboardMediaIds(clips: ClipboardClip[]) {
  return Array.from(
    new Set(clips.flatMap(({ clip }) => (clip.mediaId ? [clip.mediaId] : [])))
  )
}

/**
 * The copied clips, ready to drop. Every clip gets a fresh id, so pasting the
 * same copy twice gives two sets of clips rather than two claims on one.
 *
 * A clip whose file has since been deleted keeps its place, its length and its
 * name, but loses the file. It is drawn as an empty block and the export shows
 * nothing there. "(file deleted)" is added to its name so the gap still says
 * what it was once the message about it has gone. Replace media on it puts
 * footage back.
 */
export function prepareClipsForPaste(
  clips: ClipboardClip[],
  missingMediaIds: string[]
): { clips: ClipboardClip[]; missingNames: string[] } {
  const missing = new Set(missingMediaIds)
  const missingNames = new Set<string>()
  const prepared = clips.map(({ clip, lane }) => {
    const fresh = { ...clip, id: editorId() }
    if (!clip.mediaId || !missing.has(clip.mediaId)) {
      return { clip: fresh, lane }
    }
    missingNames.add(clip.name)
    return {
      clip: {
        ...fresh,
        mediaId: undefined,
        url: undefined,
        name: `${clip.name} (file deleted)`.slice(0, 255),
      },
      lane,
    }
  })
  return { clips: prepared, missingNames: Array.from(missingNames) }
}
