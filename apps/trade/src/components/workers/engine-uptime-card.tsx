import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Card, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatClockTime, formatDate } from "@/lib/format/format-time"
import type { EngineUptime } from "@/lib/trade/engine-uptime"

function stamp(value: string) {
  return `${formatDate(value)}, ${formatClockTime(value, { seconds: true })}`
}

function minutes(milliseconds: number) {
  const value = (milliseconds / 60_000).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })
  return `${value} ${Number((milliseconds / 60_000).toFixed(1)) === 1 ? "minute" : "minutes"}`
}

export function EngineUptimeCard({ uptime }: { uptime: EngineUptime }) {
  return (
    <Card className="gap-0 py-0">
      <DashboardCardHeader>
        <CardTitle>Engine uptime over the last 30 days</CardTitle>
      </DashboardCardHeader>
      <div className="space-y-1 border-b p-3 text-sm">
        <p>
          Down {uptime.outages.length.toLocaleString()}{" "}
          {uptime.outages.length === 1 ? "time" : "times"},{" "}
          {minutes(uptime.totalDowntimeMs)} in all
        </p>
        <p className="text-xs text-muted-foreground">
          Downtime within the last 30 days. Read {stamp(uptime.checkedAt)}.
          Reload to update.
        </p>
      </div>
      {uptime.outages.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          No outages recorded in the last 30 days.
        </p>
      ) : (
        <ScrollArea viewportClassName="max-h-[26rem]">
          <ul aria-label="Engine outages">
            {uptime.outages.map((outage) => (
              <li
                key={outage.startedAt}
                className="border-b p-3 last:border-b-0"
              >
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Started</dt>
                    <dd className="tabular-nums">{stamp(outage.startedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Ended</dt>
                    <dd className="tabular-nums">
                      {outage.endedAt ? stamp(outage.endedAt) : "Ongoing"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Duration</dt>
                    <dd className="tabular-nums">
                      {minutes(outage.durationMs)}
                      {outage.endedAt ? "" : " so far"}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </Card>
  )
}
