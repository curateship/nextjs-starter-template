"use client"

import { useEffect, useState } from "react"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import MinusCircle from "lucide-react/dist/esm/icons/circle-minus.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AutomationRunItem, AutomationRunStatus, AutomationStepStatus } from "@/features/automations/domain/types"
import { cn } from "@/lib/utils/tailwind"

export function AutomationRunHistory({ runs }: { runs: AutomationRunItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(runs[0]?.id ?? null)
  useEffect(() => { if (!selectedId || !runs.some((run) => run.id === selectedId)) setSelectedId(runs[0]?.id ?? null) }, [runs, selectedId])
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-4"><div className="text-xs font-semibold">Run history</div><div className="text-[10px] text-muted-foreground">{runs.length} recent runs</div></div>
      {runs.length === 0 ? <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Run this automation to see node-level results.</div> : (
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <ScrollArea className="border-r">
            <div className="grid gap-1 p-2">
              {runs.map((run) => (
                <button key={run.id} type="button" onClick={() => setSelectedId(run.id)} className={cn("rounded-md p-2 text-left hover:bg-accent", selected?.id === run.id && "bg-accent")}>
                  <div className="flex items-center justify-between gap-2"><RunBadge status={run.status} /><span className="text-[10px] capitalize text-muted-foreground">{run.triggerType}</span></div>
                  <div className="mt-1.5 text-xs">{formatDateTime(run.startedAt)}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{formatDuration(run.durationMs)}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
          <ScrollArea>
            {selected ? (
              <div className="min-w-[520px] p-3">
                {selected.error ? <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{selected.error}</div> : null}
                <div className="grid gap-2">
                  {selected.steps.map((step) => (
                    <div key={step.id} className="grid grid-cols-[minmax(130px,1fr)_90px_90px_minmax(170px,1.4fr)] items-start gap-3 rounded-lg border p-2.5 text-xs">
                      <div className="min-w-0"><div className="truncate font-medium">{step.nodeName}</div><div className="text-[10px] capitalize text-muted-foreground">{step.nodeKind}</div></div>
                      <div className="flex items-center gap-1.5"><StepIcon status={step.status} /><span className="capitalize">{step.status}</span></div>
                      <div className="text-muted-foreground">{formatDuration(step.durationMs)}{step.attemptCount > 1 ? <div className="text-[10px]">{step.attemptCount} attempts</div> : null}</div>
                      <StepSummary output={step.outputSummary} error={step.error} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

function RunBadge({ status }: { status: AutomationRunStatus }) {
  if (status === "success") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Success</Badge>
  if (status === "partial") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Partial</Badge>
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>
  if (status === "running") return <Badge variant="secondary">Running</Badge>
  return <Badge variant="outline">No changes</Badge>
}

function StepIcon({ status }: { status: AutomationStepStatus }) {
  if (status === "success") return <CheckCircle2 className="size-3.5 text-emerald-600" />
  if (status === "failed") return <XCircle className="size-3.5 text-destructive" />
  if (status === "skipped") return <MinusCircle className="size-3.5 text-muted-foreground" />
  if (status === "running") return <Clock3 className="size-3.5 text-amber-600" />
  return <CircleDashed className="size-3.5 text-muted-foreground" />
}

function StepSummary({ output, error }: { output: Record<string, unknown>; error: string | null }) {
  if (error) return <div className="line-clamp-2 text-destructive" title={error}>{error}</div>
  if (typeof output.url === "string" && typeof output.title === "string") return <a href={output.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-primary hover:underline"><span className="truncate">{output.title}</span><ExternalLink className="size-3 shrink-0" /></a>
  if (typeof output.title === "string") return <div className="truncate" title={output.title}>{output.title}</div>
  if (typeof output.changedCount === "number") return <div>{output.changedCount} changed page{output.changedCount === 1 ? "" : "s"}{typeof output.unchangedCount === "number" ? ` · ${output.unchangedCount} unchanged` : ""}</div>
  if (output.routeCounts && typeof output.routeCounts === "object") return <div className="truncate text-muted-foreground">{Object.entries(output.routeCounts as Record<string, unknown>).map(([route, count]) => `${route.replace(/^route:/, "")}: ${count}`).join(" · ")}</div>
  if (output.fired) return <div className="text-muted-foreground">Schedule started</div>
  return <div className="text-muted-foreground">No output</div>
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

function formatDuration(value: number | null) {
  if (value == null) return "—"
  if (value < 1000) return `${value} ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`
  return `${(value / 60_000).toFixed(1)} min`
}
