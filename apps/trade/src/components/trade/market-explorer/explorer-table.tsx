import * as React from "react"

import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { CautionBadge } from "@/components/trade/caution-badge"
import { TradeBadge } from "@/components/trade/trade-badge"
import { TableStateRow } from "@/components/trade/trade-table"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { marketChartHref } from "@/lib/protocols/contracts"
import {
  formatChange,
  formatCompactUsd,
  formatFunding,
  formatPrice,
  formatSignedUsd,
} from "@/lib/trade/format"
import {
  clearExplorerFilters,
  EXPLORER_LABELS,
  type ExplorerView,
  type ExplorerColumn,
} from "@/lib/trade/market-explorer"
import { moneyTone } from "@/lib/trade/money-tone"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { ExplorerStar } from "./explorer-star"
import type { useExplorerFolders } from "./use-explorer-folders"
import {
  explorerValue,
  sortExplorerRows,
  type ExplorerRow,
} from "./explorer-rows"

const ROW_HEIGHT = 52
const rowIdentity = (row: ExplorerRow) => row.displayKey ?? row.key
const ESTIMATE =
  "Estimated from the change in 24-hour volume. Trades from yesterday fall off the same total, so a quiet window may read as zero."

function ExplorerSortButton({
  column,
  view,
  changeView,
  children,
  ...buttonProps
}: React.ComponentProps<"button"> & {
  column: ExplorerView["sort"]
  view: ExplorerView
  changeView: (view: ExplorerView) => void
  children: React.ReactNode
}) {
  const { sort, direction, toggleSort } = useTableSort<ExplorerView["sort"]>(
    view.sort,
    view.direction,
    (next) => (next === "market" ? "asc" : "desc")
  )
  React.useEffect(() => {
    if (sort === view.sort && direction === view.direction) return
    changeView({
      ...view,
      sort,
      direction,
      liveSort:
        sort === view.sort
          ? view.liveSort
          : sort.startsWith("move") || sort.startsWith("traded"),
    })
  }, [sort, direction, view, changeView])
  return (
    <TableSortButton
      {...buttonProps}
      active={view.sort === column}
      direction={view.direction}
      onClick={() => toggleSort(column)}
    >
      {children}
    </TableSortButton>
  )
}
function Figure({ row, column }: { row: ExplorerRow; column: ExplorerColumn }) {
  const value = explorerValue(row, column)
  if (value === null)
    return (
      <span
        className="text-muted-foreground/50"
        title={
          column.startsWith("move") || column.startsWith("traded")
            ? "Waiting for a complete uninterrupted window. Venues without an all-market live feed cannot report this figure."
            : "The exchange does not report this figure."
        }
      >
        —
      </span>
    )
  const number = Number(value)
  if (column.startsWith("move")) {
    const seconds = column.endsWith("5s") ? 5 : column.endsWith("1m") ? 60 : 300
    return (
      <span className={moneyTone(number)}>
        {formatSignedUsd(row.windows[seconds]!.move)} · {formatChange(number)}
      </span>
    )
  }
  if (column === "price") return formatPrice(number)
  if (column === "change24h")
    return <span className={moneyTone(number)}>{formatChange(number)}</span>
  if (column === "fundingHourly")
    return <span className={moneyTone(-number)}>{formatFunding(number)}</span>
  if (column === "maxLeverage") return `${number}×`
  return formatCompactUsd(number)
}

export function ExplorerTable({
  rows,
  view,
  changeView,
  pending,
  failed,
  retry,
  folders,
  catalogVersion = "initial",
}: {
  rows: ExplorerRow[]
  catalogVersion?: string
  view: ExplorerView
  changeView: (view: ExplorerView) => void
  pending: boolean
  failed: boolean
  retry: () => void
  folders: ReturnType<typeof useExplorerFolders>
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = React.useState({ top: 0, height: 600 })
  const [expanded, setExpanded] = React.useState(new Set<string>())
  const [order, setOrder] = React.useState<{
    view: string
    keys: string[]
    newKeys: Set<string>
  }>({ view: "", keys: [], newKeys: new Set() })
  const [hovered, setHovered] = React.useState(false)
  const viewKey = JSON.stringify({ view, catalogVersion })
  const paginationKey = JSON.stringify(view)
  const [pagination, setPagination] = React.useState({
    viewKey: paginationKey,
    page: 1,
    pageSize: 50,
  })
  const pageSize = pagination.pageSize
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page =
    pagination.viewKey === paginationKey
      ? Math.min(pagination.page, totalPages)
      : 1
  if (pagination.viewKey !== paginationKey || pagination.page !== page) {
    setPagination({ viewKey: paginationKey, page, pageSize })
  }
  React.useEffect(() => {
    const viewport = host.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    if (viewport) viewport.scrollTop = 0
  }, [page, pageSize, paginationKey])
  const latest = React.useRef({
    rows,
    view,
    viewKey,
    paused: hovered,
  })
  const existing = new Set(order.keys)
  const missing = rows.filter((row) => !existing.has(rowIdentity(row)))
  if (order.view !== viewKey || missing.length) {
    const keys =
      order.view !== viewKey || order.keys.length === 0
        ? sortExplorerRows(rows, view).map(rowIdentity)
        : [...order.keys, ...missing.map(rowIdentity)]
    setOrder({ view: viewKey, keys, newKeys: new Set() })
  }
  React.useEffect(() => {
    latest.current = { rows, view, viewKey, paused: hovered }
  })
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.hidden ||
        !latest.current.view.liveSort ||
        latest.current.paused ||
        host.current?.contains(document.activeElement)
      )
        return
      setOrder((previous) => {
        const keys = sortExplorerRows(
          latest.current.rows,
          latest.current.view
        ).map(rowIdentity)
        const previousTop = new Set(previous.keys.slice(0, 10))
        return {
          view: latest.current.viewKey,
          keys,
          newKeys: new Set(
            keys.slice(0, 10).filter((key) => !previousTop.has(key))
          ),
        }
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [])
  React.useEffect(() => {
    if (!order.newKeys.size) return
    const timer = setTimeout(
      () => setOrder((current) => ({ ...current, newKeys: new Set() })),
      1500
    )
    return () => clearTimeout(timer)
  }, [order.newKeys])
  React.useEffect(() => {
    const viewport = host.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    if (!viewport) return
    const update = () =>
      setScroll({ top: viewport.scrollTop, height: viewport.clientHeight })
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    viewport.addEventListener("scroll", update)
    update()
    return () => {
      observer.disconnect()
      viewport.removeEventListener("scroll", update)
    }
  }, [])
  const byKey = new Map(rows.map((row) => [rowIdentity(row), row]))
  const ordered = order.keys
    .filter((key) => byKey.has(key))
    .slice((page - 1) * pageSize, page * pageSize)
    .flatMap((key) => {
      const row = byKey.get(key)
      return row
        ? [
            { row, child: false },
            ...(expanded.has(key)
              ? row.children.map((child) => ({ row: child, child: true }))
              : []),
          ]
        : []
    })
  const start = Math.min(
    Math.max(0, Math.floor((scroll.top - 40) / ROW_HEIGHT) - 8),
    Math.max(0, ordered.length - 1)
  )
  const end = Math.min(
    ordered.length,
    start + Math.ceil(scroll.height / ROW_HEIGHT) + 17
  )
  const columns = view.columns
  const lowPriority = (column: ExplorerColumn) =>
    [
      "fundingHourly",
      "maxLeverage",
      "openInterestUsd",
      "move1m",
      "traded1m",
      "move5m",
      "traded5m",
    ].includes(column)
      ? "hidden lg:table-cell"
      : ""
  return (
    <div
      ref={host}
      className="flex min-h-0 flex-1 flex-col border-t"
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[data-market-index]"
        )
        if (!link) return
        const index =
          Number(link.dataset.marketIndex) +
          (event.key === "ArrowDown" ? 1 : -1)
        if (index < 0 || index >= ordered.length) return
        event.preventDefault()
        const viewport = host.current?.querySelector<HTMLElement>(
          '[data-slot="scroll-area-viewport"]'
        )
        if (!viewport) return
        viewport.scrollTop = Math.max(
          0,
          index * ROW_HEIGHT - viewport.clientHeight / 2
        )
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            host.current
              ?.querySelector<HTMLAnchorElement>(
                `a[data-market-index="${index}"]`
              )
              ?.focus({ preventScroll: true })
          })
        )
      }}
      onPointerEnter={() => {
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
      }}
    >
      <div className="relative min-h-0 flex-1">
        <ScrollArea
          type="always"
          style={{ position: "absolute", inset: 0 }}
          viewportClassName="h-full"
        >
          <Table
            containerClassName="overflow-visible pb-2.5"
            className="table-fixed [&_tbody_tr:first-child_td]:pt-2 [&_tbody_tr:last-child_td]:pb-2 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5"
            aria-label="Markets"
            aria-rowcount={ordered.length + 1}
          >
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-10 w-28 bg-muted px-5 text-muted-foreground lg:w-40">
                  Exchange
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-56 bg-muted px-5 text-muted-foreground lg:w-80">
                  <ExplorerSortButton
                    key={`${view.sort}:${view.direction}`}
                    column="market"
                    view={view}
                    changeView={changeView}
                  >
                    Market
                  </ExplorerSortButton>
                </TableHead>
                {columns.map((column) => (
                  <TableHead
                    key={column}
                    className={`sticky top-0 z-10 ${column === "maxLeverage" ? "w-28" : "w-36"} bg-muted px-5 text-right text-muted-foreground ${lowPriority(column)}`}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ExplorerSortButton
                          key={`${view.sort}:${view.direction}`}
                          column={column}
                          className={`ml-auto ${view.sort === column ? "text-foreground" : ""}`}
                          view={view}
                          changeView={changeView}
                        >
                          {EXPLORER_LABELS[column]}
                        </ExplorerSortButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        {column.startsWith("traded")
                          ? ESTIMATE
                          : `Sort by ${EXPLORER_LABELS[column]}`}
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                ))}
                <TableHead className="sticky top-0 z-10 w-16 bg-muted px-5">
                  <span className="sr-only">Folders</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!ordered.length ? (
                <TableStateRow
                  span={columns.length + 3}
                  loading={pending}
                  failed={failed}
                  loadingLabel="Loading markets…"
                  onRetry={retry}
                  empty={
                    <>
                      <span>0 markets match</span>{" "}
                      <Button
                        variant="ghost"
                        onClick={() => changeView(clearExplorerFilters(view))}
                      >
                        Clear filters
                      </Button>
                    </>
                  }
                >
                  The exchanges did not answer.
                </TableStateRow>
              ) : (
                <>
                  {start > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={columns.length + 3}
                        style={{ height: start * ROW_HEIGHT, padding: 0 }}
                      />
                    </tr>
                  )}
                  {ordered.slice(start, end).map(({ row, child }, offset) => {
                    const href = marketChartHref(row.key)
                    const fresh = order.newKeys.has(rowIdentity(row)) && !child
                    return (
                      <TableRow
                        key={`${rowIdentity(row)}:${child}`}
                        aria-rowindex={start + offset + 2}
                        style={{ height: ROW_HEIGHT }}
                        className={`border-b ${fresh ? "motion-safe:animate-pulse motion-safe:bg-accent" : ""}`}
                        rowAction={
                          href
                            ? () => {
                                window.location.href = href
                              }
                            : undefined
                        }
                      >
                        <TableCell className="truncate px-5 py-2 text-muted-foreground">
                          {row.venue.protocolLabel}
                        </TableCell>
                        <TableCell className="px-5 py-2">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {row.children.length > 0 && !child && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`${expanded.has(rowIdentity(row)) ? "Collapse" : "Expand"} ${row.symbol}`}
                                onClick={() =>
                                  setExpanded((current) => {
                                    const next = new Set(current)
                                    if (next.has(rowIdentity(row)))
                                      next.delete(rowIdentity(row))
                                    else next.add(rowIdentity(row))
                                    return next
                                  })
                                }
                              >
                                {expanded.has(rowIdentity(row)) ? "−" : "+"}
                              </Button>
                            )}
                            <div
                              className={`flex min-w-0 items-center gap-2 ${child ? "pl-4" : ""}`}
                            >
                              {href ? (
                                <a
                                  data-market-index={start + offset}
                                  title={`${row.subExchange ?? ""} ${row.symbol}`.trim()}
                                  className="block truncate font-semibold hover:underline"
                                  href={href}
                                >
                                  {row.subExchange && !row.symbol.includes(":")
                                    ? `${row.subExchange}:`
                                    : ""}
                                  {row.symbol}
                                </a>
                              ) : (
                                <span
                                  className="block truncate font-semibold"
                                  title="This venue has no chart page yet."
                                >
                                  {row.symbol}
                                </span>
                              )}
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>{row.category}</span>
                                {!row.venue.orders && (
                                  <TradeBadge>Test only</TradeBadge>
                                )}
                                {row.caution && (
                                  <CautionBadge caution={row.caution} />
                                )}
                                {fresh && <TradeBadge>new</TradeBadge>}
                                {row.children.length > 0 && !child && (
                                  <span title="Prices are compared per coin, after contract multipliers.">
                                    {row.children.length} exchanges · gap{" "}
                                    {row.gap === null
                                      ? "—"
                                      : formatPrice(row.gap)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        {columns.map((column) => (
                          <TableCell
                            key={column}
                            className={`px-5 py-2 text-right font-mono whitespace-nowrap tabular-nums ${lowPriority(column)}`}
                          >
                            <Figure row={row} column={column} />
                          </TableCell>
                        ))}
                        <TableCell column="actions" className="px-5 py-2">
                          <ExplorerStar
                            row={row}
                            protocol={row.venue.protocol}
                            state={folders}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {end < ordered.length && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={columns.length + 3}
                        style={{
                          height: (ordered.length - end) * ROW_HEIGHT,
                          padding: 0,
                        }}
                      />
                    </tr>
                  )}
                </>
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      <div className="shrink-0">
        <DashboardTablePagination
          page={page}
          pageSize={pageSize}
          total={rows.length}
          totalPages={totalPages}
          countsPending={pending && !rows.length}
          pageSizeOptions={[25, 50, 100]}
          onPageChange={(next) =>
            setPagination({ viewKey: paginationKey, page: next, pageSize })
          }
          onPageSizeChange={(next) =>
            setPagination({ viewKey: paginationKey, page: 1, pageSize: next })
          }
        />
      </div>
    </div>
  )
}
