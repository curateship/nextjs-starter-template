import * as React from "react"
import { Loader2Icon, RotateCcw } from "lucide-react"

import { InspectorCard, SwitchField } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import {
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  retrySteadyCopy,
  useSteadyCopies,
} from "@/components/video-editor/steady-copy-store"

/**
 * The Steady switch on a video clip (steady-shaky-footage.md). Turned on, the
 * background worker makes a steadied copy of the file, and the clip plays it
 * once it is ready. Until then it plays as shot, and an export waits.
 */
export function SteadyInspectorCard({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  const states = useSteadyCopies(React.useMemo(() => [clip], [clip]))
  if (clip.kind !== "video" || !clip.mediaId) return null
  const mediaId = clip.mediaId
  const state = clip.steady ? states.get(mediaId) : undefined

  return (
    <InspectorCard title="Steady" description="Smooths out the shake of a handheld shot.">
      <SwitchField
        id="clip-steady"
        label="Steady this clip"
        description="Makes a steadied copy of the video and plays that instead."
        checked={!!clip.steady}
        onChange={(on) =>
          dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch: { steady: on || undefined } })
        }
      />
      {state?.status === "preparing" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2Icon className="size-4 motion-safe:animate-spin" aria-hidden />
          Making the steadied copy. The clip plays as shot until it is ready, and an export waits for it.
        </p>
      ) : state?.status === "failed" ? (
        <div className="grid gap-2" role="status">
          <p className="text-sm text-muted-foreground">
            The steadied copy could not be made: {state.error}. The clip plays as shot.
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={() => retrySteadyCopy(mediaId)}>
            <RotateCcw />
            Try again
          </Button>
        </div>
      ) : null}
    </InspectorCard>
  )
}
