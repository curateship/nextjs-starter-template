import * as React from "react"

import type { DayPart, SkyKind, SkyPhase, WeatherKind } from "@/lib/project/daily-card"

/**
 * The Daily card's sky (Tyler, 29 Oct 2026: "the card can have a sunny sky
 * in the background"). It is a drawing, so its colours are its own, the way
 * the UI rules allow for deliberate drawings: a sunrise, day, gold, sunset or
 * night with stars, then the weather over it, then a scene along the bottom
 * (beach, city, mountains or forest), or the site admin's own photo for this
 * part of the day in place of all of it. The card lays a dark fade along the
 * bottom so its words stay readable over any of them.
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

const dark = (phase: SkyPhase) => phase === "night" || phase === "sunset"

export function DailySky({
  phase,
  part,
  weather,
  sky,
  ownPhoto,
}: {
  phase: SkyPhase
  part: DayPart
  weather: WeatherKind | null
  sky: SkyKind
  /** The site admin's own photo for this part of the day, when the sky is set to their own. */
  ownPhoto: string
}) {
  const gradientId = React.useId()
  if (sky === "own" && ownPhoto) {
    return <img src={ownPhoto} alt="" className="absolute inset-0 size-full object-cover" data-part={part} />
  }
  const [top, bottom] = SKY[phase]
  const light = LIGHT[phase]
  const cloudy = weather === "cloudy" || weather === "rain" || weather === "drizzle" || weather === "storm" || weather === "snow"
  return (
    <svg
      viewBox="0 0 400 140"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
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
      {phase === "night" ? STARS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill="#f8fafc" opacity={cloudy ? 0.3 : 0.85} />) : null}
      {!cloudy || weather === "snow" ? (
        <>
          <circle cx={light.x} cy={light.y} r={light.r * 1.8} fill={light.color} opacity={0.25} />
          <circle cx={light.x} cy={light.y} r={light.r} fill={light.color} />
          {phase === "night" ? <circle cx={light.x + 5} cy={light.y - 3} r={light.r} fill={top} /> : null}
        </>
      ) : null}
      {cloudy ? <rect width="400" height="140" fill={dark(phase) ? "#0f172a" : "#64748b"} opacity={weather === "storm" ? 0.55 : 0.35} /> : null}
      <Weather kind={weather} night={dark(phase)} />
      <Scene sky={sky} phase={phase} />
    </svg>
  )
}

function Cloud({ x, y, scale = 1, color }: { x: number; y: number; scale?: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
      <ellipse cx="0" cy="0" rx="26" ry="11" />
      <ellipse cx="18" cy="-6" rx="18" ry="12" />
      <ellipse cx="-16" cy="-3" rx="14" ry="9" />
    </g>
  )
}

function Weather({ kind, night }: { kind: WeatherKind | null; night: boolean }) {
  if (!kind || kind === "clear") return null
  const cloud = night ? "#475569" : "#f8fafc"
  const grey = night ? "#334155" : "#cbd5e1"
  if (kind === "fog") {
    return (
      <g fill={night ? "#94a3b8" : "#f1f5f9"} opacity={0.5}>
        <rect y="60" width="400" height="10" rx="5" />
        <rect y="78" width="400" height="12" rx="6" />
        <rect y="98" width="400" height="10" rx="5" />
      </g>
    )
  }
  const clouds = (
    <>
      <Cloud x={110} y={36} color={kind === "partly-cloudy" ? cloud : grey} />
      <Cloud x={230} y={28} scale={1.2} color={cloud} />
      {kind !== "partly-cloudy" ? <Cloud x={340} y={44} scale={0.9} color={grey} /> : null}
    </>
  )
  if (kind === "partly-cloudy" || kind === "cloudy") return clouds
  return (
    <>
      {clouds}
      {kind === "snow" ? (
        <g fill="#ffffff">
          {Array.from({ length: 24 }, (_, index) => (
            <circle key={index} cx={(index * 53) % 400} cy={56 + ((index * 37) % 70)} r={1.6} />
          ))}
        </g>
      ) : (
        <g stroke={night ? "#93c5fd" : "#e0f2fe"} strokeWidth={kind === "drizzle" ? 1 : 1.5} strokeLinecap="round" opacity={0.8}>
          {Array.from({ length: kind === "drizzle" ? 14 : 26 }, (_, index) => {
            const x = (index * 47) % 400
            const y = 54 + ((index * 29) % 60)
            return <line key={index} x1={x} y1={y} x2={x - 4} y2={y + 10} />
          })}
        </g>
      )}
      {kind === "storm" ? <path d="M250 50 L238 78 L250 78 L242 100 L262 70 L250 70 L258 50 Z" fill="#fde047" /> : null}
    </>
  )
}

/** A silhouette along the bottom; darker at night, with lit windows in the city. */
function Scene({ sky, phase }: { sky: SkyKind; phase: SkyPhase }) {
  const night = dark(phase)
  if (sky === "beach") {
    return (
      <>
        <rect y="104" width="400" height="16" fill={night ? "#1e3a8a" : "#0ea5e9"} opacity={0.9} />
        <path d="M0 116 Q100 110 200 116 T400 116 V140 H0 Z" fill={night ? "#a16207" : "#fcd34d"} />
        <g fill={night ? "#14532d" : "#166534"}>
          <rect x="330" y="84" width="4" height="34" />
          <path d="M332 84 q-18 -2 -28 10 q14 -12 28 -10 q-6 -14 -22 -14 q18 2 22 14 q8 -14 24 -12 q-16 2 -24 12 q20 -4 28 10 q-12 -10 -28 -10 Z" />
        </g>
      </>
    )
  }
  if (sky === "city") {
    const buildings = [
      [0, 92, 34], [36, 80, 26], [64, 98, 30], [96, 70, 22], [120, 88, 36], [158, 76, 28], [188, 94, 32], [222, 66, 24],
      [248, 86, 34], [284, 74, 26], [312, 96, 30], [344, 82, 28], [374, 90, 26],
    ]
    return (
      <g>
        {buildings.map(([x, y, w]) => (
          <g key={x}>
            <rect x={x} y={y} width={w} height={140 - y} fill={night ? "#0f172a" : "#334155"} />
            {night
              ? Array.from({ length: 3 }, (_, row) => (
                  <rect key={row} x={x + 6} y={y + 8 + row * 12} width={4} height={4} fill="#fde68a" opacity={(x + row) % 3 ? 0.9 : 0.25} />
                ))
              : null}
          </g>
        ))}
      </g>
    )
  }
  if (sky === "mountains") {
    return (
      <>
        <path d="M0 140 L70 72 L130 120 L200 60 L280 124 L340 80 L400 112 V140 Z" fill={night ? "#1e293b" : "#64748b"} />
        <path d="M200 60 L216 74 L206 72 L198 78 L190 70 Z" fill="#f8fafc" opacity={night ? 0.5 : 0.95} />
        <path d="M0 140 L90 104 L170 132 L260 100 L400 134 V140 Z" fill={night ? "#0f172a" : "#334155"} />
      </>
    )
  }
  if (sky === "forest") {
    const trees = [8, 34, 58, 86, 112, 140, 166, 196, 222, 250, 278, 306, 332, 360, 388]
    return (
      <g fill={night ? "#052e16" : "#15803d"}>
        <rect y="126" width="400" height="14" />
        {trees.map((x, index) => {
          const h = 34 + ((index * 13) % 22)
          return <path key={x} d={`M${x} ${130 - h} L${x + 12} 130 L${x - 12} 130 Z`} />
        })}
      </g>
    )
  }
  return null
}
