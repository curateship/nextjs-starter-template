export interface SparkPoint {
  x: number
  y: number
}

// Catmull-Rom smoothed line through the points. Shared by the multi-site dashboard
// sparkline and the owner listing-views chart so every trend line reads as one
// chart system (same curve shape, foreground line, muted-foreground area).
export function buildSmoothLinePath(pts: SparkPoint[]): string {
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
