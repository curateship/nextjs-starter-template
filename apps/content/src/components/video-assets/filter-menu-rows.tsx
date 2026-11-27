import type * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The rows of a side panel's filter menu, as the Media tab draws them: a
 * small-caps heading per list, and a row per choice with a tick on the one
 * picked. The Media, Videos and Carousels tabs all use them.
 */

/** A small-caps heading in a side panel's filter menu. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </div>
  )
}

/** One row of a filter menu's list: a name, a count, a tick. */
export function ChoiceRow({
  label,
  count,
  on,
  onSelect,
}: {
  label: string
  count?: number
  on: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onSelect}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-accent",
        on && "bg-accent"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="text-muted-foreground tabular-nums">{count}</span>
      ) : null}
      <CheckIcon
        className={cn("size-4 shrink-0 text-(--acc)", !on && "invisible")}
      />
    </button>
  )
}
