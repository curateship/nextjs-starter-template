import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { CircleCheckBigIcon, UserCheckIcon } from "lucide-react"

import { ChartCard, EmptyChart } from "@/components/shared/dashboard/chart-card"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadTrends, type TrendWeek } from "@/lib/api/project/finding"
import { addDays, dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"

const rateConfig: ChartConfig = { rate: { label: "Check-in rate", color: "var(--primary)" } }
const finishedConfig: ChartConfig = { finished: { label: "Tasks finished", color: "var(--primary)" } }

const CHART_HEIGHT = "h-[180px] w-full min-w-0"

/**
 * Trends, opened from the four figures: the check-in rate and the tasks
 * finished, week by week, for the last 12 weeks. Team totals only, never by
 * person: Tyler said the check-in isn't for watching people. Each week counts
 * the way the figures do, so this week's bar is the Completed figure.
 */
export function TeamTrendsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [weeks, setWeeks] = React.useState<TrendWeek[] | null>(null)
  const [error, setError] = React.useState("")
  const [tries, setTries] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadTrends().then(
      (loaded) => {
        if (!live) return
        setWeeks(loaded)
        setError("")
      },
      (failure: unknown) => {
        if (live) setError(getProjectErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [open, tries])

  const rows = (weeks ?? []).map((week, index, all) => ({
    label: dayLabel(week.monday),
    range: `${dayLabel(week.monday)} to ${dayLabel(addDays(week.monday, 6))}${index === all.length - 1 ? ", so far" : ""}`,
    rate: week.checkins.expected ? Math.round((week.checkins.checkedIn / week.checkins.expected) * 100) : null,
    checkins: week.checkins,
    finished: week.finished,
  }))
  const anyCheckins = rows.some((row) => row.rate !== null)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Team trends</DialogTitle>
          <DialogDescription>
            The last 12 weeks, Monday to Sunday, for the whole team. Counted the same way as the
            figures, with this week so far on the right.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error && !weeks ? (
            <ErrorRow message={error} onRetry={() => setTries((n) => n + 1)} />
          ) : !weeks ? (
            <LoadingRow label="Loading the trends…" />
          ) : (
            <>
              <ChartCard icon={UserCheckIcon} title="Check-in rate" meta="Work days, late check-ins count">
                {anyCheckins ? (
                  <div className={CHART_HEIGHT}>
                    <ChartContainer config={rateConfig} className="h-full w-full">
                      <BarChart data={rows}>
                        <CartesianGrid strokeDasharray="0" vertical={false} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={8} interval={1} />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, dx: -5 }}
                          width={40}
                          domain={[0, 100]}
                          ticks={[0, 50, 100]}
                          tickFormatter={(value: number) => `${value}%`}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(_, payload) => payload?.[0]?.payload?.range ?? ""}
                              formatter={(_, __, item) => {
                                const row = item.payload as (typeof rows)[number]
                                return row.rate === null
                                  ? "No work days"
                                  : `${row.rate}%, ${row.checkins.checkedIn} of ${row.checkins.expected}`
                              }}
                            />
                          }
                        />
                        <Bar dataKey="rate" fill="var(--color-rate)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <EmptyChart message="No check-ins were due in these 12 weeks." />
                )}
              </ChartCard>
              <ChartCard icon={CircleCheckBigIcon} title="Tasks finished" meta="Projects you can see">
                <div className={CHART_HEIGHT}>
                  <ChartContainer config={finishedConfig} className="h-full w-full">
                    <BarChart data={rows}>
                      <CartesianGrid strokeDasharray="0" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={8} interval={1} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, dx: -5 }} width={40} allowDecimals={false} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.range ?? ""}
                            formatter={(value) => `${value} finished`}
                          />
                        }
                      />
                      <Bar dataKey="finished" fill="var(--color-finished)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </ChartCard>
              {/* The same numbers as a table, for a screen reader. */}
              <table className="sr-only">
                <caption>Team trends, week by week</caption>
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Check-in rate</th>
                    <th scope="col">Tasks finished</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.range}</th>
                      <td>
                        {row.rate === null
                          ? "No work days"
                          : `${row.rate}%, ${row.checkins.checkedIn} of ${row.checkins.expected}`}
                      </td>
                      <td>{row.finished}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
