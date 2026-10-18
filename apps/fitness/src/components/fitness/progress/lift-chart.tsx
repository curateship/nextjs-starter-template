import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartLegend } from "@/components/fitness/progress/chart-legend"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import { loadLiftChart, type LiftPoint, type LiftRecord } from "@/lib/api/fitness/progress"
import { seriesColour } from "@/lib/dashboard/chart-colours"
import { formatDay } from "@/lib/fitness/dates"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { fromKg, type WeightUnit } from "@/lib/fitness/weights"

/**
 * One lift's estimated one-rep max (the heaviest it could likely lift once,
 * worked out from its sets) for each day it was trained. With "Heaviest" on,
 * the heaviest weight actually lifted that day is a second, dashed line.
 *
 * Drawn as a section of the program dashboard's Progress view, with no card
 * of its own: the panel is the surface. Ticking lifts in the records list
 * compares up to four of them, one line each. A filter never repaints a lift: each keeps the colour of its place in
 * the comparison.
 */
export function LiftChart({
  personId,
  records,
  exerciseIds,
  unit,
}: {
  personId: string
  records: readonly LiftRecord[]
  /** One lift, or up to four to compare. */
  exerciseIds: readonly string[]
  unit: WeightUnit
}) {
  const [showHeaviest, setShowHeaviest] = React.useState(false)
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

  const comparing = exerciseIds.length > 1
  const names = new Map(records.map((record) => [record.exerciseId, record.name]))
  const title = comparing
    ? "Lifts compared · best one-rep max"
    : exerciseIds[0]
      ? (names.get(exerciseIds[0]) ?? "Lift")
      : "Lift"
  const answered = result.key === key

  return (
    <section className="grid gap-3 border-b p-3" aria-label="Lift chart">
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {title}
          {comparing || exerciseIds.length === 0 ? null : (
            <span className="font-normal text-muted-foreground"> · best one-rep max</span>
          )}
        </h3>
        {comparing || exerciseIds.length === 0 ? null : (
          <div className="flex items-center gap-2">
            <Switch id="lift-chart-heaviest" checked={showHeaviest} onCheckedChange={setShowHeaviest} />
            <Label htmlFor="lift-chart-heaviest" className="text-xs font-normal">
              Heaviest
            </Label>
          </div>
        )}
      </div>
      {exerciseIds.length === 0 ? (
        <Message>Finish a workout and its lifts show here, one line each.</Message>
      ) : !answered ? (
        <LoadingRow label="Loading the lift" />
      ) : result.error ? (
        <Message>{result.error}</Message>
      ) : (
        <LiftLines
          exerciseIds={exerciseIds}
          histories={result.histories ?? {}}
          names={names}
          unit={unit}
          showHeaviest={showHeaviest && !comparing}
        />
      )}
    </section>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>
}

function LiftLines({
  exerciseIds,
  histories,
  names,
  unit,
  showHeaviest,
}: {
  exerciseIds: readonly string[]
  histories: Record<string, LiftPoint[]>
  names: Map<string, string>
  unit: WeightUnit
  showHeaviest: boolean
}) {
  const days = [...new Set(exerciseIds.flatMap((id) => (histories[id] ?? []).map((point) => point.day)))].sort()
  const enoughPoints = exerciseIds.some((id) => (histories[id]?.length ?? 0) >= 2)
  if (!enoughPoints) return <Message>Log this lift twice to see a line.</Message>

  const round = (kg: number) => Math.round(fromKg(kg, unit) * 10) / 10
  const data = days.map((day) => {
    const row: Record<string, string | number | null> = { day, label: formatDay(day) }
    exerciseIds.forEach((id, index) => {
      const point = histories[id]?.find((entry) => entry.day === day)
      row[`lift${index}`] = point ? round(point.oneRepMaxKg) : null
      if (index === 0) row.heaviest = point ? round(point.heaviestKg) : null
    })
    return row
  })

  const config: ChartConfig = Object.fromEntries([
    ...exerciseIds.map((id, index) => [
      `lift${index}`,
      { label: exerciseIds.length > 1 ? (names.get(id) ?? "Lift") : "Best one-rep max", color: seriesColour(index) },
    ]),
    ["heaviest", { label: "Heaviest", color: seriesColour(2) }],
  ])
  const legend = [
    ...exerciseIds.map((_, index) => ({
      key: `lift${index}`,
      label: String(config[`lift${index}`].label),
      color: seriesColour(index),
      mark: "line" as const,
    })),
    ...(showHeaviest ? [{ key: "heaviest", label: "Heaviest", color: seriesColour(2), mark: "dashed" as const }] : []),
  ]

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
            {showHeaviest ? (
              <Line
                dataKey="heaviest"
                type="monotone"
                stroke="var(--color-heaviest)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  )
}
