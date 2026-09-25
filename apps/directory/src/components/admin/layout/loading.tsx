"use client"

import { cn } from "@/lib/utils/tailwind"

/**
 * The one loading state in the admin: the surface keeps its real frame and
 * holds the space, with nothing drawn in it. No skeletons — a shimmering
 * rectangle promises content that may never arrive and drifts out of step with
 * the layout it is pretending to be — and no spinner either (Tyler's call,
 * Jul 31 2026). Screen readers still hear "Loading".
 *
 * `className` sets the footprint so the frame does not jump when the content
 * lands (e.g. `min-h-32` for a table body, `h-full` for a builder canvas).
 */
export function AdminLoading({
  className,
  label = "Loading",
}: {
  className?: string
  label?: string
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("min-h-32 w-full p-6", className)}
    />
  )
}
