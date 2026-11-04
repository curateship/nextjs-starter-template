import * as React from "react"
import { CheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { showBeforeAfter, useBeforeAfter } from "@/components/video-editor/before-after"

/**
 * The before and after slider over a picture the AI just changed
 * (picture-clean-up.md): the old picture on the left of the line, the new one
 * on the right. Drag the line, or use the arrow keys on it. It goes away when
 * another clip is picked or Done is pressed.
 */
export function BeforeAfterSlider({
  clipId,
  selectedClipId,
  box,
  objectFit,
  objectPosition,
  zIndex,
}: {
  clipId: string
  selectedClipId: string | null
  box: React.CSSProperties
  objectFit: React.CSSProperties["objectFit"]
  objectPosition: string
  zIndex: number
}) {
  const shown = useBeforeAfter()
  const [at, setAt] = React.useState(50)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)
  const mine = shown?.clipId === clipId

  // Picking another clip puts the slider away.
  React.useEffect(() => {
    if (mine && selectedClipId !== clipId) showBeforeAfter(null)
  }, [mine, selectedClipId, clipId])

  if (!mine || selectedClipId !== clipId) return null

  function moveTo(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    setAt(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute"
      style={{ ...box, zIndex }}
    >
      <img
        src={shown.beforeUrl}
        alt="Before"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none"
        style={{ objectFit, objectPosition, clipPath: `inset(0 ${100 - at}% 0 0)` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(at)}
        aria-valuetext={`${Math.round(at)}% before`}
        className="pointer-events-auto absolute top-0 bottom-0 w-4 -translate-x-1/2 cursor-ew-resize touch-none focus-visible:outline-2 focus-visible:outline-white"
        style={{ left: `${at}%` }}
        onPointerDown={(event) => {
          event.stopPropagation()
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (dragging.current) moveTo(event.clientX)
        }}
        onPointerUp={(event) => {
          dragging.current = false
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setAt((value) => Math.max(0, value - 5))
          if (event.key === "ArrowRight") setAt((value) => Math.min(100, value + 5))
        }}
      >
        <span className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
      </div>
      <span className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        Before
      </span>
      <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        After
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="pointer-events-auto absolute right-2 bottom-2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => showBeforeAfter(null)}
      >
        <CheckIcon />
        Done
      </Button>
    </div>
  )
}
