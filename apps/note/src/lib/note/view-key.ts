/**
 * Where this browser remembers whether the videos show as a grid or a list.
 * The app's own key, so the shell's list of keys in `remembered-choice.ts`
 * never has to change for it.
 */
export const NOTE_VIDEOS_VIEW_KEY = "note-videos-view"

export const NOTE_VIDEO_VIEWS = ["grid", "list"] as const
export type NoteVideoView = (typeof NOTE_VIDEO_VIEWS)[number]
