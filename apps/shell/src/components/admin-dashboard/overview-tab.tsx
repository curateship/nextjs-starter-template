import * as React from "react"
import { UsersIcon } from "lucide-react"

import { MemberName, MiddleBody, SideRows, type SideRow } from "@/components/admin-dashboard/admin-parts"
import {
  deviceRows,
  EMPTY_TEXT,
  featureRows,
  meterRows,
  modelRows,
  referrerRows,
  topPageRows,
} from "@/components/admin-dashboard/figure-rows"
import type { OverviewFigures } from "@/lib/admin-dashboard/overview-figures"
import { EmptyChart, LegendDot } from "@/components/shared/dashboard/chart-card"
import { DailyBarChart } from "@/components/shared/dashboard/daily-bar-chart"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { SortableTableHeader, type SortableColumn } from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import type { ChartConfig } from "@/components/ui/chart"
import { TableCell, TableRow } from "@/components/ui/table"
import { rangeNote, type AnalyticsRange } from "@/lib/analytics/range"
import { shade } from "@/lib/dashboard/chart-colours"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { sortRows, useTableSort, type SortKey } from "@/lib/hooks/use-table-sort"
import { useRememberedChoice } from "@/lib/remembered-choice"

/**
 * Admin, Overview tab (Tyler, 8 Nov 2026: "Rename analytic to overview", then
 * "remove the usage tab ... This can just go under overview"). Top to bottom,
 * edge to edge:
 *
 * - **Views per day**, with a More details tab holding Top pages, Devices
 *   and Top referrers ("these should be a part of the views per day panel.
 *   Maybe put it in a "More details" tab?").
 * - **Daily AI spend**, with a More details tab holding By feature, By model
 *   and By meter.
 * - **By person:** AI spend and metered units side by side, one row each. A
 *   name opens that person in the Users tab.
 *
 * Every figure counts the range picked in the header.
 */
export function OverviewTab({ figures, days }: { figures: OverviewFigures; days: AnalyticsRange }) {
  const { traffic, ai, metered } = figures
  const note = rangeNote(days)
  return (
    <MiddleBody>
      <DetailsSection
        kind="views"
        title="Views per day"
        meta={traffic.siteName ? `${note} on ${traffic.siteName}` : note}
        legend={
          <>
            <LegendDot colour={MEMBER_COLOUR} label="Members" />
            <LegendDot colour={VISITOR_COLOUR} label="Visitors" />
          </>
        }
        chart={
          traffic.totals.views > 0 ? (
            <DailyBarChart
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
          )
        }
        lists={[
          { title: "Top pages", rows: topPageRows(traffic), empty: EMPTY_TEXT.pages },
          { title: "Devices", rows: deviceRows(traffic), empty: EMPTY_TEXT.devices },
          { title: "Top referrers", rows: referrerRows(traffic), empty: EMPTY_TEXT.referrers },
        ]}
      />
      <DetailsSection
        kind="ai-spend"
        title="Daily AI spend"
        meta={note}
        chart={
          ai.totals.calls > 0 ? (
            <DailyBarChart
              daily={ai.daily}
              config={spendConfig}
              bars={[{ key: "spend", value: (point) => point.costCents / 100 }]}
              yAxisWidth={44}
              fewDaysLabelInterval={2}
              formatValue={(value) => formatMoney(value * 100)}
            />
          ) : (
            <EmptyChart message="Nothing has used AI yet." />
          )
        }
        lists={[
          { title: "By feature", rows: featureRows(ai), empty: EMPTY_TEXT.features },
          { title: "By model", rows: modelRows(ai), empty: EMPTY_TEXT.models },
          { title: "By meter", rows: meterRows(metered), empty: EMPTY_TEXT.meters },
        ]}
      />
      <PersonTable figures={figures} note={note} />
    </MiddleBody>
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

const DETAILS_CHOICES = ["chart", "details"] as const

/**
 * A chart and its More details tab, edge to edge. More details holds the
 * chart's smaller lists, side by side when the middle is wide and stacked
 * when it is narrow. The tab picked is remembered in this browser.
 */
function DetailsSection({
  kind,
  title,
  meta,
  legend,
  chart,
  lists,
}: {
  /** Plain characters; names the remembered tab. */
  kind: string
  title: string
  meta: string
  legend?: React.ReactNode
  chart: React.ReactNode
  lists: { title: string; rows: SideRow[]; empty: string }[]
}) {
  const [shown, setShown] = useRememberedChoice(`custom-shell-admin-${kind}-tab`, "chart", DETAILS_CHOICES)
  return (
    <section aria-label={title} className="@container grid min-w-0">
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <DashboardTabs
          value={shown}
          onValueChange={(value) => setShown(value as (typeof DETAILS_CHOICES)[number])}
          tabs={[
            { value: "chart", label: title },
            { value: "details", label: "More details" },
          ]}
        />
        <span className="ml-auto flex min-w-0 items-center gap-4 text-xs text-muted-foreground">
          {shown === "chart" && legend ? <span className="hidden items-center gap-4 sm:flex">{legend}</span> : null}
          <span className="truncate">{meta}</span>
        </span>
      </div>
      {shown === "chart" ? (
        <div className="px-4 pb-4">{chart}</div>
      ) : (
        <div className="grid grid-cols-1 divide-y border-t @2xl:grid-cols-3 @2xl:divide-x @2xl:divide-y-0">
          {lists.map((list) => (
            <div key={list.title} className="grid min-w-0 content-start">
              <h3 className="px-3 pt-3 pb-1 text-sm font-semibold">{list.title}</h3>
              <SideRows rows={list.rows} empty={list.empty} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
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

const personColumns: SortableColumn<PersonSort>[] = [
  { key: "person", label: "Person", column: "main" },
  { key: "spend", label: "AI spend", column: "meta" },
  // Columns drop out as the middle narrows, the least needed first.
  { key: "calls", label: "AI calls", column: "meta", className: "hidden @2xl:table-cell" },
  // Always this calendar month, whatever the range: the ceiling is monthly.
  { key: "allowance", label: "Allowance, this month", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "units", label: "Metered units", column: "meta" },
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

/** The middle's tables sit straight on the panel: no frame, no corners. */
const EDGE_TABLE = "rounded-none bg-transparent ring-0"

function PersonTable({ figures, note }: { figures: OverviewFigures; note: string }) {
  const runtime = useShellRuntime()
  const { sort, direction, toggleSort } = useTableSort<PersonSort>("spend", "desc", personSortDirection)
  const rows = React.useMemo(() => personRows(figures), [figures])
  const sorted = React.useMemo(() => sortRows(rows, { sort, direction }, personSortKeys), [rows, sort, direction])
  const { visible, footer } = useClientPage(sorted, runtime.config.dashboardRowsPerPage, `${sort}|${direction}`)

  return (
    <DashboardTable
      className={EDGE_TABLE}
      title={`By person (${note})`}
      icon={<UsersIcon className="text-muted-foreground" />}
      count={sorted.length}
      header={<SortableTableHeader columns={personColumns} sort={sort} direction={direction} onSort={toggleSort} />}
      isEmpty={visible.length === 0}
      emptyText="Nobody has used AI or a metered feature in this range."
      emptyColSpan={personColumns.length}
      footer={footer}
    >
      {visible.map((row) => (
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
          <TableCell column="meta" className="tabular-nums">
            {row.units.toLocaleString()}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden @3xl:table-cell">
            {formatDate(new Date(row.lastUsedAt))}
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
