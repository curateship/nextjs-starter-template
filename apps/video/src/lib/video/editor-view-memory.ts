import { z } from "zod"

/**
 * Where somebody was when they last left a project: the panel open on the
 * left, and on the timeline how far it was zoomed, where it was scrolled to,
 * which clip was selected and the moment of the video the playhead was on.
 *
 * It is kept in this browser's localStorage, the same place the editor's
 * panel sizes live, so it does not follow anybody to another machine or
 * another browser. The key carries the person's id as well as the project's,
 * because signing out does not empty localStorage and the next person on the
 * same browser should open the project the ordinary way.
 *
 * The timeline and the left panel are written by different parts of the
 * editor, so each writes only its own half and leaves the other as it was.
 *
 * None of it is part of the project. It is never sent to the server and undo
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
  panel: z.string().min(1).optional(),
})

export function editorViewStorageKey(userId: string, projectId: string) {
  return `video-editor-view:${userId}:${projectId}`
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
