import * as React from "react"
import { format, parseISO } from "date-fns"
import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react"

import { DecimalField } from "@/components/free-tools/decimal-field"
import { FreeToolSignUpCard } from "@/components/free-tools/sign-up-card"
import { SortableTableHeader } from "@/components/shared/sortable-table-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NumberField } from "@/components/ui/number-field"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableSurface,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  LEFT_OUT,
  STALE_AFTER_DAYS,
  compareFees,
  formatRate,
  isStale,
  type FeeResult,
} from "@/lib/free-tools/fee-comparison"
import { formatToolMoney } from "@/lib/free-tools/money"
import { useTableSort } from "@/lib/hooks/use-table-sort"

const MAX_TRADE_SIZE = 1_000_000_000
const MAX_TRADES_PER_MONTH = 100_000

type SortColumn = "name" | "perMonth" | "perTrade" | "maker" | "taker"

const SORT_VALUE: Record<SortColumn, (row: FeeResult) => number | string> = {
  name: (row) => row.name,
  perMonth: (row) => row.perMonth,
  perTrade: (row) => row.perTrade,
  maker: (row) => row.makerPercent,
  taker: (row) => row.takerPercent,
}

/**
 * `/tools/fee-comparison`: what the same trading costs in fees on each
 * exchange Trade connects to. Worked out in the browser as the visitor types.
 *
 * `today` comes from the server's loader, so the server and the browser agree
 * on which rows are too old when the page wakes up.
 */
export function FeeComparison({
  signedIn,
  today,
}: {
  signedIn: boolean
  today: string
}) {
  const [tradeSize, setTradeSize] = React.useState(10_000)
  const [tradesPerMonth, setTradesPerMonth] = React.useState(40)
  const [makerPer100, setMakerPer100] = React.useState(0)

  const rows = React.useMemo(
    () => compareFees({ tradeSize, tradesPerMonth, makerPer100 }),
    [tradeSize, tradesPerMonth, makerPer100]
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-2 text-left md:gap-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Fee comparison</h1>
        <p className="text-sm text-muted-foreground">
          What the same trading costs in fees on each exchange, cheapest first.
        </p>
      </header>

      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Your trading</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DecimalField
              id="fees-size"
              label="Size of each trade"
              hint="The whole trade's value, with leverage. $1,000 of margin at 10x is a $10,000 trade."
              unit="$"
              value={tradeSize}
              min={1}
              max={MAX_TRADE_SIZE}
              onChange={setTradeSize}
            />
            <NumberField
              id="fees-count"
              label="Trades a month"
              hint="Opening a trade and closing it are two trades."
              value={tradesPerMonth}
              min={1}
              max={MAX_TRADES_PER_MONTH}
              onChange={setTradesPerMonth}
            />
            <NumberField
              id="fees-maker"
              label="Out of 100 trades, how many wait on the book"
              hint="A limit order that waits for someone to fill it pays the lower maker fee. A market order, or a limit order that fills at once, pays the taker fee."
              value={makerPer100}
              min={0}
              max={100}
              onChange={setMakerPer100}
            />
          </CardContent>
        </Card>

        <AnswerCard
          rows={rows}
          tradeSize={tradeSize}
          tradesPerMonth={tradesPerMonth}
          makerPer100={makerPer100}
        />
      </div>

      <FeeTable rows={rows} today={today} />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Not in the table</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm">
            {LEFT_OUT.map((place) => (
              <li key={place.name}>
                <span className="font-medium">{place.name}.</span>{" "}
                <span className="text-muted-foreground">{place.reason}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {signedIn ? null : <FreeToolSignUpCard />}
    </div>
  )
}

function AnswerCard({
  rows,
  tradeSize,
  tradesPerMonth,
  makerPer100,
}: {
  rows: FeeResult[]
  tradeSize: number
  tradesPerMonth: number
  makerPer100: number
}) {
  const cheapest = rows[0]
  const dearest = rows[rows.length - 1]
  const gap = sameCost(cheapest.perMonth, dearest.perMonth)
    ? 0
    : dearest.perMonth - cheapest.perMonth
  const cheapestNames = namesCosting(rows, cheapest.perMonth)
  const dearestNames = namesCosting(rows, dearest.perMonth)
  const waiting =
    makerPer100 === 0
      ? "every one filled at once"
      : makerPer100 === 100
        ? "every one waiting on the book"
        : `${makerPer100} out of 100 waiting on the book`

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>The answer</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p role="status" className="text-sm">
          {`${formatToolMoney(tradeSize)} a trade, ${tradesPerMonth.toLocaleString("en-US")} ${tradesPerMonth === 1 ? "trade" : "trades"} a month, ${waiting}. `}
          {gap > 0
            ? `${cheapestNames.text} ${cheapestNames.count > 1 ? "cost" : "costs"} least at ${formatToolMoney(cheapest.perMonth)} a month. ${dearestNames.text} ${dearestNames.count > 1 ? "cost" : "costs"} most at ${formatToolMoney(dearest.perMonth)}, which is ${formatToolMoney(gap)} more.`
            : `Every exchange costs ${formatToolMoney(cheapest.perMonth)} a month.`}
        </p>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Figure
            label={`Cheapest, ${cheapestNames.text}`}
            value={formatToolMoney(cheapest.perMonth)}
          />
          <Figure
            label={`Most expensive, ${dearestNames.text}`}
            value={formatToolMoney(dearest.perMonth)}
          />
          <Figure
            label="Difference over a year"
            value={formatToolMoney(gap * 12)}
          />
        </dl>
        <p className="text-sm text-muted-foreground">
          These are the rates a new account pays. Discounts for big traders,
          staked tokens and referral codes are left out, and so is funding, the
          charge for holding a trade open.
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * Two monthly costs that differ only by floating-point rounding. The allowance
 * grows with the amount, because a $60,000,000,000 month rounds far more than
 * a cent does.
 */
function sameCost(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

/**
 * Every exchange that costs the same as `perMonth`, so a tie names both:
 * "KuCoin and Phemex".
 */
function namesCosting(rows: FeeResult[], perMonth: number) {
  const names = rows
    .filter((row) => sameCost(row.perMonth, perMonth))
    .map((row) => row.name)
  const text =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return { text, count: names.length }
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function FeeTable({ rows, today }: { rows: FeeResult[]; today: string }) {
  const { sort, direction, toggleSort } = useTableSort<SortColumn>(
    "perMonth",
    "asc"
  )
  const sorted = React.useMemo(
    () => sortRows(rows, sort, direction),
    [rows, sort, direction]
  )

  return (
    <TableSurface>
      <ScrollArea>
        <Table containerClassName="overflow-visible">
          <SortableTableHeader<SortColumn>
            columns={[
              { key: "name", label: "Exchange", column: "meta" },
              { key: "perMonth", label: "A month", column: "meta" },
              { key: "perTrade", label: "A trade", column: "meta" },
              { key: "maker", label: "Maker fee", column: "meta" },
              { key: "taker", label: "Taker fee", column: "meta" },
              {
                key: "checked",
                label: "Checked",
                sortable: false,
                column: "meta",
              },
              {
                key: "source",
                label: "Source",
                sortable: false,
                column: "meta",
              },
            ]}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
          />
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.id}>
                <TableCell column="meta">
                  <div className="font-medium">{row.name}</div>
                  {row.note ? (
                    <div className="text-xs text-muted-foreground">
                      {row.note}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell column="meta" className="tabular-nums">
                  {formatToolMoney(row.perMonth)}
                </TableCell>
                <TableCell column="meta" className="tabular-nums">
                  {formatToolMoney(row.perTrade)}
                </TableCell>
                <TableCell column="meta" className="tabular-nums">
                  {formatRate(row.makerPercent)}
                </TableCell>
                <TableCell column="meta" className="tabular-nums">
                  {formatRate(row.takerPercent)}
                </TableCell>
                <TableCell column="meta">
                  <CheckedOn row={row} today={today} />
                </TableCell>
                <TableCell column="meta">
                  <a
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                  >
                    {`${row.name}'s fee page`}
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TableSurface>
  )
}

/** The checked date, with a warning in words once the row is too old to trust. */
function CheckedOn({ row, today }: { row: FeeResult; today: string }) {
  const date = format(parseISO(row.checkedOn), "d MMM yyyy")
  if (!isStale(row, today)) return <span>{date}</span>
  return (
    <span className="inline-flex items-center gap-1 text-destructive">
      <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
      {`${date}, over ${STALE_AFTER_DAYS} days ago. The rate may have changed.`}
    </span>
  )
}

function sortRows(
  rows: FeeResult[],
  column: SortColumn,
  direction: TableSortDirection
): FeeResult[] {
  const value = SORT_VALUE[column]
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const order =
      typeof left === "string"
        ? left.localeCompare(right as string)
        : left - (right as number)
    return sign * order || a.name.localeCompare(b.name)
  })
}
