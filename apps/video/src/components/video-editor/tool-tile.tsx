import type { LucideIcon } from "lucide-react"

import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * One tool as a tile: its icon, its name and a line on what it does. The AI
 * panel draws its tools with it, and the Transcript panel draws Captions and
 * Tighten, so the tools look the same wherever they sit.
 */
export function ToolTile({
  label,
  description,
  Icon,
  onPress,
}: {
  label: string
  description: string
  Icon: LucideIcon
  onPress: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "flex w-full items-start gap-2 overflow-hidden rounded-lg border border-foreground/5 bg-card p-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/30",
        focusRingInset
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate text-xs font-medium">{label}</span>
        <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  )
}
