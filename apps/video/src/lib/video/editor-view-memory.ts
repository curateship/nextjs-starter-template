import { z } from "zod"

/**
 * Where somebody was when they last left a video: on the timeline how far it
 * was zoomed, where it was scrolled to, which clip was selected and the
 * moment of the video the playhead was on. The left panel is not kept: a
 * project always opens on its Videos tab (Tyler, 1 Nov 2026).
 *
 * It is kept in this browser's localStorage, the same place the editor's
 * panel sizes live, so it does not follow anybody to another machine or
 * another browser. The key carries the person's id as well as the video's,
 * because signing out does not empty localStorage and the next person on the
 * same browser should open the video the ordinary way.
 *
 * None of it is part of the video. It is never sent to the server and undo
 * never touches it.
 */
export type EditorView = z.infer<typeof editorViewSchema>
export type TimelineView = NonNullable<EditorView["timeline"]>

// Read back from storage anything could have written to. A value that fails
// is treated as nothing remembered.
const editorViewSchema = z.object({
  timeline: z
    .object({
      pxPerSecond: z.number().positive().finite(),
      scrollLeft: z.number().min(0).finite(),
      scrollTop: z.number().min(0).finite(),
      selectedClipId: z.string().min(1).nullable(),
      playheadMs: z.number().min(0).finite(),
    })
    .optional(),
})

export function editorViewStorageKey(userId: string, videoId: string) {
  return `video-editor-view:${userId}:${videoId}`
}

export function readEditorView(key: string): EditorView {
  try {
    const saved = localStorage.getItem(key)
    if (!saved) return {}
    const parsed = editorViewSchema.safeParse(JSON.parse(saved))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

export function updateEditorView(key: string, part: EditorView) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ...readEditorView(key), ...part })
    )
  } catch {
    // Storage may be blocked; the editor still works, it just forgets.
  }
}
