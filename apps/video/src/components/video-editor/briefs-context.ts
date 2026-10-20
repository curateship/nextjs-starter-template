import * as React from "react"

import type { BriefItem } from "@/lib/api/video/briefs"

// The provider lives in brief-to-video.tsx: a file that exports a component
// may export only components, or fast refresh stops working.

/**
 * This project's briefs (`workspace/docs/brief-to-video.md`), kept by the
 * editor so made scenes land while the window is shut. Null for a guest sent
 * from Project, who uses no AI.
 */
export type BriefsValue = {
  /** Newest first. Null until the first answer. */
  briefs: BriefItem[] | null
  /** Puts a brief the server just handed back in place of its old copy. */
  replace: (brief: BriefItem) => void
}

export const BriefsContext = React.createContext<BriefsValue | null>(null)

export function useBriefs() {
  return React.useContext(BriefsContext)
}

/** "Making scene 3 of 8" for the AI panel's tile, or null when nothing is being made. */
export function useBriefProgress() {
  const briefs = useBriefs()?.briefs
  const making = briefs?.find((brief) => brief.status === "making")
  if (!making) return null
  const index = making.scenes.findIndex((scene) => scene.state === "queued")
  return index < 0
    ? "Laying the last scenes on the timeline."
    : `Making scene ${index + 1} of ${making.scenes.length}.`
}
