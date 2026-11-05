import * as React from "react"

import {
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  clipPunchIns,
  movePunchIn,
  punchSpanOnClip,
} from "@/lib/video/punch-ins"
import { msToPx, pxToMs } from "@/lib/video/timeline-utils"

/**
 * Each zoom on a video clip as a band along the top of the clip, with a
 * handle at each end to make it start or end elsewhere (zoom-in-on-a-moment.md).
 * A drag is drawn here and saved once on release, so one Undo puts it back.
 */
export function PunchInBands({
  clip,
  pps,
  readOnly,
}: {
  clip: EditorClip
  pps: number
  readOnly: boolean
}) {
  const punches = clipPunchIns(clip)
  if (!punches.length) return null
  const all = clip.punchIns ?? []
  return (
    <>
      {punches.map((punch) => (
        <PunchInBand
          key={`${punch.sourceStartMs}-${punch.sourceEndMs}`}
          clip={clip}
          index={all.indexOf(punch)}
          pps={pps}
          readOnly={readOnly}
        />
      ))}
    </>
  )
}

function PunchInBand({
  clip,
  index,
  pps,
  readOnly,
}: {
  clip: EditorClip
  index: number
  pps: number
  readOnly: boolean
}) {
  const { dispatch } = useEditorRuntime()
  const punch = clip.punchIns![index]
  const span = punchSpanOnClip(clip, punch)
  const drag = React.useRef<{ edge: "start" | "end"; pointerId: number; startX: number } | null>(null)
  const [draft, setDraft] = React.useState<{ startMs: number; endMs: number } | null>(null)
  const shown = draft ?? span
  const left = msToPx(Math.max(0, shown.startMs), pps)
  const right = msToPx(Math.min(clip.durationMs, shown.endMs), pps)

  function down(edge: "start" | "end") {
    return (event: React.PointerEvent<HTMLSpanElement>) => {
      if (event.button !== 0 || readOnly) return
      // The handle's press is the handle's, never the clip's drag.
      event.stopPropagation()
      drag.current = { edge, pointerId: event.pointerId, startX: event.clientX }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }
  function move(event: React.PointerEvent) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    const delta = pxToMs(event.clientX - active.startX, pps)
    const next =
      active.edge === "start"
        ? { startMs: span.startMs + delta, endMs: span.endMs }
        : { startMs: span.startMs, endMs: span.endMs + delta }
    const moved = movePunchIn(clip, index, next.startMs, next.endMs)[index]
    setDraft(punchSpanOnClip(clip, moved))
  }
  function up(event: React.PointerEvent) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    drag.current = null
    if (draft) {
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: { punchIns: movePunchIn(clip, index, draft.startMs, draft.endMs) },
      })
    }
    setDraft(null)
  }

  const handle = (edge: "start" | "end") => (
    <span
      data-punch-handle={edge}
      aria-hidden
      onPointerDown={down(edge)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null
        setDraft(null)
      }}
      className="absolute inset-y-0 w-2"
      style={{
        [edge === "start" ? "left" : "right"]: -4,
        cursor: readOnly ? "default" : "ew-resize",
        pointerEvents: readOnly ? "none" : "auto",
      }}
    />
  )

  return (
    <span
      data-punch-in={index}
      aria-hidden
      className="absolute top-0 h-1.5 rounded-sm bg-primary"
      style={{ left, width: Math.max(2, right - left), zIndex: 4 }}
    >
      {handle("start")}
      {handle("end")}
    </span>
  )
}
