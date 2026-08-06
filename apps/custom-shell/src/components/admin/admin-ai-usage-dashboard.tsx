import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CpuIcon,
  LineChartIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { chartHeightClassName, ChartCard, EmptyChart } from "@/components/shared/dashboard/chart-card"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
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
import type {
  AiUsageDashboard,
  AiUsagePersonRow,
  AiUsageRange,
} from "@/lib/api/ai"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { formatSharePercent, formatTokenCount } from "@/lib/format/format-number"
import { describeCode } from "@/lib/format/code-label"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useTableSort } from "@/lib/hooks/use-table-sort"

/**
 * Settings → the sidebar's AI usage page: what AI cost, who spent it, and
 * which features and models burned the money. Reads the meter written by
 * `runAiCall` — every figure here is a sum over `ai_usage_events`.
 */

const RANGE_LABELS: Record<AiUsageRange, string> = {
  month: "This month",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
}

const spendConfig: ChartConfig = {
  spend: { label: "Spend", color: "var(--primary)" },
}

export function AdminAiUsageDashboard({
  data,
  range,
  searchText,
  defaultPageSize,
}: {
  data: AiUsageDashboard
  range: AiUsageRange
  searchText: string
  defaultPageSize: number
}) {
  const navigate = useListSearchNavigate()
  const hasAnyUsage = data.totals.calls > 0

  const figures: StatFigure[] = [
    {
      key: "spend",
      label: "Spend",
      value: formatMoney(data.totals.costCents),
      footer: RANGE_LABELS[range].toLowerCase(),
    },
    {
      key: "calls",
      label: "AI calls",
      value: data.totals.calls.toLocaleString(),
      footer: RANGE_LABELS[range].toLowerCase(),
    },
    {
      key: "tokens",
      label: "Tokens",
      value: formatTokenCount(data.totals.tokens),
      footer: "in and out together",
    },
    {
      key: "failed",
      label: "Failed calls",
      value: data.totals.failed.toLocaleString(),
      footer: data.totals.failed ? "recorded, never dropped" : "none recorded",
    },
  ]

  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <StatStrip figures={figures} />

      <ChartCard
        icon={LineChartIcon}
        title="Daily spend"
        control={
          <Tabs
            value={range}
            onValueChange={(value) =>
              navigate({ range: value === "month" ? undefined : value })
            }
          >
            <TabsList className="h-8 p-[3px]">
              {(Object.keys(RANGE_LABELS) as AiUsageRange[]).map((key) => (
                <TabsTrigger key={key} value={key} className="h-full">
                  {RANGE_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        {hasAnyUsage ? (
          <SpendChart daily={data.daily} />
        ) : (
          <EmptyChart message="Nothing has used AI yet." />
        )}
      </ChartCard>

      <PersonTable
        rows={data.byPerson}
        totalCostCents={data.totals.costCents}
        searchText={searchText}
        onSearch={(text) => navigate({ q: text || undefined })}
        defaultPageSize={defaultPageSize}
      />

      <div
        className="grid min-w-0 items-start lg:grid-cols-2"
        style={{ gap: pageGutter }}
      >
        <BreakdownTable
          title="By feature"
          icon={<WorkflowIcon className="text-muted-foreground" />}
          nameLabel="Feature"
          rows={data.byFeature.map((row) => ({
            key: row.feature,
            name: describeCode(row.feature),
            calls: row.calls,
            tokens: row.tokens,
            costCents: row.costCents,
          }))}
        />
        <BreakdownTable
          title="By model"
          icon={<CpuIcon className="text-muted-foreground" />}
          nameLabel="Model"
          rows={data.byModel.map((row) => ({
            key: `${row.provider}:${row.model}`,
            name: row.model,
            note: row.provider,
            calls: row.calls,
            tokens: row.tokens,
            costCents: row.costCents,
          }))}
        />
      </div>
    </div>
  )
}

function SpendChart({ daily }: { daily: AiUsageDashboard["daily"] }) {
  const data = daily.map((point) => ({
    label: new Date(`${point.day}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }),
    spend: point.costCents / 100,
  }))

  return (
    <div className={chartHeightClassName}>
      <ChartContainer config={spendConfig} className="h-full w-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            dy={8}
            // A month of days is too many labels to read; a quarter even more so.
            interval={data.length > 45 ? 13 : data.length > 20 ? 5 : 2}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, dx: -5 }}
            width={44}
            allowDecimals={false}
            tickFormatter={(value: number) => formatMoney(value * 100)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatMoney(Number(value) * 100)}
              />
            }
          />
          <Bar
            dataKey="spend"
            fill="var(--color-spend)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

// --- By person -------------------------------------------------------------

type PersonSort =
  | "person"
  | "calls"
  | "tokens"
  | "spend"
  | "share"
  | "allowance"
  | "last"

const personColumns: SortableColumn<PersonSort>[] = [
  { key: "person", label: "Person", column: "main" },
  { key: "calls", label: "Calls", column: "meta" },
  { key: "tokens", label: "Tokens", column: "meta" },
  { key: "spend", label: "Spend", column: "meta" },
  { key: "share", label: "Share", column: "meta", className: "hidden lg:table-cell" },
  { key: "allowance", label: "Allowance", column: "meta", className: "hidden md:table-cell" },
  { key: "last", label: "Last used", column: "meta", className: "hidden sm:table-cell" },
]

/** Only the name reads as words; every other column starts biggest-first. */
const personSortDirection = (column: PersonSort) =>
  column === "person" ? "asc" : "desc"

function PersonTable({
  rows,
  totalCostCents,
  searchText,
  onSearch,
  defaultPageSize,
}: {
  rows: AiUsagePersonRow[]
  totalCostCents: number
  searchText: string
  onSearch: (text: string) => void
  defaultPageSize: number
}) {
  const navigate = useNavigate()
  // The box types instantly; the address (and the filter) settles just after,
  // exactly like the other dashboards' search fields.
  const [text, setText] = useSearchBoxText(searchText, onSearch)
  const { sort, direction, toggleSort } = useTableSort<PersonSort>(
    "spend",
    "desc",
    personSortDirection
  )

  const sorted = React.useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const matching = rows.filter(
      (row) =>
        !query || `${row.name} ${row.email}`.toLowerCase().includes(query)
    )
    const factor = direction === "asc" ? 1 : -1
    return matching.sort((a, b) => factor * comparePeople(a, b, sort))
  }, [rows, searchText, sort, direction])

  const { visible, footer } = useClientPage(
    sorted,
    defaultPageSize,
    `${text}|${sort}|${direction}`
  )

  return (
    <DashboardTable
      title="By person"
      icon={<UsersIcon className="text-muted-foreground" />}
      count={sorted.length}
      controls={
        <DashboardToolbarSearch
          name="ai-usage-search"
          aria-label="Search people"
          placeholder="Search name or email…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      }
      header={
        <SortableTableHeader
          columns={personColumns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          withAriaSort
        />
      }
      isEmpty={visible.length === 0}
      emptyText={
        searchText.trim()
          ? "Nobody matches that search."
          : "Nothing has used AI yet."
      }
      emptyColSpan={7}
      footer={footer}
    >
      {visible.map((row) => {
        // Pulled out so the row's click and its link share one narrowed value.
        const userId = row.userId

        return (
          <TableRow
            key={userId ?? "deleted"}
            className="group"
            // A deleted account has nowhere to go, so that row stays flat.
            rowAction={
              userId
                ? () =>
                    void navigate({ to: "/admin/users", search: { q: row.email } })
                : undefined
            }
          >
            <TableCell column="main">
              {userId ? (
                // Accounts are windows on the Users table now, not pages of
                // their own, so this hands that table their email — which is
                // what its search already matches on — and one more click
                // opens them.
                <Link
                  to="/admin/users"
                  search={{ q: row.email }}
                  className="block max-w-full truncate text-sm font-medium group-hover:underline"
                  title={row.email}
                >
                  {row.name}
                </Link>
              ) : (
                // Nobody to open: the account is gone, only its spend is left.
                <span className="text-sm font-medium text-muted-foreground">
                  {row.name}
                </span>
              )}
            </TableCell>
            <TableCell column="mutedMeta">
              {row.calls.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta">{formatTokenCount(row.tokens)}</TableCell>
            <TableCell column="meta">{formatMoney(row.costCents)}</TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {formatSharePercent(row.costCents, totalCostCents)}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {formatAllowance(row)}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden sm:table-cell">
              {formatDate(row.lastUsedAt)}
            </TableCell>
          </TableRow>
        )
      })}
    </DashboardTable>
  )
}

/**
 * Used against allowed. Always this month's spend — the ceiling is monthly,
 * whatever range the rest of the table is showing — so at 30 or 90 days the
 * Spend and Allowance columns can honestly disagree.
 */
function formatAllowance(row: AiUsagePersonRow) {
  if (row.allowanceCents === null) return "No limit"
  return `${formatMoney(row.monthSpentCents)} of ${formatMoney(row.allowanceCents)}`
}

function comparePeople(a: AiUsagePersonRow, b: AiUsagePersonRow, sort: PersonSort) {
  if (sort === "calls") return a.calls - b.calls
  if (sort === "tokens") return a.tokens - b.tokens
  // Share orders the same way spend does; both compare cents.
  if (sort === "spend" || sort === "share") return a.costCents - b.costCents
  // Closest to their ceiling first (descending). No ceiling sorts as furthest
  // from trouble, which is what "sort by allowance" is really asking about.
  if (sort === "allowance") return allowanceUsedShare(a) - allowanceUsedShare(b)
  if (sort === "last") return a.lastUsedAt.getTime() - b.lastUsedAt.getTime()
  return a.name.localeCompare(b.name)
}

function allowanceUsedShare(row: AiUsagePersonRow) {
  if (row.allowanceCents === null) return -1
  if (row.allowanceCents === 0) return Number.MAX_SAFE_INTEGER
  return row.monthSpentCents / row.allowanceCents
}

// --- By feature / by model ---------------------------------------------------

type BreakdownRow = {
  key: string
  name: string
  /** A quiet second line — the model's provider. */
  note?: string
  calls: number
  tokens: number
  costCents: number
}

type BreakdownSort = "name" | "calls" | "tokens" | "spend"

/** Only the name reads as words; every other column starts biggest-first. */
const breakdownSortDirection = (column: BreakdownSort) =>
  column === "name" ? "asc" : "desc"

function BreakdownTable({
  title,
  icon,
  nameLabel,
  rows,
}: {
  title: string
  icon: React.ReactNode
  nameLabel: string
  rows: BreakdownRow[]
}) {
  const { sort, direction, toggleSort } = useTableSort<BreakdownSort>(
    "spend",
    "desc",
    breakdownSortDirection
  )

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sort === "calls") return factor * (a.calls - b.calls)
      if (sort === "tokens") return factor * (a.tokens - b.tokens)
      if (sort === "spend") return factor * (a.costCents - b.costCents)
      return factor * a.name.localeCompare(b.name)
    })
  }, [rows, sort, direction])

  const columns: SortableColumn<BreakdownSort>[] = [
    { key: "name", label: nameLabel, column: "main" },
    { key: "calls", label: "Calls", column: "meta" },
    { key: "tokens", label: "Tokens", column: "meta" },
    { key: "spend", label: "Spend", column: "meta" },
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
      emptyText="Nothing has used AI yet."
      emptyColSpan={4}
      footer={{ type: "summary", count: sorted.length }}
    >
      {sorted.map((row) => (
        <TableRow key={row.key}>
          <TableCell column="main">
            <span className="block max-w-full truncate text-sm font-medium">
              {row.name}
            </span>
            {row.note ? (
              <span className="block text-xs text-muted-foreground">
                {row.note}
              </span>
            ) : null}
          </TableCell>
          <TableCell column="mutedMeta">{row.calls.toLocaleString()}</TableCell>
          <TableCell column="mutedMeta">{formatTokenCount(row.tokens)}</TableCell>
          <TableCell column="meta">{formatMoney(row.costCents)}</TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

// --- Formatting ---------------------------------------------------------------
