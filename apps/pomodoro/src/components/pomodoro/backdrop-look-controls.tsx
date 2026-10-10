import * as React from "react"

import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  MAX_BACKDROP_DIM,
  setBackdropDim,
  setBackdropDrift,
  useBackdropLook,
} from "@/lib/pomodoro/backdrop-look"
import { cn } from "@/lib/utils"

/**
 * The dim slider and the drift switch (uploads-and-sharing task 08, Parts 2
 * and 4). Both save by themselves: the scene follows the slider at once and
 * the value is saved when it is let go, the switch the moment it flips.
 */

/** The same grey track and knob as the volume slider, from Tyler's design. */
const sliderLook = cn(
  "[&_[data-slot=slider-track]]:h-[7px] [&_[data-slot=slider-track]]:bg-[rgba(var(--p-fg-rgb),0.14)]",
  "[&_[data-slot=slider-range]]:bg-[rgba(var(--p-fg-rgb),0.45)]",
  "[&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-neutral-400"
)

function DimSlider({ id, className }: { id: string; className?: string }) {
  const { dim } = useBackdropLook()
  return (
    <Slider
      id={id}
      className={cn(sliderLook, className)}
      min={0}
      max={MAX_BACKDROP_DIM}
      step={5}
      value={[dim]}
      onValueChange={([value]) => setBackdropDim(value)}
      onValueCommit={([value]) => setBackdropDim(value, true)}
      aria-label="Dim the background"
      aria-valuetext={dim ? `${dim}% darker` : "Not dimmed"}
    />
  )
}

/**
 * The Appearance card's rows: the dim, then the drift switch on its own row.
 * A guest has no pictures of their own to drift, so a guest gets the dim only.
 */
export function BackdropLookFields() {
  const { dim, drift } = useBackdropLook()
  const { authenticated } = useProductAuth()
  return (
    <>
      <div className="grid gap-2">
        <div className="flex max-w-sm items-center justify-between gap-3">
          <Label htmlFor="backdrop-dim">Dim the background</Label>
          <span className="font-mono text-xs text-muted-foreground">{dim}%</span>
        </div>
        <DimSlider id="backdrop-dim" className="max-w-sm" />
        <p className="text-sm text-muted-foreground">
          Darkens the scene behind the timer so the numbers stay easy to read.
          At 0% the scene shows as it is.
        </p>
      </div>
      {authenticated ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Switch
              id="backdrop-drift"
              checked={drift}
              aria-describedby="backdrop-drift-help"
              onCheckedChange={setBackdropDrift}
            />
            <Label htmlFor="backdrop-drift">Slow drift on picture backgrounds</Label>
          </div>
          <p id="backdrop-drift-help" className="text-sm text-muted-foreground">
            A picture you uploaded zooms in very slowly and back, over a minute
            each way. Films and the catalogue&apos;s scenes are left as they are,
            and so is everything when your device asks for less movement.
          </p>
        </div>
      ) : null}
    </>
  )
}

/**
 * The dim in the header's Theme dropdown, under the two links. Tyler, 10 Oct
 * 2026: "The dimming should not be in the background dashboard. It should be
 * in theme dropdown."
 */
export function BackdropDimRow() {
  const { dim } = useBackdropLook()
  const id = React.useId()
  return (
    <div className="flex flex-col gap-2 px-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-[13.5px] font-semibold">
          Dim the background
        </Label>
        <span className="font-mono text-xs text-muted-foreground">{dim}%</span>
      </div>
      <DimSlider id={id} />
    </div>
  )
}
