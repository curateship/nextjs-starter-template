// Per-site visitor trend sparkline for the multi-site dashboard's "Trend" column.
// Uses the same visual language as the dashboard area chart (foreground line,
// muted-foreground area) so it reads as part of one chart system.

interface SparkPoint {
  x: number
  y: number
}

// Catmull-Rom smoothed line through the points.
function linePath(pts: SparkPoint[]): string {
  if (pts.length === 0) return ""
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || pts[i + 1]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }
  return d
}

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
  const line = linePath(pts)
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
