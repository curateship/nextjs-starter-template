import {
  CheckIcon,
  ChevronsDownIcon,
  Loader2Icon,
  MinusIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
  AutomationRunDetail,
  AutomationRunSummary,
  AutomationStepItem,
} from "@/lib/api/automations"
import { cn } from "@/lib/utils"

import { AutomationPanelToggles } from "./automation-panel-toggles"

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const TRIGGER_LABELS: Record<AutomationRunSummary["trigger_type"], string> = {
  manual: "Manual",
  schedule: "Schedule",
  creator_posted: "Creator posted",
}

function runDuration(run: AutomationRunSummary): string | null {
  if (!run.started_at || !run.finished_at) return null
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(run.finished_at).getTime() -
        new Date(run.started_at).getTime()) /
        1000
    )
  )
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function StatusIcon({
  status,
  className,
}: {
  status: AutomationRunSummary["status"] | AutomationStepItem["status"]
  className?: string
}) {
  if (status === "running") {
    return (
      <Loader2Icon className={cn("animate-spin text-primary", className)} />
    )
  }
  if (status === "completed") {
    return (
      <CheckIcon
        className={cn("text-emerald-600 dark:text-emerald-400", className)}
      />
    )
  }
  if (status === "failed") {
    return <XIcon className={cn("text-destructive", className)} />
  }
  if (status === "skipped" || status === "canceled") {
    return <MinusIcon className={cn("text-muted-foreground", className)} />
  }
  // queued / pending
  return (
    <span
      className={cn(
        "inline-block rounded-full bg-muted-foreground/50",
        className
      )}
      style={{ transform: "scale(0.45)" }}
    />
  )
}

// Bottom panel: recent runs on the left, the selected run's steps on the
// right. Statuses refresh from the editor's poll while a run is live.
export function AutomationRunsPanel({
  runs,
  selectedRun,
  selectedRunId,
  onSelectRun,
  onCollapse,
  showPanelToggles = false,
  paletteCollapsed = false,
  inspectorCollapsed = false,
  onTogglePalette,
  onToggleInspector,
}: {
  runs: AutomationRunSummary[]
  selectedRun: AutomationRunDetail | null
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  onCollapse: () => void
  showPanelToggles?: boolean
  paletteCollapsed?: boolean
  inspectorCollapsed?: boolean
  onTogglePalette?: () => void
  onToggleInspector?: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b p-4">
        <h2 className="text-xs font-semibold tracking-wide uppercase">Runs</h2>
        <span className="text-xs text-muted-foreground">
          {runs.length} {runs.length === 1 ? "run" : "runs"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {showPanelToggles && onTogglePalette && onToggleInspector ? (
            <AutomationPanelToggles
              paletteCollapsed={paletteCollapsed}
              inspectorCollapsed={inspectorCollapsed}
              onTogglePalette={onTogglePalette}
              onToggleInspector={onToggleInspector}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Collapse runs panel"
            onClick={onCollapse}
          >
            <ChevronsDownIcon className="size-4" />
          </Button>
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">
          No runs yet. Press Run to start this automation.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ScrollArea className="min-h-0 w-64 shrink-0 border-r">
            <div role="list" aria-label="Recent runs" className="grid gap-1 p-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  role="listitem"
                  onClick={() => onSelectRun(run.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    run.id === selectedRunId && "bg-muted"
                  )}
                >
                  <StatusIcon status={run.status} className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {TRIGGER_LABELS[run.trigger_type]}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {timeFormatter.format(new Date(run.created_at))}
                      {runDuration(run) ? ` · ${runDuration(run)}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>

          <ScrollArea className="min-h-0 flex-1">
            {selectedRun ? (
              <div className="grid gap-2 p-3 text-xs">
                {selectedRun.run.error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive"
                  >
                    {selectedRun.run.error}
                  </p>
                ) : null}
                {selectedRun.steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-3 rounded-md border bg-muted/20 px-3 py-2"
                  >
                    <StatusIcon
                      status={step.status}
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {step.node_name}
                        {step.attempts > 1 ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            attempt {step.attempts}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "block text-[11px]",
                          step.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {step.status === "failed"
                          ? (step.error ?? "Step failed")
                          : typeof step.output?.summary === "string"
                            ? step.output.summary
                            : step.status === "skipped"
                              ? "Skipped."
                              : step.status === "running"
                                ? "Running…"
                                : "Waiting for earlier steps."}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-4 text-xs text-muted-foreground">
                Select a run to see its steps.
              </p>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
