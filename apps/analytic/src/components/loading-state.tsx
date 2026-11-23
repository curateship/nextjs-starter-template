import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

// Compact centered spinner for a surface that loads or refreshes on its own
// (tables, grids, trays). Keeps the surface's frame; no skeletons.
export function PanelLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "flex min-h-32 w-full items-center justify-center py-8",
        className
      )}
    >
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

// Full-viewport spinner used only as a route pending fallback while the
// initial route data loads.
export function FullPageLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/60">
      <Loader2Icon
        role="status"
        aria-label="Loading"
        className="size-6 animate-spin text-muted-foreground"
      />
    </main>
  )
}
