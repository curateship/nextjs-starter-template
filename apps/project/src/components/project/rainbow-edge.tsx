import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A 1px rainbow that runs round whatever it holds, so the eye finds it
 * (Tyler, 19 Oct 2026): the "N selected" button and the running clock's
 * Doing chip. It holds still for anyone whose device asks for less motion.
 * The child sits on top with its own background, so only the edge shows.
 */
export function RainbowEdge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("relative inline-flex shrink-0 overflow-hidden p-px", className)}>
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 animate-spin bg-[conic-gradient(#ef4444,#f97316,#eab308,#22c55e,#3b82f6,#8b5cf6,#ec4899,#ef4444)] [animation-duration:2.5s] motion-reduce:animate-none"
      />
      {children}
    </span>
  )
}
