import * as React from "react"

import { describeChanges, SLOT_LABELS } from "@/components/fitness/photos/measurements"
import { PrivatePhoto } from "@/components/fitness/photos/private-photo"
import { FieldLabel } from "@/components/ui/field-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PhotoSession, PhotoSlot } from "@/lib/api/fitness/photos"
import { formatDay } from "@/lib/fitness/dates"
import type { WeightUnit } from "@/lib/fitness/weights"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

const SLOTS: PhotoSlot[] = ["front", "side", "back"]

/**
 * Two photo days side by side, slot by slot, or one over the other with a
 * divider to drag across. The later day always sits on the right, so "after"
 * reads the same way in both. It fills the Photos view's middle panel while
 * `?compare=` is set, with no card of its own.
 */
export function CompareView({
  sessions,
  firstId,
  secondId,
  unit,
  onPick,
}: {
  sessions: readonly PhotoSession[]
  firstId: string
  secondId: string
  unit: WeightUnit
  onPick: (firstId: string, secondId: string) => void
}) {
  const [mode, setMode] = React.useState<"side" | "slider">("side")
  const [slot, setSlot] = React.useState<PhotoSlot>("front")
  const chosen = [sessions.find((entry) => entry.id === firstId), sessions.find((entry) => entry.id === secondId)]
    .filter((entry): entry is PhotoSession => Boolean(entry))
    .sort((a, b) => a.day.localeCompare(b.day))
  const [earlier, later] = chosen
  const changes = earlier && later ? describeChanges(earlier, later, unit) : []

  return (
    <section className="@container grid gap-4 p-3" aria-label="Compare two photo days">
        <div className="grid gap-4 @lg:grid-cols-[1fr_1fr_auto] @lg:items-end">
          <DayPick id="compare-first" label="Before" value={firstId} sessions={sessions} onChange={(id) => onPick(id, secondId)} />
          <DayPick id="compare-second" label="After" value={secondId} sessions={sessions} onChange={(id) => onPick(firstId, id)} />
          <Tabs value={mode} onValueChange={(value) => setMode(value as "side" | "slider")}>
            <TabsList aria-label="How to compare">
              <TabsTrigger value="side">Side by side</TabsTrigger>
              <TabsTrigger value="slider">Slider</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {!earlier || !later || earlier.id === later.id ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Pick two different days to compare.</p>
        ) : mode === "side" ? (
          <div className="grid gap-4">
            {SLOTS.map((entry) => (
              <div key={entry} className="grid gap-1">
                <p className="text-xs font-medium text-muted-foreground">{SLOT_LABELS[entry]}</p>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  <PhotoOrGap session={earlier} slot={entry} />
                  <PhotoOrGap session={later} slot={entry} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            <Tabs value={slot} onValueChange={(value) => setSlot(value as PhotoSlot)}>
              <TabsList aria-label="Which photo">
                {SLOTS.map((entry) => (
                  <TabsTrigger key={entry} value={entry}>
                    {SLOT_LABELS[entry]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <SliderCompare earlier={earlier} later={later} slot={slot} />
          </div>
        )}
        {changes.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : earlier && later && earlier.id !== later.id ? (
          <p className="text-sm text-muted-foreground">
            Add bodyweight or measurements to both days to see what changed.
          </p>
        ) : null}
    </section>
  )
}

function DayPick({
  id,
  label,
  value,
  sessions,
  onChange,
}: {
  id: string
  label: string
  value: string
  sessions: readonly PhotoSession[]
  onChange: (id: string) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Pick a day" />
        </SelectTrigger>
        <SelectContent>
          {sessions.map((session) => (
            <SelectItem key={session.id} value={session.id}>
              {formatDay(session.day)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function PhotoOrGap({ session, slot }: { session: PhotoSession; slot: PhotoSlot }) {
  const address = session.photos[slot]
  const label = `${SLOT_LABELS[slot]}, ${formatDay(session.day)}`
  return (
    <figure className="grid gap-1">
      <div className="aspect-[3/4] overflow-hidden rounded-lg border bg-muted/50">
        {address ? (
          <PrivatePhoto src={address} alt={label} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">No photo</span>
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">{formatDay(session.day)}</figcaption>
    </figure>
  )
}

/**
 * The later photo laid over the earlier one, showing only to the right of a
 * divider. Drag the divider, or focus it and use the arrow keys, Home and End.
 */
function SliderCompare({ earlier, later, slot }: { earlier: PhotoSession; later: PhotoSession; slot: PhotoSlot }) {
  const [position, setPosition] = React.useState(50)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)
  const before = earlier.photos[slot]
  const after = later.photos[slot]

  if (!before || !after) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Both days need a {SLOT_LABELS[slot].toLowerCase()} photo to slide between them.
      </p>
    )
  }

  function moveTo(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    setPosition(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)))
  }

  return (
    <div
      ref={boxRef}
      className="relative mx-auto aspect-[3/4] w-full max-w-md touch-none overflow-hidden rounded-lg border select-none"
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        moveTo(event.clientX)
      }}
      onPointerMove={(event) => {
        if (dragging.current) moveTo(event.clientX)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      <PrivatePhoto src={before} alt={`${SLOT_LABELS[slot]}, ${formatDay(earlier.day)}`} className="absolute inset-0 size-full object-cover" />
      <PrivatePhoto
        src={after}
        alt={`${SLOT_LABELS[slot]}, ${formatDay(later.day)}`}
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      />
      <span className="absolute top-2 left-2 rounded bg-background/80 px-1.5 py-0.5 text-xs">{formatDay(earlier.day)}</span>
      <span className="absolute top-2 right-2 rounded bg-background/80 px-1.5 py-0.5 text-xs">{formatDay(later.day)}</span>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Divider between the two photos"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${Math.round(position)} out of 100 across`}
        className={cn("absolute inset-y-0 w-1 -translate-x-1/2 cursor-ew-resize bg-background", focusRing)}
        style={{ left: `${position}%` }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 2
          if (event.key === "ArrowLeft") setPosition((current) => Math.max(0, current - step))
          else if (event.key === "ArrowRight") setPosition((current) => Math.min(100, current + step))
          else if (event.key === "Home") setPosition(0)
          else if (event.key === "End") setPosition(100)
          else return
          event.preventDefault()
        }}
      >
        <span className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background shadow-sm" />
      </div>
    </div>
  )
}
