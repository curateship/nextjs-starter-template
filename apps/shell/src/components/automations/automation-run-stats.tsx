import * as React from "react"
import { BarChart3Icon, WorkflowIcon } from "lucide-react"

import { RecordFrame } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { Meter, type MeterProps } from "@/components/ui/meter"
import { loadAutomationRunStats, type AutomationRunStats } from "@/lib/api/automations/automation-runs"
import { cn } from "@/lib/utils"

/**
 * A live flow's numbers, read when the panel opens and again whenever
 * `readAgain` changes (a run started from the canvas). Null while loading; a
 * failed read leaves the card showing dashes rather than numbers that are
 * wrong.
 */
function useAutomationRunStats(automationId: string, readAgain: unknown) {
  const [stats, setStats] = React.useState<AutomationRunStats | null>(null)
  React.useEffect(() => {
    let current = true
    loadAutomationRunStats(automationId)
      .then((next) => current && setStats(next))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [automationId, readAgain])
  return stats
}

/**
 * The right panel of a live flow with no step picked (Tyler, 23 Nov 2026: "If
 * live is on the right panel should show runs total stats with a stats
 * card"). The card is drawn like a sequence's Statistics card: two tiles, then
 * one bar per way a run can stand, each out of every run. Test runs are not
 * counted.
 */
export function AutomationRunStatsPanel({
  automationId,
  name,
  readAgain,
}: {
  automationId: string
  name: string
  readAgain?: unknown
}) {
  const stats = useAutomationRunStats(automationId, readAgain)
  const total = stats?.total ?? 0
  const completed = stats?.completed ?? 0
  const rows: { label: string; count: number; tone: MeterProps["tone"] }[] = [
    { label: "Running", count: stats?.running ?? 0, tone: "default" },
    { label: "Waiting", count: stats?.waiting ?? 0, tone: "warning" },
    { label: "Failed", count: stats?.failed ?? 0, tone: "critical" },
    { label: "Stopped", count: stats?.stopped ?? 0, tone: "muted" },
  ]
  const number = (value: number) => (stats ? value.toLocaleString("en-US") : "-")
  return (
    <RecordFrame
      avatar={<WorkflowIcon aria-hidden />}
      title={name}
      hideLabel="Hide the statistics"
      body={
        <PanelCard icon={<BarChart3Icon />} storageId="automation-run-stats" title="Statistics">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid content-start gap-0.5 rounded-lg bg-muted/60 p-3">
                <span className="text-xs text-muted-foreground">Runs</span>
                <span className="text-2xl font-semibold tabular-nums">{number(total)}</span>
                <span className="text-xs text-muted-foreground">in total</span>
              </div>
              <div className="grid content-start gap-0.5 rounded-lg bg-muted/60 p-3">
                <span className="text-xs text-muted-foreground">Completed</span>
                <span className="flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums">{number(completed)}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">/ {number(total)}</span>
                </span>
                <Meter
                  value={completed}
                  max={total}
                  label="Completed"
                  valueText={`${completed} of ${total} completed`}
                  className="mt-1.5 bg-background"
                />
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2.5">
              {rows.map((row) => (
                <React.Fragment key={row.label}>
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <Meter value={total ? row.count : 0} max={total || 1} tone={row.tone} label={row.label} />
                  <dd className={cn("text-right text-sm font-semibold tabular-nums", !stats && "text-muted-foreground")}>
                    {stats ? number(row.count) : "-"}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        </PanelCard>
      }
    />
  )
}
