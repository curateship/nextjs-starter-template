import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { toast } from "sonner"

import {
  attachPastedMedia,
  getVideoMediaErrorMessage,
} from "@/lib/api/video/media"
import {
  clipboardMediaIds,
  copyClips,
  prepareClipsForPaste,
  readClipClipboard,
  writeClipClipboard,
} from "@/lib/video/clip-clipboard"
import {
  MAX_TIMELINE_TRACKS,
  MAX_TRACK_CLIPS,
} from "@/lib/video/timeline-schema"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  findClip,
  useEditorRuntime,
  type EditorStore,
} from "@/components/video-editor/editor-store"

const authenticatedRoute = getRouteApi("/_authenticated")

// Editors with a paste still waiting on the server. A second paste meanwhile
// would land the same copy twice. It is kept per editor rather than per call
// of the hook, because the keyboard and the toolbar button each call it.
const pasting = new WeakSet<EditorStore>()

function clipCount(count: number) {
  return count === 1 ? "1 clip" : `${count} clips`
}

const listFormat = new Intl.ListFormat("en", { type: "conjunction" })

/**
 * Copy and paste of clips between projects, for the keyboard shortcuts and the
 * timeline's buttons alike.
 *
 * Copy takes every selected clip. Paste drops the copy at the playhead, on the
 * lane of the selected clip or the top lane when nothing is selected, after
 * putting the files the clips use on this project's shelf.
 */
export function useClipClipboard() {
  const { store, dispatch, clock, projectId } = useEditorRuntime()
  const { user } = authenticatedRoute.useLoaderData()

  const copy = React.useCallback(() => {
    const { tracks, selectedClipIds } = store.getSnapshot().state
    const clips = copyClips(tracks, selectedClipIds)
    if (!clips) {
      showErrorToast(
        "Select a clip to copy first. Hold Shift and click to pick more than one."
      )
      return
    }
    try {
      writeClipClipboard(user.id, clips)
    } catch {
      showErrorToast(
        "This browser would not keep the copy. Its storage may be full or switched off."
      )
      return
    }
    dismissErrorToast()
    toast.success(`Copied ${clipCount(clips.length)}.`)
  }, [store, user.id])

  const paste = React.useCallback(async () => {
    if (pasting.has(store)) return
    const copied = readClipClipboard(user.id)
    if (!copied) {
      showErrorToast(
        "There is nothing to paste. Select clips in any project and copy them first."
      )
      return
    }
    // Where the playhead is at the moment of pasting, not once the server
    // has answered.
    const atMs = clock.getTime()
    pasting.add(store)
    dismissErrorToast()
    try {
      const mediaIds = clipboardMediaIds(copied)
      const { missingMediaIds } = mediaIds.length
        ? await attachPastedMedia(projectId, mediaIds)
        : { missingMediaIds: [] }
      if (missingMediaIds.length < mediaIds.length) store.refreshMediaShelf()

      const { clips, missingNames } = prepareClipsForPaste(
        copied,
        missingMediaIds
      )
      const before = store.getSnapshot().state
      const selected = before.selectedClipId
        ? findClip(before.tracks, before.selectedClipId)
        : null
      dispatch({
        type: "PASTE_CLIPS",
        clips,
        atMs,
        trackId: selected?.track.id,
      })
      if (store.getSnapshot().state === before) {
        showErrorToast(
          `There is no room for the pasted clips. A project holds ${MAX_TIMELINE_TRACKS} tracks of up to ${MAX_TRACK_CLIPS} clips each.`
        )
        return
      }

      if (missingNames.length) {
        // A warning rather than the red failure slot: the paste worked, and
        // the auto-save that follows it clears any red message when it lands.
        // It stays until closed, because it names a file to go and deal with.
        const plural = missingNames.length > 1
        toast.warning(
          `Pasted ${clipCount(clips.length)}. ${listFormat.format(missingNames)} ${
            plural ? "are" : "is"
          } no longer in your media library, so ${
            plural ? "their clips were" : "its clip was"
          } pasted as an empty space. Use Replace media on it to put footage back.`,
          { duration: Infinity }
        )
      } else {
        toast.success(`Pasted ${clipCount(clips.length)}.`)
      }
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      pasting.delete(store)
    }
  }, [clock, dispatch, projectId, store, user.id])

  return { copy, paste }
}
