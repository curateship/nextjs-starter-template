import * as React from "react"
import { LineChartIcon } from "lucide-react"
import { Area, AreaChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import { CardHeaderRow, FeedCard } from "@/components/shared/feed-card"
import { CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Tabs } from "@/components/ui/tabs"
import { UnderlineTab, UnderlineTabsList } from "@/components/ui/underline-tabs"
import {
  loadTrafficSummary,
  TRAFFIC_RANGE_LABELS,
  type TrafficRange,
  type TrafficSummary,
} from "@/lib/api/traffic"
import { cn } from "@/lib/utils"

/**
 * Visitors over time: one line per day for the range you pick, read from the
 * traffic counters the beacon writes. It replaced a bar chart of stand-in
 * numbers — this card only ever draws what the app actually counted.
 *
 * It fetches its own figures rather than riding on the Overview's loader,
 * because changing the range has to fetch anyway and the whole dashboard
 * should not reload to redraw one card.
 */

/** The ranges this card offers, in the order the tabs read. */
const RANGES: TrafficRange[] = [1, 7, 30, 365]

const visitorsConfig: ChartConfig = {
  views: { label: "Views", color: "var(--foreground)" },
}

export function VisitorsCard({
  title = "Visitors over time",
  className,
}: {
  title?: string
  className?: string
}) {
  const [range, setRange] = React.useState<TrafficRange>(7)
  // One piece of state, carrying the range it answers, so switching ranges
  // cannot leave the previous range's failure or figures on screen. Nothing
  // has answered yet while the range is null, which is what "loading" means.
  const [result, setResult] = React.useState<{
    range: TrafficRange | null
    summary: TrafficSummary | null
  }>({ range: null, summary: null })

  React.useEffect(() => {
    // A range switched again before the first answer lands must not overwrite
    // the newer one, so a stale reply is thrown away rather than drawn.
    let current = true
    void loadTrafficSummary(range)
      .then((summary) => {
        if (current) setResult({ range, summary })
      })
      .catch(() => {
        if (current) setResult({ range, summary: null })
      })
    return () => {
      current = false
    }
  }, [range])

  // Anything answering a range you have already left is last range's news.
  const answered = result.range === range
  const summary = answered ? result.summary : null
  const failed = answered && !summary
  const days = summary?.daily ?? []
  const total = days.reduce(
    (sum, day) => sum + day.memberViews + day.visitorViews,
    0
  )

  return (
    <FeedCard className={cn("flex flex-col", className)}>
      <CardHeaderRow
        icon={LineChartIcon}
        title={title}
        meta={
          summary
            ? `daily totals, ${TRAFFIC_RANGE_LABELS[range].toLowerCase()}`
            : undefined
        }
        metaClassName="hidden 2xl:flex"
      >
        <Tabs
          className="h-full"
          value={String(range)}
          onValueChange={(value) => setRange(Number(value) as TrafficRange)}
        >
          {/* `-mb-px` so the line under the chosen range lands on the card's
              own hairline rather than a pixel above it. */}
          <UnderlineTabsList className="-mb-px">
            {RANGES.map((key) => (
              <UnderlineTab
                key={key}
                value={String(key)}
                label={TRAFFIC_RANGE_LABELS[key]}
              />
            ))}
          </UnderlineTabsList>
        </Tabs>
      </CardHeaderRow>
      <CardContent className="flex min-h-0 flex-1 flex-col py-4 sm:px-5 sm:py-5">
        {failed ? (
          <ChartMessage>The visitor numbers could not be loaded.</ChartMessage>
        ) : !summary ? (
          <ChartMessage>Loading…</ChartMessage>
        ) : total === 0 ? (
          <ChartMessage>No visits counted in this range yet.</ChartMessage>
        ) : (
          <VisitorsChart daily={days} />
        )}
      </CardContent>
    </FeedCard>
  )
}

/**
 * Takes the space the chart would have had. The page-sized `EmptyChart` has a
 * 200px floor, which is taller than this card gets in a dashboard column — the
 * card would clip the message rather than centre it.
 */
function ChartMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-center text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function VisitorsChart({ daily }: { daily: TrafficSummary["daily"] }) {
  const data = daily.map((point) => ({
    label: new Date(`${point.day}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }),
    views: point.memberViews + point.visitorViews,
  }))

  // A number over every dot is only readable while there are few enough dots
  // to fit them; past that they overlap into a smear.
  const labelled = data.length <= 35

  return (
    <div className="h-[140px] w-full min-w-0 xl:h-auto xl:min-h-[120px] xl:flex-1">
      <ChartContainer config={visitorsConfig} className="h-full w-full">
        <AreaChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            dy={6}
            interval={data.length > 45 ? 29 : data.length > 20 ? 4 : 0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, dx: -5 }}
            width={32}
            allowDecimals={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            dataKey="views"
            type="natural"
            isAnimationActive={false}
            stroke="var(--color-views)"
            strokeWidth={2}
            fill="var(--color-views)"
            fillOpacity={0.08}
            dot={labelled ? { r: 2.5, fill: "var(--color-views)" } : false}
            activeDot={{ r: 4 }}
          >
            {labelled ? (
              <LabelList
                dataKey="views"
                position="top"
                offset={8}
                className="fill-foreground"
                fontSize={10}
              />
            ) : null}
          </Area>
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
