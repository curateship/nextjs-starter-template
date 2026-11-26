import type * as React from "react"

/**
 * A 1px moving rainbow edge around a button, so the eye finds it: the "N
 * selected" button, the picked saved view, and a running flow's Run button.
 * It holds still for anyone whose device asks for less motion. The button
 * inside draws its own background, with `border-transparent` and an inset
 * focus ring so the ring is not cut off by the edge.
 */
export function RainbowEdge({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex shrink-0 overflow-hidden rounded-lg p-px">
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 animate-spin bg-[conic-gradient(#ef4444,#f97316,#eab308,#22c55e,#3b82f6,#8b5cf6,#ec4899,#ef4444)] [animation-duration:2.5s] motion-reduce:animate-none"
      />
      {children}
    </span>
  )
}
