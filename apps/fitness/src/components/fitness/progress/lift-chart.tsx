import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartLegend } from "@/components/fitness/progress/chart-legend"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadLiftChart, type LiftPoint, type LiftRecord } from "@/lib/api/fitness/progress"
import { seriesColour } from "@/lib/dashboard/chart-colours"
import { formatDay } from "@/lib/fitness/dates"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { fromKg, type WeightUnit } from "@/lib/fitness/weights"

export type LiftMetric = "oneRepMax" | "heaviest"

/**
 * The chart in the Progress view's lift card: for each day a lift was
 * trained, its best one-rep max (the heaviest it could likely lift once,
 * worked out from its sets) or the heaviest weight actually lifted, as the
 * card's One-rep max and Heaviest choice says. Comparing draws up to four
 * lifts, one line each, and a lift keeps the colour of its place in the
 * comparison. The card around it holds the heading and the choices.
 */
export function LiftChart({
  personId,
  records,
  exerciseIds,
  metric,
  unit,
}: {
  personId: string
  records: readonly LiftRecord[]
  /** One lift, or up to four to compare. */
  exerciseIds: readonly string[]
  metric: LiftMetric
  unit: WeightUnit
}) {
  const key = `${personId}:${exerciseIds.join(",")}`
  const [result, setResult] = React.useState<{
    key: string | null
    histories: Record<string, LiftPoint[]> | null
    error: string | null
  }>({ key: null, histories: null, error: null })

  React.useEffect(() => {
    // Everything this reads comes out of `key`, so a fresh array from the
    // parent each render never asks again.
    const [person, list] = key.split(":")
    const ids = list ? list.split(",") : []
    if (ids.length === 0) return
    // A newer pick must not be overwritten by an older answer arriving late.
    let current = true
    void Promise.all(ids.map((id) => loadLiftChart(id, person)))
      .then((answers) => {
        if (!current) return
        setResult({
          key,
          histories: Object.fromEntries(ids.map((id, index) => [id, answers[index]])),
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (current) setResult({ key, histories: null, error: getFitnessErrorMessage(error) })
      })
    return () => {
      current = false
    }
  }, [key])

  const names = new Map(records.map((record) => [record.exerciseId, record.name]))
  if (exerciseIds.length === 0) return <Waiting>Finish a workout and its lifts show here, one line each.</Waiting>
  if (result.key !== key) return <LoadingRow label="Loading the lift" />
  if (result.error) return <Waiting>{result.error}</Waiting>
  return (
    <LiftLines
      exerciseIds={exerciseIds}
      histories={result.histories ?? {}}
      names={names}
      metric={metric}
      unit={unit}
    />
  )
}

/**
 * A chart with no line yet, as Tyler drew it on 18 Oct 2026: a dashed box with
 * a dot, a dotted path and an empty ring, over the sentence that says why.
 */
function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-48 place-content-center justify-items-center gap-3 rounded-xl border border-dashed p-6 text-center">
      <span aria-hidden className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-foreground" />
        <span className="w-20 border-t-2 border-dotted border-muted-foreground/50" />
        <span className="size-2.5 rounded-full border-2 border-dashed border-muted-foreground/60" />
      </span>
      <p className="max-w-64 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function LiftLines({
  exerciseIds,
  histories,
  names,
  metric,
  unit,
}: {
  exerciseIds: readonly string[]
  histories: Record<string, LiftPoint[]>
  names: Map<string, string>
  metric: LiftMetric
  unit: WeightUnit
}) {
  const days = [...new Set(exerciseIds.flatMap((id) => (histories[id] ?? []).map((point) => point.day)))].sort()
  const enoughPoints = exerciseIds.some((id) => (histories[id]?.length ?? 0) >= 2)
  if (!enoughPoints) return <Waiting>Log this lift twice to see a line.</Waiting>

  const round = (kg: number) => Math.round(fromKg(kg, unit) * 10) / 10
  const data = days.map((day) => {
    const row: Record<string, string | number | null> = { day, label: formatDay(day) }
    exerciseIds.forEach((id, index) => {
      const point = histories[id]?.find((entry) => entry.day === day)
      row[`lift${index}`] = point ? round(metric === "heaviest" ? point.heaviestKg : point.oneRepMaxKg) : null
    })
    return row
  })

  const metricLabel = metric === "heaviest" ? "Heaviest lifted" : "Best one-rep max"
  const config: ChartConfig = Object.fromEntries(
    exerciseIds.map((id, index) => [
      `lift${index}`,
      { label: exerciseIds.length > 1 ? (names.get(id) ?? "Lift") : metricLabel, color: seriesColour(index) },
    ])
  )
  const legend = exerciseIds.map((_, index) => ({
    key: `lift${index}`,
    label: String(config[`lift${index}`].label),
    color: seriesColour(index),
    mark: "line" as const,
  }))

  return (
    <div className="grid gap-3">
      {legend.length > 1 ? <ChartLegend items={legend} /> : null}
      <div className="h-56 w-full min-w-0">
        <ChartContainer config={config} className="h-full w-full">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              width={40}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => String(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-3">
                      <span className="text-muted-foreground">{String(config[String(name)]?.label ?? name)}</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {String(value)} {unit}
                      </span>
                    </span>
                  )}
                />
              }
            />
            {exerciseIds.map((_, index) => (
              <Line
                key={index}
                dataKey={`lift${index}`}
                type="monotone"
                stroke={`var(--color-lift${index})`}
                strokeWidth={2}
                dot={{ r: 3, fill: `var(--color-lift${index})`, stroke: "var(--card)", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  )
}
