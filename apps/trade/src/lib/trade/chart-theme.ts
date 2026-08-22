/**
 * The app's own colours, in the one form the chart library understands.
 *
 * Read off the page rather than hard-coded twice: a probe element wearing the
 * same Tailwind classes as the rest of the app is appended, measured and
 * removed, so the browser resolves the theme variables and the light/dark
 * split for us. Up and down match the market list's pills, so a rising candle
 * and a rising row are the same green.
 */

export type ChartColors = {
  text: string
  /** The chart's own rules. Faint on purpose: they sit under the candles. */
  grid: string
  /**
   * The two lines fencing off the price and time axes. Read from the theme's
   * border token, the same one every other divider in the app takes, so the
   * Styling settings' Divider lines colour reaches the chart's edges too.
   */
  border: string
  /** The account's accent, used for prices that are neither a buy nor a sell. */
  primary: string
  up: string
  down: string
  warning: string
  /** A neutral order line, readable against the chart in either theme. */
  neutral: string
  /** Text drawn on a solid chart badge. */
  badgeText: string
  upSoft: string
  downSoft: string
}

export function readChartColors(host: HTMLElement): ChartColors {
  const resolve = (className: string) => {
    const probe = document.createElement("span")
    probe.className = className
    host.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return toRgb(color)
  }

  const up = resolve("text-emerald-600 dark:text-emerald-400")
  const down = resolve("text-destructive")
  const border = resolve("text-border")
  const text = resolve("text-muted-foreground")
  return {
    text,
    grid: withAlpha(resolve("text-foreground"), 0.08),
    border,
    primary: resolve("text-primary"),
    up,
    down,
    warning: resolve("text-amber-600 dark:text-amber-400"),
    // Waiting orders are chart marks, not divider chrome. The border token is
    // deliberately faint and made their line, label, and controls disappear.
    neutral: text,
    badgeText: resolve("text-background"),
    upSoft: withAlpha(up, 0.4),
    downSoft: withAlpha(down, 0.4),
  }
}

/**
 * Any CSS colour to plain `rgba(…)`, via a one-pixel canvas: the theme speaks
 * oklch, the chart library only reads the classics, and the browser is the
 * one thing that reliably translates between them.
 */
function toRgb(color: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) return color
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

/** `rgba(…)` with its alpha replaced. */
function withAlpha(rgb: string, alpha: number): string {
  const match = /rgba?\(([^)]+)\)/.exec(rgb)
  if (!match) return rgb
  const [r, g, b] = match[1].split(/[\s,/]+/)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
