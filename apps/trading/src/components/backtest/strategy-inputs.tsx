import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

/**
 * Read-only config rail for a loaded run. Saved runs are immutable, so this
 * just lists what the run was executed with: window, equity, costs, and the
 * strategy's indicator + settings. Without a run it's a New Run CTA.
 */
export function StrategyInputs({
  title,
  rows,
  onNewRun,
}: {
  /** Strategy/indicator name for the header — null shows the New Run CTA. */
  title: string | null
  rows: { label: string; value: string }[]
  onNewRun: () => void
}) {
  if (!title) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          Create a run to configure a strategy and see its results here.
        </p>
        <Button size="sm" className="gap-1.5" onClick={onNewRun}>
          <PlusIcon className="size-3.5" />
          New Run
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-[11px] font-semibold text-foreground/80">
          Inputs · {title}
        </span>
        <span className="text-[10px] text-muted-foreground">Read-only</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid content-start gap-1.5 p-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-right font-mono text-[11px] tabular-nums">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
