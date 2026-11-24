import * as React from "react"
import { BarChart3Icon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { Meter, type MeterProps } from "@/components/ui/meter"
import { loadSequenceStats } from "@/lib/api/email/sequences"
import { sequenceRate } from "@/lib/broadcasts/sequence-progress"
import { cn } from "@/lib/utils"
import type { SequenceStats } from "@/server/email/sequence-stats"

/**
 * A sequence's numbers, read once when its panel opens (Tyler, 22 Nov 2026:
 * "there's no statistics at all or any sort of progression indicators").
 * Null while loading; a failed read leaves the cards showing nothing rather
 * than numbers that are wrong.
 */
export function useSequenceStats(sequenceId: string) {
  const [stats, setStats] = React.useState<SequenceStats | null>(null)
  React.useEffect(() => {
    let live = true
    setStats(null)
    loadSequenceStats(sequenceId)
      .then((next) => live && setStats(next))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [sequenceId])
  return stats
}

/**
 * The first card, drawn to Tyler's design (23 Nov 2026, "redesign stats
 * card"): two tiles for People and Finished, then one bar per rate. Rates are
 * out of the emails that went, so "48%" opened means 48 of every 100 sent.
 */
export function SequenceStatsCard({ stats }: { stats: SequenceStats | null }) {
  const sent = stats?.totals.sent ?? 0
  const people = stats?.people ?? 0
  const finished = stats?.finished ?? 0
  const rates: { label: string; count: number; tone: MeterProps["tone"] }[] = [
    { label: "Open", count: stats?.totals.opened ?? 0, tone: "default" },
    { label: "Click", count: stats?.totals.clicked ?? 0, tone: "positive" },
    { label: "Bounce", count: stats?.totals.bounced ?? 0, tone: "warning" },
    { label: "Unsub", count: stats?.totals.unsubscribed ?? 0, tone: "critical" },
  ]
  const number = (value: number) => (stats ? value.toLocaleString("en-US") : "-")
  return (
    <PanelCard icon={<BarChart3Icon />} storageId="crm-sequence-stats" title="Statistics">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="grid content-start gap-0.5 rounded-lg bg-muted/60 p-3">
            <span className="text-xs text-muted-foreground">People</span>
            <span className="text-2xl font-semibold tabular-nums">{number(people)}</span>
            <span className="text-xs text-muted-foreground">enrolled</span>
          </div>
          <div className="grid content-start gap-0.5 rounded-lg bg-muted/60 p-3">
            <span className="text-xs text-muted-foreground">Finished</span>
            <span className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">{number(finished)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">/ {number(people)}</span>
            </span>
            <Meter
              value={finished}
              max={people}
              label="Finished"
              valueText={`${finished} of ${people} finished`}
              className="mt-1.5 bg-background"
            />
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2.5">
          {rates.map((rate) => (
            <React.Fragment key={rate.label}>
              <dt className="text-sm text-muted-foreground">{rate.label}</dt>
              <Meter value={sent ? rate.count : 0} max={sent || 1} tone={rate.tone} label={rate.label} />
              <dd className={cn("text-right text-sm font-semibold tabular-nums", !stats && "text-muted-foreground")}>
                {stats ? sequenceRate(rate.count, sent) : "-"}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </PanelCard>
  )
}
