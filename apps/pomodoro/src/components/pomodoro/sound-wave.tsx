import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A sound's cover: a row of thin rounded bars across the whole card, swelling
 * into a few soft humps and tapering to dots at both ends, coloured red into
 * amber on a dusky panel. Drawn to Tyler's design of 10 Oct 2026. The shape
 * comes from the sound's own key or id, so every sound has its own and keeps
 * it.
 *
 * Still until the sound plays, then the bars rise and fall. Tyler, 10 Oct
 * 2026: "replace it with a soundwave animation when play ... static until
 * played". The movement is the header's `pomodoro-equaliser` (in
 * `theme.css`), each bar on its own speed and delay so the row never moves in
 * step. Reduced motion keeps the bars still.
 *
 * The colours are `--p-wave-*` in `theme.css`, light and dark. The admin's
 * pages sit outside Pomoder's theme, so each has the dark value as fallback.
 */

const BARS = 44

export function SoundWave({
  seed,
  playing = false,
  className,
}: {
  /** The sound's key or upload id: the same seed always draws the same wave. */
  seed: string
  playing?: boolean
  className?: string
}) {
  const heights = waveHeights(seed)
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-full items-center justify-between gap-[1.3%] px-[2%] bg-linear-to-b from-[var(--p-wave-panel-top,#2c1f33)] to-[var(--p-wave-panel-bottom,#19181e)]",
        className
      )}
    >
      {heights.map((height, index) => (
        <span
          key={index}
          className={cn(
            "min-h-[3px] flex-1 origin-center rounded-full",
            playing &&
              "animate-[pomodoro-equaliser_var(--wave-speed)_ease-in-out_var(--wave-delay)_infinite] motion-reduce:animate-none"
          )}
          style={
            {
              height: `${(height * 44).toFixed(1)}%`,
              // Red at the left edge into amber at the right.
              backgroundColor: `color-mix(in oklab, var(--p-wave-from, #ff3b3b) ${Math.round(100 - (index / (BARS - 1)) * 100)}%, var(--p-wave-to, #ffb23e))`,
              "--wave-speed": `${0.7 + ((index * 7) % 5) * 0.12}s`,
              "--wave-delay": `${-((index * 13) % 9) * 0.09}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}

/**
 * Bar heights between 0 and 1: three seeded humps of different heights and
 * widths added together, smooth as in the design, with the ends forced down
 * to dots.
 */
function waveHeights(seed: string) {
  let state = 2166136261
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0
  }
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  // Narrow enough that the dips between them show, as in the design.
  const humps = [0.27, 0.5, 0.73].map((centre) => ({
    centre: centre + (next() - 0.5) * 0.04,
    width: 0.06 + next() * 0.02,
    height: 0.5 + next() * 0.5,
  }))
  const raw = Array.from({ length: BARS }, (_, index) => {
    const at = index / (BARS - 1)
    const swell = humps.reduce(
      (sum, hump) =>
        sum + hump.height * Math.exp(-((at - hump.centre) ** 2) / (2 * hump.width ** 2)),
      0
    )
    // The last tenth at each end is a row of dots, as in the design.
    const edge = Math.max(0, Math.min(1, (Math.min(at, 1 - at) - 0.1) / 0.08))
    return Math.min(1, swell) * edge
  })
  const top = Math.max(...raw)
  return raw.map((value) => value / top)
}
