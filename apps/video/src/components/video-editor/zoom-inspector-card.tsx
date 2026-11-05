import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { FieldLabel, InspectorCard } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Hint } from "@/components/video-assets/hint"
import {
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  canPunchIn,
  clipPunchIns,
  MAX_PUNCH_SCALE,
  MIN_PUNCH_SCALE,
  MIN_PUNCH_MS,
  movePunchIn,
  newPunchIn,
  PUNCH_ONLY_FULL_FRAME,
  punchSpanOnClip,
  type PunchIn,
  type PunchInEase,
} from "@/lib/video/punch-ins"
import { formatClock } from "@/lib/video/timeline-utils"

const EASE_OPTIONS: { id: PunchInEase; label: string }[] = [
  { id: "ease", label: "Ease in and out" },
  { id: "jump", label: "Jump" },
]

/**
 * Zoom in on a moment (zoom-in-on-a-moment.md): one press adds a 2 second
 * zoom at the playhead, and each zoom on the clip has its length, size, how
 * it goes in, and Delete. Its ends can also be dragged on the timeline's band.
 */
export function ZoomInspectorCard({ clip }: { clip: EditorClip }) {
  const { dispatch, clock } = useEditorRuntime()
  if (clip.kind !== "video") return null
  const all = clip.punchIns ?? []
  const shown = clipPunchIns(clip)

  function setPunchIns(punchIns: PunchIn[], transient = false) {
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: { punchIns: punchIns.length ? punchIns : undefined },
      transient,
    })
  }

  function addAtPlayhead() {
    const made = newPunchIn(clip, clock.getTime() - clip.startMs)
    if ("refusal" in made) {
      showErrorToast(made.refusal)
      return
    }
    setPunchIns([...all, made.punch].sort((a, b) => a.sourceStartMs - b.sourceStartMs))
  }

  return (
    <InspectorCard title="Zoom" description="Goes closer for a stretch, then comes back.">
      {canPunchIn(clip) ? (
        <Button type="button" variant="outline" className="w-full" onClick={addAtPlayhead}>
          <PlusIcon />
          Zoom in at the playhead
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{PUNCH_ONLY_FULL_FRAME}</p>
      )}
      {shown.map((punch) => (
        <ZoomRow
          key={`${punch.sourceStartMs}-${punch.sourceEndMs}`}
          clip={clip}
          punch={punch}
          index={all.indexOf(punch)}
          onChange={(next, transient) =>
            setPunchIns(all.map((item) => (item === punch ? next : item)), transient)
          }
          onLength={(lengthMs) => {
            const index = all.indexOf(punch)
            const span = punchSpanOnClip(clip, punch)
            const moved = movePunchIn(clip, index, span.startMs, span.startMs + lengthMs)
            const got = punchSpanOnClip(clip, moved[index])
            if (got.endMs - got.startMs < lengthMs - 50) {
              showErrorToast(
                `This zoom can last at most ${seconds(got.endMs - got.startMs)} seconds here, because the clip ends or the next zoom starts.`
              )
            }
            setPunchIns(moved)
          }}
          onDelete={() => setPunchIns(all.filter((item) => item !== punch))}
        />
      ))}
    </InspectorCard>
  )
}

/** Seconds with at most one decimal: 2, 2.5. */
function seconds(ms: number) {
  return String(Math.round(ms / 100) / 10)
}

function ZoomRow({
  clip,
  punch,
  index,
  onChange,
  onLength,
  onDelete,
}: {
  clip: EditorClip
  punch: PunchIn
  index: number
  onChange: (next: PunchIn, transient: boolean) => void
  onLength: (lengthMs: number) => void
  onDelete: () => void
}) {
  const dragging = React.useRef(false)
  const span = punchSpanOnClip(clip, punch)
  const from = formatClock(clip.startMs + Math.max(0, span.startMs))
  const to = formatClock(clip.startMs + Math.min(clip.durationMs, span.endMs))
  const sizeId = `zoom-size-${clip.id}-${index}`
  const easeId = `zoom-ease-${clip.id}-${index}`
  const lengthId = `zoom-length-${clip.id}-${index}`
  const lengthMs = Math.min(clip.durationMs, span.endMs) - Math.max(0, span.startMs)
  return (
    <div className="grid gap-4 border-t pt-4" data-zoom-row={index}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium tabular-nums">
          {from} to {to}
        </span>
        <Hint label="Delete this zoom">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Delete this zoom"
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </Hint>
      </div>
      <ZoomLength
        // A new value from the timeline's band resets what is typed.
        key={lengthMs}
        id={lengthId}
        lengthMs={lengthMs}
        onLength={onLength}
      />
      <div className="grid gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <FieldLabel htmlFor={sizeId}>Size</FieldLabel>
          <span className="text-[15px] text-muted-foreground tabular-nums">
            {punch.scale.toFixed(2).replace(/\.?0+$/, "")}x
          </span>
        </div>
        <Slider
          id={sizeId}
          aria-label="Zoom size"
          min={MIN_PUNCH_SCALE}
          max={MAX_PUNCH_SCALE}
          step={0.05}
          value={[punch.scale]}
          onValueChange={([next]) => {
            const first = !dragging.current
            dragging.current = true
            onChange({ ...punch, scale: Math.round(next * 100) / 100 }, !first)
          }}
          onValueCommit={() => {
            dragging.current = false
          }}
        />
      </div>
      <div className="grid gap-2.5">
        <FieldLabel htmlFor={easeId}>How it goes in</FieldLabel>
        <Select
          value={punch.ease}
          onValueChange={(next) => onChange({ ...punch, ease: next as PunchInEase }, false)}
        >
          <SelectTrigger id={easeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EASE_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/**
 * How long the zoom lasts, in seconds, typed. It keeps its start and moves
 * its end, saved on Enter or on leaving the box.
 */
function ZoomLength({
  id,
  lengthMs,
  onLength,
}: {
  id: string
  lengthMs: number
  onLength: (lengthMs: number) => void
}) {
  const [text, setText] = React.useState(seconds(lengthMs))
  const typed = Number(text.trim().replace(",", "."))
  const ok = text.trim() !== "" && Number.isFinite(typed) && typed * 1000 >= MIN_PUNCH_MS

  function commit() {
    if (!ok) {
      showErrorToast(`Type a length of at least ${MIN_PUNCH_MS / 1000} seconds.`)
      setText(seconds(lengthMs))
      return
    }
    const next = Math.round(typed * 1000)
    if (Math.abs(next - lengthMs) >= 50) onLength(next)
    // A length that changed redraws this box; one that couldn't change shows
    // what it still is.
    setText(seconds(lengthMs))
  }

  return (
    <div className="grid gap-2.5">
      <FieldLabel htmlFor={id}>Length in seconds</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        aria-invalid={!ok || undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}
