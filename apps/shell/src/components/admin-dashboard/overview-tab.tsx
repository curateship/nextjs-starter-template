import * as React from "react"

import { MemberName } from "@/components/admin-dashboard/admin-parts"
import { SideRows, type SideRow } from "@/components/shared/notes/side-rows"
import {
  deviceRows,
  EMPTY_TEXT,
  featureRows,
  meterRows,
  modelRows,
  referrerRows,
  topPageRows,
} from "@/components/admin-dashboard/figure-rows"
import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid, type WidgetMenuProps } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { EmptyChart, LegendDot } from "@/components/shared/dashboard/chart-card"
import { DailyBarChart } from "@/components/shared/dashboard/daily-bar-chart"
import { SortableTableHeader, type SortableColumn } from "@/components/shared/sortable-table-header"
import type { ChartConfig } from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import type { OverviewFigures } from "@/lib/admin-dashboard/overview-figures"
import {
  SHELL_WIDGETS,
  type ShellWidgetId,
  type WidgetLayout,
} from "@/lib/admin-dashboard/overview-widgets"
import type { AnalyticsRange } from "@/lib/analytics/range"
import { shade } from "@/lib/dashboard/chart-colours"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { sortRows, useTableSort, type SortKey } from "@/lib/hooks/use-table-sort"

/**
 * Admin, Overview: the shell's widgets and the app's in the shared grid
 * (`widget-grid.tsx`), set in the Widgets tab of the Admin ⋮; a widget's own
 * ⋮ swaps or removes it; an empty spot is pressed to add one there. Saved
 * for the site ("Take it widgets out of its overview container").
 *
 * Every figure counts the range picked in the Admin ⋮'s General tab.
 */
export function OverviewTab({
  figures,
  days,
  layout,
  onChange,
}: {
  figures: OverviewFigures
  days: AnalyticsRange
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
}) {
  return (
    <WidgetGrid
      board="admin"
      layout={layout}
      days={days}
      onChange={onChange}
      drawWidget={(id, menu) => {
        const shell = SHELL_WIDGET_BY_ID.get(id)
        return shell ? <ShellWidget id={shell.id} figures={figures} menu={menu} /> : null
      }}
    />
  )
}

const SHELL_WIDGET_BY_ID = new Map<string, (typeof SHELL_WIDGETS)[number]>(
  SHELL_WIDGETS.map((widget) => [widget.id, widget])
)

// One hue, two lightness steps. Which is which also rides on the legend and
// the tooltip, never on the colour alone.
const MEMBER_COLOUR = "var(--primary)"
const VISITOR_COLOUR = shade(45)

const viewsConfig: ChartConfig = {
  memberViews: { label: "Members", color: MEMBER_COLOUR },
  visitorViews: { label: "Visitors", color: VISITOR_COLOUR },
}

const spendConfig: ChartConfig = {
  spend: { label: "Spend", color: "var(--primary)" },
}

/** A chart fills its card in a wide middle, and keeps a chart's height when stacked. */
const CHART_FILL = "h-60 w-full min-w-0 @3xl:h-full @3xl:min-h-32"

/** A list widget's rows, scrolling inside the card. */
function ListBody({ rows, empty }: { rows: SideRow[]; empty: string }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <SideRows rows={rows} empty={empty} />
    </ScrollArea>
  )
}

function ShellWidget({ id, figures, menu }: { id: ShellWidgetId; figures: OverviewFigures; menu: WidgetMenuProps }) {
  const { traffic, ai, metered } = figures
  const widget = SHELL_WIDGET_BY_ID.get(id)!
  const Icon = widget.icon
  const card = (body: React.ReactNode, count?: number) => (
    <WidgetCard
      title={widget.label}
      icon={<Icon />}
      count={count}
      menu={<WidgetMenu title={widget.label} {...menu} />}
    >
      {body}
    </WidgetCard>
  )

  switch (id) {
    case "views":
      return card(
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
            <LegendDot colour={MEMBER_COLOUR} label="Members" />
            <LegendDot colour={VISITOR_COLOUR} label="Visitors" />
          </div>
          {traffic.totals.views > 0 ? (
            <DailyBarChart
              className={CHART_FILL}
              daily={traffic.daily}
              config={viewsConfig}
              bars={[
                { key: "visitorViews", value: (point) => point.visitorViews },
                { key: "memberViews", value: (point) => point.memberViews },
              ]}
              yAxisWidth={36}
            />
          ) : (
            <EmptyChart message="No visits have been counted yet. They start appearing as soon as somebody opens a page." />
          )}
        </div>
      )
    case "ai-spend":
      return card(
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {ai.totals.calls > 0 ? (
            <DailyBarChart
              className={CHART_FILL}
              daily={ai.daily}
              config={spendConfig}
              bars={[{ key: "spend", value: (point) => point.costCents / 100 }]}
              yAxisWidth={44}
              fewDaysLabelInterval={2}
              formatValue={(value) => formatMoney(value * 100)}
            />
          ) : (
            <EmptyChart message="Nothing has used AI yet." />
          )}
        </div>
      )
    case "by-person": {
      const rows = personRows(figures)
      return card(<PersonTable rows={rows} />, rows.length)
    }
    case "top-pages":
      return card(<ListBody rows={topPageRows(traffic)} empty={EMPTY_TEXT.pages} />)
    case "devices":
      return card(<ListBody rows={deviceRows(traffic)} empty={EMPTY_TEXT.devices} />)
    case "referrers":
      return card(<ListBody rows={referrerRows(traffic)} empty={EMPTY_TEXT.referrers} />)
    case "ai-features":
      return card(<ListBody rows={featureRows(ai)} empty={EMPTY_TEXT.features} />)
    case "ai-models":
      return card(<ListBody rows={modelRows(ai)} empty={EMPTY_TEXT.models} />)
    case "meters":
      return card(<ListBody rows={meterRows(metered)} empty={EMPTY_TEXT.meters} />)
  }
}

/** One person's AI spend and metered units over the range. */
type PersonRow = {
  key: string
  userId: string | null
  name: string
  email: string
  aiCostCents: number
  aiCalls: number
  /** Null: no ceiling. */
  allowanceCents: number | null
  monthSpentCents: number
  units: number
  lastUsedAt: number
}

/**
 * AI rows and metered rows joined by person. A deleted account's rows have no
 * person to join on, so each side keeps its own deleted row.
 */
function personRows({ ai, metered }: OverviewFigures): PersonRow[] {
  const rows = new Map<string, PersonRow>()
  for (const row of ai.byPerson) {
    const key = row.userId ?? "deleted-ai"
    rows.set(key, {
      key,
      userId: row.userId,
      name: row.name,
      email: row.email,
      aiCostCents: row.costCents,
      aiCalls: row.calls,
      allowanceCents: row.allowanceCents,
      monthSpentCents: row.monthSpentCents,
      units: 0,
      lastUsedAt: row.lastUsedAt.getTime(),
    })
  }
  for (const row of metered.byPerson) {
    const key = row.userId ?? "deleted-metered"
    const lastUsedAt = Date.parse(row.lastUsedAt)
    const known = rows.get(key)
    if (known) {
      known.units = row.quantity
      known.lastUsedAt = Math.max(known.lastUsedAt, lastUsedAt)
      continue
    }
    rows.set(key, {
      key,
      userId: row.userId,
      name: row.name,
      email: row.email ?? "",
      aiCostCents: 0,
      aiCalls: 0,
      allowanceCents: null,
      monthSpentCents: 0,
      units: row.quantity,
      lastUsedAt,
    })
  }
  return [...rows.values()]
}

type PersonSort = "person" | "spend" | "calls" | "allowance" | "units" | "last"

// Columns drop out as the card narrows, the least needed first. The card is
// the container they measure (`@container` on the table's box).
const personColumns: SortableColumn<PersonSort>[] = [
  { key: "person", label: "Person", column: "main" },
  { key: "spend", label: "AI spend", column: "meta" },
  { key: "calls", label: "AI calls", column: "meta", className: "hidden @2xl:table-cell" },
  // Always this calendar month, whatever the range: the ceiling is monthly.
  { key: "allowance", label: "Allowance, this month", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "units", label: "Metered units", column: "meta", className: "hidden @sm:table-cell" },
  { key: "last", label: "Last used", column: "meta", className: "hidden @3xl:table-cell" },
]

/** Only the name reads as words; every other column starts biggest first. */
const personSortDirection = (column: PersonSort) => (column === "person" ? "asc" : "desc")

function allowanceUsedShare(row: PersonRow) {
  if (row.allowanceCents === null) return -1
  if (row.allowanceCents === 0) return Number.MAX_SAFE_INTEGER
  return row.monthSpentCents / row.allowanceCents
}

const personSortKeys: Record<PersonSort, SortKey<PersonRow>> = {
  person: (row) => row.name,
  spend: (row) => row.aiCostCents,
  calls: (row) => row.aiCalls,
  // Closest to their ceiling first. No ceiling sorts as furthest from trouble.
  allowance: (row) => allowanceUsedShare(row),
  units: (row) => row.units,
  last: (row) => row.lastUsedAt,
}

/**
 * Used against allowed. Always this month's spend, whatever the range, so at
 * 30 or 90 days the AI spend and Allowance columns can honestly disagree.
 */
function formatAllowance(row: PersonRow) {
  if (row.allowanceCents === null) return "No limit"
  return `${formatMoney(row.monthSpentCents)} of ${formatMoney(row.allowanceCents)}`
}

/**
 * By person: every row, sorted by a column's heading, scrolling inside the
 * card. A name opens that person in Users.
 */
function PersonTable({ rows }: { rows: PersonRow[] }) {
  const { sort, direction, toggleSort } = useTableSort<PersonSort>("spend", "desc", personSortDirection)
  const sorted = React.useMemo(() => sortRows(rows, { sort, direction }, personSortKeys), [rows, sort, direction])
  if (sorted.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">Nobody has used AI or a metered feature in this range.</p>
  }
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <Table containerClassName="min-h-0 flex-1 overflow-auto">
        <SortableTableHeader columns={personColumns} sort={sort} direction={direction} onSort={toggleSort} />
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.key}>
              <TableCell column="main">
                <MemberName userId={row.userId} name={row.name} className="text-sm" />
                {row.email ? <span className="block truncate text-xs text-muted-foreground">{row.email}</span> : null}
              </TableCell>
              <TableCell column="meta">{formatMoney(row.aiCostCents)}</TableCell>
              <TableCell column="mutedMeta" className="hidden @2xl:table-cell">
                {row.aiCalls.toLocaleString()}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden @4xl:table-cell">
                {formatAllowance(row)}
              </TableCell>
              <TableCell column="meta" className="hidden tabular-nums @sm:table-cell">
                {row.units.toLocaleString()}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden @3xl:table-cell">
                {formatDate(new Date(row.lastUsedAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
