import * as React from "react"

import { MemberName, SideRows, type SideRow } from "@/components/admin-dashboard/admin-parts"
import { AdditionBoundary } from "@/components/admin-dashboard/addition-boundary"
import {
  deviceRows,
  EMPTY_TEXT,
  featureRows,
  meterRows,
  modelRows,
  referrerRows,
  topPageRows,
} from "@/components/admin-dashboard/figure-rows"
import { WidgetCard } from "@/components/admin-dashboard/widget-card"
import { EmptySpot, WidgetMenu, type Spot } from "@/components/admin-dashboard/widget-menus"
import { EmptyChart, LegendDot } from "@/components/shared/dashboard/chart-card"
import { DailyBarChart } from "@/components/shared/dashboard/daily-bar-chart"
import { SortableTableHeader, type SortableColumn } from "@/components/shared/sortable-table-header"
import type { ChartConfig } from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import type { AdminAdditionProps } from "@/lib/admin-dashboard/admin-additions"
import type { OverviewFigures } from "@/lib/admin-dashboard/overview-figures"
import {
  appWidgetId,
  SHELL_WIDGET_IDS,
  SHELL_WIDGETS,
  type ShellWidgetId,
  type WidgetLayout,
  type WidgetRowName,
} from "@/lib/admin-dashboard/overview-widgets"
import type { AnalyticsRange } from "@/lib/analytics/range"
import { appAdminWidgets } from "@/lib/app-options"
import { shade } from "@/lib/dashboard/chart-colours"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { sortRows, useTableSort, type SortKey } from "@/lib/hooks/use-table-sort"
import { cn } from "@/lib/utils"

/**
 * Admin, Overview: widgets in up to two rows (Tyler, 8 Nov 2026: "I want top
 * row to have 2 col and bottom row to have 3 col (2 row max)"), straight on
 * the dashboard beside the left panel, with no panel or header of their own
 * ("Take it widgets out of its overview container"). The rows and spots are
 * set in the Widgets tab of the Admin ⋮; a widget's own ⋮ swaps or removes
 * it; an empty spot is pressed to add one there. Saved for the site.
 *
 * - **Wide:** the rows share the height, so the whole of Overview fits with
 *   no page scroll, and a long list scrolls inside its own card ("Fill the
 *   panel").
 * - **Narrow, or a phone:** one widget under another at its own height, and
 *   Overview scrolls.
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
  const names: WidgetRowName[] = layout.bottom.columns > 0 ? ["top", "bottom"] : ["top"]
  const rows = names.map((name) => ({ name, ...layout[name] }))
  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto @3xl:overflow-hidden">
      <div
        className={cn(
          // The site gap between the cards, and none round them: the cards'
          // own edges line up with the left panel's.
          "grid grid-cols-[minmax(0,1fr)] gap-3.75 @3xl:h-full",
          rows.length === 2 ? "@3xl:grid-rows-2" : "@3xl:grid-rows-1"
        )}
      >
        {rows.map((row) => (
          <div
            key={row.name}
            className="grid grid-cols-[minmax(0,1fr)] gap-3.75 @3xl:min-h-0 @3xl:[grid-template-columns:repeat(var(--widget-columns),minmax(0,1fr))]"
            style={{ "--widget-columns": row.columns } as React.CSSProperties}
          >
            {row.spots.map((id, index) => {
              const spot = { row: row.name, index }
              return id ? (
                <Widget key={id} id={id} figures={figures} days={days} menu={{ layout, spot, onChange }} />
              ) : (
                <EmptySpot key={`empty-${index}`} layout={layout} spot={spot} onChange={onChange} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** What a widget's ⋮ needs: the layout, its spot, and the change. */
type WidgetMenuProps = { layout: WidgetLayout; spot: Spot; onChange: (layout: WidgetLayout) => void }

const SHELL_WIDGET_BY_ID = new Map<string, (typeof SHELL_WIDGETS)[number]>(
  SHELL_WIDGETS.map((widget) => [widget.id, widget])
)

/** One spot's widget: one of the shell's nine, or one the app added. */
function Widget({
  id,
  figures,
  days,
  menu,
}: {
  id: string
  figures: OverviewFigures
  days: AnalyticsRange
  menu: WidgetMenuProps
}) {
  const shell = SHELL_WIDGET_BY_ID.get(id)
  if (shell) return <ShellWidget id={shell.id} figures={figures} menu={menu} />
  return <AppWidget id={id} days={days} menu={menu} />
}

const appWidgetsMade = new Map<
  string,
  { label: string; icon: React.ReactNode; Lazy: React.LazyExoticComponent<React.ComponentType<AdminAdditionProps>> }
>()

/**
 * The app's widgets (`admin.widgets` in its `src/app/options.ts`), each
 * loaded the first time it shows. A widget the app took away is never in a
 * layout: `cleanWidgetLayout` empties its spot.
 */
function appWidget(id: string) {
  if (appWidgetsMade.size === 0) {
    for (const widget of appAdminWidgets(SHELL_WIDGET_IDS)) {
      const Icon = widget.icon
      appWidgetsMade.set(appWidgetId(widget.key), { label: widget.label, icon: <Icon />, Lazy: React.lazy(widget.load) })
    }
  }
  return appWidgetsMade.get(id)
}

function AppWidget({ id, days, menu }: { id: string; days: AnalyticsRange; menu: WidgetMenuProps }) {
  const made = appWidget(id)
  if (!made) return <EmptySpot {...menu} />
  const { Lazy } = made
  return (
    <WidgetCard title={made.label} icon={made.icon} menu={<WidgetMenu title={made.label} {...menu} />}>
      <AdditionBoundary kind="widget">
        <React.Suspense fallback={<p className="p-3 text-sm text-muted-foreground">Reading…</p>}>
          <ScrollArea className="min-h-0 flex-1">
            <Lazy days={days} />
          </ScrollArea>
        </React.Suspense>
      </AdditionBoundary>
    </WidgetCard>
  )
}

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
