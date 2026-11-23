import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The one loading row for a panel that fetches its own contents — a modal's
 * card, a thread, a list inside a dialog. A compact centred spinner sitting in
 * the surface's own frame, never a skeleton and never covering the page.
 *
 * A surface that is *refreshing* rather than loading keeps showing its previous
 * contents instead; this is only for a panel with nothing to show yet.
 */
export function LoadingRow({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid place-items-center py-8 text-sm text-muted-foreground",
        className
      )}
      role="status"
    >
      <span className="flex items-center gap-2">
        <Loader2Icon className="size-4 animate-spin" />
        {label}
      </span>
    </div>
  )
}
