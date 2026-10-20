import * as React from "react"

import type { GenerationItem } from "@/lib/api/video/generations"

// The provider lives in moving-stills.tsx: a file that exports a component
// may export only components, or fast refresh stops working.

/**
 * The project's shots made from pictures on the timeline that have not
 * landed yet, by the clip each is for, and the ways to act on one. Null
 * outside the editor itself, such as the History preview's timeline, which
 * shows no markers and has no right-click menu.
 */
export type MovingStillsValue = {
  shotFor: (clipId: string) => GenerationItem | undefined
  /** Opens the Make it move window for a picture clip, or says why it cannot. */
  open: (clipId: string) => void
  retry: (shot: GenerationItem) => void
  /** Forgets a failed try, which takes its marker off the picture. */
  clear: (shot: GenerationItem) => void
}

export const MovingStillsContext = React.createContext<MovingStillsValue | null>(null)

export function useMovingStills() {
  return React.useContext(MovingStillsContext)
}
