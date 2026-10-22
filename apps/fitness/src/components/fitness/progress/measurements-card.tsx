import * as React from "react"
import { CartesianGrid, LineChart, Line, XAxis, YAxis } from "recharts"

import { PanelCard } from "@/components/fitness/panel-card"
import { changeWords, roundTenth } from "@/components/fitness/photos/measurements"
import { SegmentedChoice } from "@/components/fitness/segmented-choice"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { MeasurementDay } from "@/lib/api/fitness/progress"
import { seriesColour } from "@/lib/dashboard/chart-colours"
import { formatDay } from "@/lib/fitness/dates"
import { MEASUREMENTS, type MeasurementKey } from "@/lib/fitness/templates"

const config: ChartConfig = { value: { label: "Measurement", color: seriesColour(0) } }

const CHOICES = MEASUREMENTS.map((entry) => ({ value: entry.key, label: entry.label }))

/**
 * Tape measurements over time, under Bodyweight on Progress's right panel
 * (Tyler, 21 Oct 2026). One measurement at a time, Waist to start: each
 * photo day holding it is a dot on the line, and under the chart how much it
 * changed since the first. The measurements belong to the person, so every
 * program shows the same chart. Null means the person hasn't let this coach
 * see their photo days, and the card is left out.
 */
export function MeasurementsCard({ days }: { days: readonly MeasurementDay[] | null }) {
  const [picked, setPicked] = React.useState<MeasurementKey>("waistCm")
  if (days === null) return null
  const label = MEASUREMENTS.find((entry) => entry.key === picked)?.label ?? "Waist"
  const points = days.flatMap((entry) => {
    const value = entry[picked]
    return value === null ? [] : [{ day: entry.day, label: formatDay(entry.day), value: Math.round(value * 10) / 10 }]
  })
  const first = points[0]
  const latest = points[points.length - 1]
  const change = first && latest && points.length > 1 ? latest.value - first.value : null

  return (
    <PanelCard storageId="fitness-right-measurements" title="Measurements" meta={latest ? `${roundTenth(latest.value)} cm` : undefined}>
      <SegmentedChoice
        label="Which measurement the line shows"
        value={picked}
        options={CHOICES}
        onChange={setPicked}
      />
      {points.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Add measurements to two photo days to see a line.
        </p>
      ) : (
        <>
          <div className="h-40 w-full min-w-0">
            <ChartContainer config={config} className="h-full w-full">
              <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  width={36}
                  domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="flex w-full justify-between gap-3">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium text-foreground tabular-nums">{roundTenth(Number(value))} cm</span>
                        </span>
                      )}
                    />
                  }
                />
                <Line
                  dataKey="value"
                  type="monotone"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-value)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </div>
          {change !== null && first && latest ? (
            <p className="text-[13px]">
              {label} {roundTenth(latest.value)} cm, {changeWords(change, "cm")} since {formatDay(first.day)}.
            </p>
          ) : null}
        </>
      )}
    </PanelCard>
  )
}
