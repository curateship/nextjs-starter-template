/**
 * The celebration for a finished task: a few of the logo's fireflies lift off
 * from the tick box, drift apart and fade (Tyler, 15 Nov 2026: "Build the
 * fireflies lifting off from the tick box").
 *
 * The fireflies are drawn on the page itself, fixed where the tick box was at
 * the press, not inside the row. A ticked row can move down its list or leave
 * it, and the fireflies must not travel with it or vanish with it.
 *
 * Nothing is drawn when the device asks for less motion. The look and the
 * movement are the `flowfly-burst` rules in `theme.css`.
 */

export const FIREFLIES_PER_TICK = 6
/** The slowest firefly: 0.15s late, 1.5s in the air, and a little slack. */
const GONE_AFTER_MS = 1800

function between(low: number, high: number) {
  return low + Math.random() * (high - low)
}

export function releaseFireflies(from: Element) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  const box = from.getBoundingClientRect()
  const burst = document.createElement("div")
  // `flowfly-logo` lends the glow's colours for the light and the dark theme.
  burst.className = "flowfly-logo flowfly-burst"
  burst.setAttribute("aria-hidden", "true")
  burst.style.left = `${box.left + box.width / 2}px`
  burst.style.top = `${box.top + box.height / 2}px`
  for (let index = 0; index < FIREFLIES_PER_TICK; index += 1) {
    const firefly = document.createElement("i")
    // Spread evenly from left to right, then nudged, so six never bunch up.
    const spread = (index / (FIREFLIES_PER_TICK - 1)) * 2 - 1
    firefly.style.setProperty("--fly-x", `${(spread * 34 + between(-8, 8)).toFixed(1)}px`)
    firefly.style.setProperty("--fly-y", `${(-between(34, 72)).toFixed(1)}px`)
    firefly.style.setProperty("--fly-sway", `${between(-10, 10).toFixed(1)}px`)
    firefly.style.setProperty("--fly-size", `${between(9, 15).toFixed(1)}px`)
    firefly.style.setProperty("--fly-time", `${between(1.0, 1.5).toFixed(2)}s`)
    firefly.style.setProperty("--fly-wait", `${between(0, 0.15).toFixed(2)}s`)
    burst.append(firefly)
  }
  document.body.append(burst)
  window.setTimeout(() => burst.remove(), GONE_AFTER_MS)
}
