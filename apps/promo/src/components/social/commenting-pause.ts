import * as React from "react"

/**
 * Pause commenting for the network whose Commenting row is showing, drawn at
 * the foot of its keywords dropdown (Tyler, 14 Nov 2026, of the Pause button
 * on the Commenting row in the left panel: "remove this pause thing. that
 * belings in the keyword dropdown"). The project's dashboard provides it
 * around the network's module; a guest, who never pauses anything, gets none.
 */
export type CommentingPause = {
  /** "Reddit", "Medium". */
  networkName: string
  paused: boolean
  /** Pauses commenting on this network alone, or with false resumes it. */
  onToggle: (paused: boolean) => Promise<void>
}

export const CommentingPauseContext = React.createContext<CommentingPause | null>(null)
