import * as React from "react"

// The provider lives in remake-clips.tsx: a file that exports a component
// may export only components, or fast refresh stops working.

/**
 * Make it again on a clip the AI made (`workspace/docs/regenerate-a-scene.md`).
 * Null outside the editor itself, and for a guest sent from Project, who uses
 * no AI, so neither sees the menu item or the inspector card.
 */
export type RemakeClipsValue = {
  /** Opens the Make it again window for this clip, or says why it cannot. */
  open: (clipId: string) => void
  /**
   * Opens Remove reflection or Remove an object on a picture clip
   * (picture-clean-up.md). The same AI rule holds: a guest has neither.
   */
  cleanUp: (clipId: string, kind: "reflection" | "object") => void
  /** Opens Match the lips on a video clip (lip-sync.md). A guest has none. */
  matchLips: (clipId: string) => void
}

export const RemakeClipsContext = React.createContext<RemakeClipsValue | null>(null)

export function useRemakeClips() {
  return React.useContext(RemakeClipsContext)
}
