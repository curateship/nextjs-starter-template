import * as React from "react"

import type { DayPart, SkyPhase, WeatherKind } from "@/lib/project/daily-card"

/**
 * The Daily card's sky (Tyler, 29 Oct 2026: "the card can have a sunny sky
 * in the background"). It is a drawing, so its colours are its own, the way
 * the UI rules allow for deliberate drawings: a sunrise, day, gold, sunset or
 * night with stars, then the weather over it. The scenes along the bottom
 * (beach, city, mountains, forest) and the site admin's own photos went on
 * 11 Nov 2026, when their page took the shell's Cover photo row ("Shell row
 * exactly"). It lies behind an employee's My dashboard.
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
}: {
  phase: SkyPhase
  part: DayPart
  weather: WeatherKind | null
}) {
  const gradientId = React.useId()
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
      data-part={part}
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
