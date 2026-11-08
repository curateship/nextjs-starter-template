import * as React from "react"

import { useOptionalShellRuntime } from "@/components/shell/shell-layout"
import type { SkyPhase } from "@/lib/notes/page-cover"
import { skyPhaseFor } from "@/lib/notes/sky-city"

/**
 * A page cover's sky, copied from Project's Daily card on 8 Nov 2026
 * (`DailySky` in `apps/project/src/components/project/daily-sky.tsx`; Tyler:
 * "add that but only use the sky one"). It is a drawing, so its colours are
 * its own: a sunrise, day, gold, sunset or night with stars and a moon,
 * following the viewer's clock. Project's scenes along the bottom and its
 * weather are left out. It follows the real sun in the city set in Settings →
 * General → Sky city, or fixed hours when there is none.
 */

const SKY: Record<SkyPhase, [string, string]> = {
  sunrise: ["#f9a8d4", "#fde68a"],
  day: ["#38bdf8", "#e0f2fe"],
  golden: ["#fb923c", "#fef3c7"],
  sunset: ["#5b21b6", "#fb7185"],
  night: ["#020617", "#312e81"],
}

/** Where the sun or moon sits: x, y and size. */
const LIGHT: Record<SkyPhase, { x: number; y: number; r: number; color: string }> = {
  sunrise: { x: 70, y: 96, r: 18, color: "#fef08a" },
  day: { x: 320, y: 34, r: 16, color: "#fef9c3" },
  golden: { x: 300, y: 70, r: 18, color: "#fde047" },
  sunset: { x: 340, y: 104, r: 20, color: "#fdba74" },
  night: { x: 330, y: 32, r: 11, color: "#e2e8f0" },
}

const STARS = [
  [24, 18], [58, 40], [96, 14], [132, 52], [170, 24], [204, 10], [236, 44], [268, 20], [372, 56], [388, 16], [150, 70], [48, 66],
]

/**
 * The sky for now, read again every minute: by the real sun in Settings →
 * General → Sky city, or fixed hours on the viewer's clock with no city.
 * Nothing on the server's first draw: its clock is not the viewer's, so the
 * sky appears once the page is in the browser rather than drawing one time of
 * day and swapping it.
 */
function useSkyPhase(): SkyPhase | null {
  const city = useOptionalShellRuntime()?.config.skyCity ?? null
  // Its place, not the object, which may be rebuilt on every draw.
  const latitude = city?.latitude ?? null
  const longitude = city?.longitude ?? null
  const [phase, setPhase] = React.useState<SkyPhase | null>(null)
  React.useEffect(() => {
    const place =
      latitude === null || longitude === null ? null : { label: "", latitude, longitude }
    const read = () => setPhase(skyPhaseFor(new Date(), place))
    const first = window.setTimeout(read, 0)
    const timer = window.setInterval(read, 60_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [latitude, longitude])
  return phase
}

/**
 * The sky drawn edge to edge in its box, for now or for a `phase` given.
 * Without `lights` it has no sun or moon, as the right panel's carrying on
 * the left page's sky.
 */
export function CoverSky({
  phase: given,
  className,
  lights = true,
}: {
  phase?: SkyPhase
  className?: string
  lights?: boolean
}) {
  const gradientId = React.useId()
  const now = useSkyPhase()
  const phase = given ?? now
  if (!phase) return null
  const [top, bottom] = SKY[phase]
  const light = LIGHT[phase]
  return (
    <svg
      viewBox="0 0 400 140"
      preserveAspectRatio="xMidYMid slice"
      className={className ?? "absolute inset-0 size-full"}
      aria-hidden
      data-phase={phase}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} />
          <stop offset="100%" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect width="400" height="140" fill={`url(#${gradientId})`} />
      {phase === "night"
        ? STARS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill="#f8fafc" opacity={0.85} />)
        : null}
      {lights ? (
        <>
          <circle cx={light.x} cy={light.y} r={light.r * 1.8} fill={light.color} opacity={0.25} />
          <circle cx={light.x} cy={light.y} r={light.r} fill={light.color} />
          {phase === "night" ? <circle cx={light.x + 5} cy={light.y - 3} r={light.r} fill={top} /> : null}
        </>
      ) : null}
    </svg>
  )
}
