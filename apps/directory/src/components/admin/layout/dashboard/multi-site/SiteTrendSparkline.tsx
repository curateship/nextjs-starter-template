// Per-site visitor trend sparkline for the multi-site dashboard's "Trend" column.
// Uses the same visual language as the dashboard area chart (foreground line,
// muted-foreground area) so it reads as part of one chart system.

import { buildSmoothLinePath } from "@/lib/charts/spark-path"

export function SiteTrendSparkline({ values }: { values: number[] }) {
  const data = values.length >= 2 ? values : [0, 0]
  const W = 140
  const H = 32
  const pad = 3
  const mn = Math.min(...data)
  const mx = Math.max(...data)
  const rng = mx - mn || 1
  const X = (i: number) => pad + (i * (W - 2 * pad)) / (data.length - 1)
  const Y = (v: number) => H - pad - ((v - mn) / rng) * (H - 2 * pad)
  const pts = data.map((v, i) => ({ x: X(i), y: Y(v) }))
  const line = buildSmoothLinePath(pts)
  const area = `${line} L${pts[pts.length - 1].x},${H - pad} L${pts[0].x},${H - pad} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <path d={area} fill="var(--muted-foreground)" fillOpacity={0.13} />
      <path
        d={line}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
