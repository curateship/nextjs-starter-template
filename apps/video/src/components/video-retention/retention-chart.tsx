import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { sceneAt, type ExportScene } from "@/lib/video/export-scenes"
import {
  betterThanOutOf100,
  stillWatchingOutOf100,
  type RetentionPoint,
} from "@/lib/video/retention"

/**
 * YouTube's retention curve laid over the export's scenes
 * (`workspace/docs/retention-curve.md`). The line is how many out of 100
 * viewers are still watching; the shaded band is how many videos of the same
 * length out of 100 this one holds better than, with 50 marked as typical.
 * Both count out of 100, so they share one axis. Behind them, every other
 * scene is shaded and numbered, so a drop lines up with the scene it fell in.
 */

const config: ChartConfig = {
  watching: { label: "Still watching, out of 100", color: "var(--foreground)" },
  better: {
    label: "Better than this many videos this long, out of 100",
    color: "var(--chart-2)",
  },
}

/** Past this many scenes the numbers crowd each other; the shading stays. */
const MAX_NUMBERED_SCENES = 20

type Row = { seconds: number; watching: number; better: number }

export function RetentionChart({
  points,
  lengthSeconds,
  scenes,
}: {
  points: RetentionPoint[]
  /** The video's length on YouTube, which the curve's points are fractions of. */
  lengthSeconds: number
  scenes: ExportScene[]
}) {
  const data: Row[] = points.map((point) => ({
    seconds: Math.round(point.ratio * lengthSeconds * 10) / 10,
    watching: stillWatchingOutOf100(point),
    better: betterThanOutOf100(point),
  }))
  const scenesEndSeconds = (scenes[scenes.length - 1]?.endMs ?? 0) / 1000
  const endSeconds = Math.max(lengthSeconds, scenesEndSeconds, 1)
  // Rewatching lifts the line past 100; the axis grows to keep it on the chart.
  const top = Math.max(
    100,
    Math.ceil(Math.max(0, ...data.map((row) => row.watching)) / 10) * 10
  )
  const numbered = scenes.length <= MAX_NUMBERED_SCENES

  return (
    <div className="grid gap-2">
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <ComposedChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          {scenes.map((scene, index) => (
            <ReferenceArea
              key={`${scene.startMs}-${index}`}
              x1={scene.startMs / 1000}
              x2={scene.endMs / 1000}
              y1={0}
              y2={top}
              fill="var(--muted)"
              fillOpacity={index % 2 === 0 ? 0 : 0.9}
              strokeOpacity={0}
              ifOverflow="hidden"
              label={
                numbered
                  ? {
                      value: String(index + 1),
                      position: "insideTop",
                      className: "fill-muted-foreground",
                      fontSize: 10,
                    }
                  : undefined
              }
            />
          ))}
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="seconds"
            type="number"
            domain={[0, endSeconds]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            tickFormatter={(seconds: number) => `${Math.round(seconds)} s`}
            dy={6}
          />
          <YAxis
            domain={[0, top]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, dx: -5 }}
            width={32}
            allowDecimals={false}
          />
          <ReferenceLine
            y={50}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: "typical",
              position: "insideBottomRight",
              className: "fill-muted-foreground",
              fontSize: 10,
            }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as Row | undefined
                  const at = row ? sceneAt(scenes, row.seconds * 1000) : null
                  return at ? `Scene ${at.number}: ${at.scene.name}` : null
                }}
                formatter={(value, name, item) => {
                  const row = item.payload as Row
                  if (name === "watching") {
                    const at = sceneAt(scenes, row.seconds * 1000)
                    return `${Math.round(row.seconds)} s${at ? `, scene ${at.number}` : ""}, ${value} out of 100 still watching`
                  }
                  return `Better than ${value} out of 100 videos this long`
                }}
              />
            }
          />
          <Area
            dataKey="better"
            type="monotone"
            isAnimationActive={false}
            stroke="none"
            fill="var(--color-better)"
            fillOpacity={0.3}
            activeDot={false}
          />
          <Line
            dataKey="watching"
            type="monotone"
            isAnimationActive={false}
            stroke="var(--color-watching)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ChartContainer>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-foreground" />
          Still watching, out of 100
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-chart-2/30" />
          Better than this many videos this long, out of 100
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm border bg-muted" />
          Numbered columns are the scenes
        </li>
      </ul>
    </div>
  )
}
