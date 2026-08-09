import * as React from "react"
import {
  FileTextIcon,
  Globe2Icon,
  LineChartIcon,
  MonitorSmartphoneIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { chartHeightClassName, ChartCard, EmptyChart, LegendDot } from "@/components/shared/dashboard/chart-card"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { StatStrip, type StatFigure } from "@/components/shared/dashboard/stat-strip"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  TRAFFIC_RANGE_LABELS,
  TRAFFIC_RANGES,
  type TrafficKeyCount,
  type TrafficRange,
  type TrafficSummary,
} from "@/lib/api/traffic"
import { shade } from "@/lib/dashboard/chart-colours"
import { formatSharePercent } from "@/lib/format/format-number"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useTableSort } from "@/lib/hooks/use-table-sort"

/**
 * The admin's Traffic page: how many people visit, what they read, where
 * they came from, and what they read it on. Every figure is a sum over the
 * per-day counter rows the beacon writes — nothing here can name a person.
 */

// One hue, two lightness steps — identity also rides on the legend and the
// tooltip, never on the colour alone.
const MEMBER_COLOUR = "var(--primary)"
const VISITOR_COLOUR = shade(45)

const viewsConfig: ChartConfig = {
  memberViews: { label: "Members", color: MEMBER_COLOUR },
  visitorViews: { label: "Visitors", color: VISITOR_COLOUR },
}

export function AdminTrafficDashboard({
  data,
  range,
}: {
  data: TrafficSummary
  range: TrafficRange
}) {
  const navigate = useListSearchNavigate()

  const figures: StatFigure[] = [
    {
      key: "views",
      label: "Page views",
      value: data.totals.views.toLocaleString(),
      // The site is named here rather than in a heading: it sits under the
      // headline number, so a screenshot of these figures can never be
      // mistaken for another site's.
      footer: data.siteName
        ? `last ${TRAFFIC_RANGE_LABELS[range]} on ${data.siteName}`
        : `last ${TRAFFIC_RANGE_LABELS[range]}`,
    },
    {
      key: "unique",
      label: "Unique visitors",
      value: data.totals.uniqueVisitors.toLocaleString(),
      // Shared and rotating internet connections blur the count either way.
      footer: "approximate — each day counted on its own",
    },
    {
      key: "today",
      label: "Views today",
      value: data.viewsToday.toLocaleString(),
      footer: "since midnight UTC",
    },
    {
      key: "memberShare",
      label: "Member share",
      value: formatSharePercent(data.totals.memberViews, data.totals.views),
      footer: "of views by signed-in members",
    },
  ]

  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <StatStrip figures={figures} />

      <div
        className="grid min-w-0 items-stretch lg:grid-cols-3"
        style={{ gap: pageGutter }}
      >
        <ChartCard
          className="lg:col-span-2"
          icon={LineChartIcon}
          title="Views per day"
          legend={
            <div className="hidden items-center gap-4 sm:flex">
              <LegendDot colour={MEMBER_COLOUR} label="Members" />
              <LegendDot colour={VISITOR_COLOUR} label="Visitors" />
            </div>
          }
          control={
            <Tabs
              value={String(range)}
              onValueChange={(value) =>
                navigate({ days: value === "30" ? undefined : Number(value) })
              }
            >
              <TabsList className="h-8 p-[3px]">
                {TRAFFIC_RANGES.map((key) => (
                  <TabsTrigger key={key} value={String(key)} className="h-full">
                    {TRAFFIC_RANGE_LABELS[key]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        >
          {data.totals.views > 0 ? (
            <ViewsChart daily={data.daily} />
          ) : (
            <EmptyChart message="No visits have been counted yet. They start appearing as soon as somebody opens a page." />
          )}
        </ChartCard>

        <DeviceCard devices={data.devices} totalViews={data.totals.views} />
      </div>

      <div
        className="grid min-w-0 items-start lg:grid-cols-2"
        style={{ gap: pageGutter }}
      >
        <TopTable
          title="Top pages"
          icon={<FileTextIcon className="text-muted-foreground" />}
          nameLabel="Page"
          countLabel="pages"
          rows={data.topPages}
          emptyText="No pages have been viewed yet."
        />
        <TopTable
          title="Top referrers"
          icon={<Globe2Icon className="text-muted-foreground" />}
          nameLabel="Came from"
          countLabel="referrer sites"
          rows={data.topReferrers}
          emptyText="No visits have been counted yet."
        />
      </div>
    </div>
  )
}

function ViewsChart({ daily }: { daily: TrafficSummary["daily"] }) {
  const data = daily.map((point) => ({
    label: new Date(`${point.day}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }),
    memberViews: point.memberViews,
    visitorViews: point.visitorViews,
  }))

  return (
    <div className={chartHeightClassName}>
      <ChartContainer config={viewsConfig} className="h-full w-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            dy={8}
            // A month of days is too many labels to read; a quarter even more so.
            interval={data.length > 45 ? 13 : data.length > 20 ? 5 : 1}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, dx: -5 }}
            width={36}
            allowDecimals={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            dataKey="visitorViews"
            stackId="views"
            fill="var(--color-visitorViews)"
            maxBarSize={28}
          />
          <Bar
            dataKey="memberViews"
            stackId="views"
            fill="var(--color-memberViews)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

const DEVICE_LABELS: Record<string, string> = {
  phone: "Phone",
  tablet: "Tablet",
  computer: "Computer",
}

function DeviceCard({
  devices,
  totalViews,
}: {
  devices: TrafficKeyCount[]
  totalViews: number
}) {
  const config: ChartConfig = {
    views: { label: "Views", color: "var(--primary)" },
  }
  const data = devices.map((row) => ({
    device: DEVICE_LABELS[row.key] ?? row.key,
    views: row.views,
  }))

  return (
    <ChartCard icon={MonitorSmartphoneIcon} title="Devices">
      {totalViews === 0 ? (
        <EmptyChart message="No visits have been counted yet." />
      ) : (
        <div className={chartHeightClassName}>
          <ChartContainer config={config} className="h-full w-full">
            <BarChart
              layout="vertical"
              data={data}
              barSize={24}
              margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
            >
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="device"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                width={64}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="views"
                radius={[0, 4, 4, 0]}
                fill="var(--color-views)"
              />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </ChartCard>
  )
}

// --- Top pages / top referrers ----------------------------------------------

type TopSort = "name" | "views"

/** Views read as a number, so that column starts biggest-first. */
const topSortDirection = (column: TopSort) => (column === "name" ? "asc" : "desc")

function TopTable({
  title,
  icon,
  nameLabel,
  countLabel,
  rows,
  emptyText,
}: {
  title: string
  icon: React.ReactNode
  nameLabel: string
  countLabel: string
  rows: TrafficKeyCount[]
  emptyText: string
}) {
  const { sort, direction, toggleSort } = useTableSort<TopSort>(
    "views",
    "desc",
    topSortDirection
  )

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) =>
      sort === "views"
        ? factor * (a.views - b.views)
        : factor * a.key.localeCompare(b.key)
    )
  }, [rows, sort, direction])

  const columns: SortableColumn<TopSort>[] = [
    { key: "name", label: nameLabel, column: "main" },
    { key: "views", label: "Views", column: "meta" },
  ]

  return (
    <DashboardTable
      title={title}
      icon={icon}
      count={sorted.length}
      header={
        <SortableTableHeader
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          withAriaSort
        />
      }
      isEmpty={sorted.length === 0}
      emptyText={emptyText}
      emptyColSpan={2}
      footer={{ type: "summary", count: sorted.length, label: countLabel }}
    >
      {sorted.map((row) => (
        <TableRow key={row.key}>
          <TableCell column="main">
            <span
              className="block max-w-full truncate text-sm font-medium"
              title={row.key}
            >
              {row.key === "(other)" ? "(everything else)" : row.key}
            </span>
          </TableCell>
          <TableCell column="meta">{row.views.toLocaleString()}</TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
