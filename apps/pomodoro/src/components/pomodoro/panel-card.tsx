import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * One panel on the redrawn Pomoder pages: 24px corners, the Pomoder surface,
 * a small capitals label on the left, and on the right either a quiet note
 * (the period it covers) or a control. Leaderboard, the public profile and
 * History all use it, so their sections read as one design.
 */
export function PanelCard({
  label,
  note,
  aside,
  id,
  className,
  children,
}: {
  label: string
  note?: string
  aside?: React.ReactNode
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-[24px] border bg-[var(--p-surface)] p-5 sm:p-6",
        className
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </h3>
        {note ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {note}
          </span>
        ) : null}
        {aside}
      </header>
      {children}
    </section>
  )
}
