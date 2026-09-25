import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { DecimalField } from "@/components/free-tools/decimal-field"
import { GrowthChart } from "@/components/free-tools/growth-chart"
import { PastDateField } from "@/components/free-tools/past-date-field"
import { FreeToolSignUpCard } from "@/components/free-tools/sign-up-card"
import { getVisitorPageErrorMessage } from "@/components/shell/route-error"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatToolMoney } from "@/lib/free-tools/money"
import {
  DAY_MS,
  DEFAULT_AMOUNT,
  DEFAULT_WEEKDAY,
  DEFAULT_WEEKLY_AMOUNT,
  MAX_AMOUNT,
  MIN_AMOUNT,
  WEEKDAYS,
  formatDay,
  formatMonth,
  gapOn,
  lumpSum,
  splitDaysBetween,
  weeklyBuys,
  type WhatIfList,
  type WhatIfMarket,
  type WhatIfSeries,
} from "@/lib/free-tools/what-if"
import { formatPrice, formatSize } from "@/lib/trade/format"

/**
 * The page's sentence when it cannot load. The market list not arriving is
 * the one failure worth naming; anything else gets the plain public-page
 * sentence.
 */
export function getWhatIfErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return message.includes("WHAT_IF_MARKETS_UNAVAILABLE")
    ? "The list of coins could not be read. Try again in a minute."
    : getVisitorPageErrorMessage(error)
}

type Mode = "once" | "weekly"

/**
 * `/tools/what-if`: what money put into a coin or stock on a past day is
 * worth at the last stored close, bought once or every week.
 *
 * The market's daily closes arrive with the page and every figure is worked
 * out from them in the browser, so typing asks nothing. Picking another
 * market opens its address, `?coin=SOL` or `?stock=NVDA`, which the server
 * answers from its kept copy.
 */
export function WhatIfCalculator({
  list,
  series,
  signedIn,
}: {
  list: WhatIfList
  series: WhatIfSeries
  signedIn: boolean
}) {
  const navigate = useNavigate()
  const firstDay = series.days[0]
  const lastDay = series.days[series.days.length - 1]
  const [mode, setMode] = React.useState<Mode>("once")
  const [pickedDay, setPickedDay] = React.useState(() =>
    Math.max(defaultStartDay(lastDay), firstDay)
  )
  // A day picked on a market whose closes start earlier is moved to this
  // market's first close, and the answer says so.
  const day = Math.min(Math.max(pickedDay, firstDay), lastDay)

  const onMarketChange = (value: string) => {
    const [kind, symbol] = value.split(":")
    void navigate({
      to: "/tools/what-if",
      search: kind === "stock" ? { stock: symbol } : { coin: symbol },
      resetScroll: false,
    })
  }

  const marketField = (
    <MarketSelect
      list={list}
      market={series.market}
      onChange={onMarketChange}
    />
  )
  const dayField = (
    <PastDateField
      id="what-if-day"
      label={mode === "once" ? "Bought on" : "Starting on"}
      hint="Days are counted in UTC, and a day's price is its closing price."
      day={day}
      firstDay={firstDay}
      lastDay={lastDay}
      onChange={setPickedDay}
    />
  )
  const startNote =
    pickedDay < firstDay
      ? `Stored prices for ${series.market.symbol} start on ${formatDay(firstDay)}, so the answer starts there.`
      : null

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-2 text-left md:gap-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">What if I had bought</h1>
        <p className="text-sm text-muted-foreground">
          What money put into {series.market.symbol} on a past day is worth
          now, bought once or every week.
        </p>
      </header>

      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as Mode)}
        className="flex flex-col gap-2 md:gap-3"
      >
        <TabsList>
          <TabsTrigger value="once">Bought once</TabsTrigger>
          <TabsTrigger value="weekly">Bought every week</TabsTrigger>
        </TabsList>
        <TabsContent value="once" className="flex flex-col gap-2 md:gap-3">
          <Once
            series={series}
            day={day}
            startNote={startNote}
            marketField={marketField}
            dayField={dayField}
          />
        </TabsContent>
        <TabsContent value="weekly" className="flex flex-col gap-2 md:gap-3">
          <Weekly
            series={series}
            day={day}
            startNote={startNote}
            marketField={marketField}
            dayField={dayField}
          />
        </TabsContent>
      </Tabs>

      {signedIn ? null : <FreeToolSignUpCard />}
    </div>
  )
}

function Once({
  series,
  day,
  startNote,
  marketField,
  dayField,
}: {
  series: WhatIfSeries
  day: number
  startNote: string | null
  marketField: React.ReactNode
  dayField: React.ReactNode
}) {
  const [amount, setAmount] = React.useState(DEFAULT_AMOUNT)
  const result = React.useMemo(
    () => lumpSum(series, amount, day),
    [series, amount, day]
  )
  const unit = unitName(series.market, result?.units ?? 0)

  return (
    <>
      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {marketField}
            {dayField}
            <DecimalField
              id="what-if-amount"
              label="Amount"
              unit="$"
              value={amount}
              min={MIN_AMOUNT}
              max={MAX_AMOUNT}
              onChange={setAmount}
            />
          </CardContent>
        </Card>

        {result ? (
          <AnswerCard
            series={series}
            sentence={`${formatToolMoney(amount)} of ${series.market.symbol} bought at the close on ${formatDay(result.boughtDay)}, at ${formatPrice(result.boughtPrice)}, is ${formatSize(result.units)} ${unit}. At the last close, on ${formatDay(result.lastDay)} at ${formatPrice(result.lastPrice)}, that is worth ${formatToolMoney(result.worth)}.`}
            figures={[
              { label: "Worth now", value: formatToolMoney(result.worth) },
              madeOrLost(result.made),
              {
                label: "Lowest along the way",
                value: formatToolMoney(result.lowest.worth),
                under: `at the close on ${formatDay(result.lowest.day)}`,
              },
            ]}
            notes={[
              startNote,
              thousandNote(series.market),
              movedBuyNote(series, result.askedDay, result.boughtDay),
              ...splitNotes(series, result.boughtDay, result.lastDay, result.units),
              ...gapNotes(series, result.boughtDay, result.lastDay, result.askedDay),
            ]}
          />
        ) : (
          <AnswerCard
            series={series}
            sentence="There is no stored close on or after that day. Pick an earlier day."
            figures={[]}
            notes={[]}
          />
        )}
      </div>
      {result ? <ValueChart points={result.points} showPutIn={false} /> : null}
    </>
  )
}

function Weekly({
  series,
  day,
  startNote,
  marketField,
  dayField,
}: {
  series: WhatIfSeries
  day: number
  startNote: string | null
  marketField: React.ReactNode
  dayField: React.ReactNode
}) {
  const [amount, setAmount] = React.useState(DEFAULT_WEEKLY_AMOUNT)
  const [pickedWeekday, setWeekday] = React.useState(DEFAULT_WEEKDAY)
  const stock = series.market.kind === "stock"
  // A stock has no close at the weekend, so its weekend choices are hidden
  // and a weekend picked on a coin becomes Monday.
  const weekday =
    stock && (pickedWeekday === 0 || pickedWeekday === 6) ? 1 : pickedWeekday
  const result = React.useMemo(
    () => weeklyBuys(series, amount, weekday, day),
    [series, amount, weekday, day]
  )
  const unit = unitName(series.market, result?.units ?? 0)
  const weekdayName = WEEKDAYS[weekday]

  return (
    <>
      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {marketField}
            {dayField}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
              <DecimalField
                id="what-if-weekly-amount"
                label="Each week"
                unit="$"
                value={amount}
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                className="sm:flex-1"
                onChange={setAmount}
              />
              <div className="grid gap-2">
                <FieldLabel htmlFor="what-if-weekday">On</FieldLabel>
                <Select
                  value={String(weekday)}
                  onValueChange={(value) => setWeekday(Number(value))}
                >
                  <SelectTrigger
                    id="what-if-weekday"
                    className="w-full sm:w-36"
                  >
                    <SelectValue>{weekdayName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((name, index) =>
                      stock && (index === 0 || index === 6) ? null : (
                        <SelectItem key={name} value={String(index)}>
                          {name}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {result ? (
          <AnswerCard
            series={series}
            sentence={`${formatToolMoney(amount)} of ${series.market.symbol} every ${weekdayName} from ${formatDay(result.firstBuyDay)} is ${result.buys.toLocaleString("en-US")} ${result.buys === 1 ? "buy" : "buys"}: ${formatToolMoney(result.putIn)} put in for ${formatSize(result.units)} ${unit}, worth ${formatToolMoney(result.worth)} at the last close, on ${formatDay(result.lastDay)}.`}
            figures={[
              { label: "Money put in", value: formatToolMoney(result.putIn) },
              { label: "Worth now", value: formatToolMoney(result.worth) },
              madeOrLost(result.made),
              {
                label: "Average price paid",
                value: formatPrice(result.averagePrice),
                under: `against ${formatPrice(result.lastPrice)} at the last close`,
              },
            ]}
            notes={[
              startNote,
              thousandNote(series.market),
              result.skippedWeeks > 0
                ? `${result.skippedWeeks.toLocaleString("en-US")} ${result.skippedWeeks === 1 ? "week has" : "weeks have"} no stored close at all, so ${result.skippedWeeks === 1 ? "it buys" : "they buy"} nothing.`
                : null,
              stock
                ? "A buying day the market was shut buys at the next close that week."
                : null,
              ...splitNotes(series, result.firstBuyDay, result.lastDay, null),
              ...gapNotes(series, result.firstBuyDay, result.lastDay, null),
            ]}
          />
        ) : (
          <AnswerCard
            series={series}
            sentence={`No ${weekdayName} between that day and the last stored close, on ${formatDay(series.days[series.days.length - 1])}, has a close. Pick an earlier day.`}
            figures={[]}
            notes={[]}
          />
        )}
      </div>
      {result ? <ValueChart points={result.points} showPutIn /> : null}
    </>
  )
}

function MarketSelect({
  list,
  market,
  onChange,
}: {
  list: WhatIfList
  market: WhatIfMarket
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor="what-if-market">
        {list.stocks.length > 0 ? "Coin or stock" : "Coin"}
      </FieldLabel>
      <Select value={`${market.kind}:${market.symbol}`} onValueChange={onChange}>
        <SelectTrigger id="what-if-market" className="w-full sm:w-56">
          {/* Named here so the server's drawing already says the market. */}
          <SelectValue>{market.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {[...list.coins, ...list.stocks].map((listed) => (
            <SelectItem
              key={`${listed.kind}:${listed.symbol}`}
              value={`${listed.kind}:${listed.symbol}`}
            >
              {listed.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * The answer, its figures, then every note that changes how to read it:
 * a moved buying day, a split, a stretch with no prices, and where the
 * prices come from.
 */
function AnswerCard({
  series,
  sentence,
  figures,
  notes,
}: {
  series: WhatIfSeries
  sentence: string
  figures: { label: string; value: string; under?: string }[]
  notes: (string | null)[]
}) {
  const shown = notes.filter((note): note is string => Boolean(note))
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>The answer</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p role="status" className="text-sm">
          {sentence}
        </p>
        {figures.length > 0 ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            {figures.map((figure) => (
              <div key={figure.label} className="grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  {figure.label}
                </dt>
                <dd className="font-mono text-lg font-medium tabular-nums">
                  {figure.value}
                </dd>
                {figure.under ? (
                  <dd className="text-xs text-muted-foreground">
                    {figure.under}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        ) : null}
        {shown.length > 0 ? (
          <ul className="grid list-disc gap-1 pl-4 text-sm">
            {shown.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {sourceLine(series)} Fees and taxes are left out.
        </p>
      </CardContent>
    </Card>
  )
}

/** The worth each day; the weekly tab adds the money put in so far. */
function ValueChart({
  points,
  showPutIn,
}: {
  points: { day: number; value: number; putIn: number }[]
  showPutIn: boolean
}) {
  const span = (points.at(-1)?.day ?? 0) - (points[0]?.day ?? 0)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>What it was worth each day</CardTitle>
      </CardHeader>
      <CardContent>
        <GrowthChart
          points={points.map((point) =>
            showPutIn
              ? { day: point.day, balance: point.value, putIn: point.putIn }
              : { day: point.day, balance: point.value }
          )}
          valueLabel="Worth"
          dayLabel={(day) => chartDayLabel(day, span)}
        />
      </CardContent>
    </Card>
  )
}

function madeOrLost(made: number) {
  return made >= 0
    ? { label: "Money made", value: formatToolMoney(made) }
    : { label: "Money lost", value: formatToolMoney(-made) }
}

/** kPEPE is a thousand PEPE, so its coin counts and prices are per thousand. */
function thousandNote(market: WhatIfMarket): string | null {
  if (market.kind !== "coin" || !/^k[A-Z]/.test(market.symbol)) return null
  const coin = market.symbol.slice(1)
  return `One ${market.symbol} is a thousand ${coin}, the way Hyperliquid and Binance count it, so its price is for a thousand ${coin}.`
}

/** "SOL", "shares" or "share". A k-coin keeps its name. */
function unitName(market: WhatIfMarket, units: number): string {
  if (market.kind === "coin") return market.symbol
  return units === 1 ? "share" : "shares"
}

/** Why the buy used another day's close, or null when it did not. */
function movedBuyNote(
  series: WhatIfSeries,
  askedDay: number,
  boughtDay: number
): string | null {
  if (askedDay === boughtDay) return null
  const gap = gapOn(series, askedDay)
  const why = gap
    ? `${series.source} has no price from ${formatDay(Math.floor(gap.from / DAY_MS))} to ${formatDay(Math.ceil(gap.to / DAY_MS) - 1)}. ${gap.reason}`
    : series.market.kind === "stock"
      ? "The market was shut that day."
      : `${series.source} has no close for that day.`
  return `No close on ${formatDay(askedDay, true)}. ${why} The buy uses the next close, on ${formatDay(boughtDay, true)}.`
}

function splitNotes(
  series: WhatIfSeries,
  fromDay: number,
  toDay: number,
  units: number | null
): string[] {
  const counted =
    units === null
      ? "every share count here is in today's shares"
      : `the ${formatSize(units)} shares are today's shares`
  return splitDaysBetween(series, fromDay, toDay).map(
    (day) =>
      `${series.market.symbol} split its shares on ${formatDay(day)}. Every stored price before then is in today's shares, so ${counted}.`
  )
}

/** Every stretch with no stored prices inside the holding, except the one already named. */
function gapNotes(
  series: WhatIfSeries,
  fromDay: number,
  toDay: number,
  namedDay: number | null
): string[] {
  const start = fromDay * DAY_MS
  const end = (toDay + 1) * DAY_MS
  return series.gaps
    .filter((gap) => gap.to > start && gap.from < end)
    .filter((gap) => namedDay === null || gapOn(series, namedDay) !== gap)
    .map(
      (gap) =>
        `${series.source} has no price from ${formatDay(Math.floor(gap.from / DAY_MS))} to ${formatDay(Math.ceil(gap.to / DAY_MS) - 1)}, so the chart runs straight across it. ${gap.reason}`
    )
}

function sourceLine(series: WhatIfSeries): string {
  return series.market.kind === "coin"
    ? `Daily closing prices of ${series.market.symbol}'s perpetual future on Binance.`
    : `Daily closing prices of ${series.market.symbol} from Dukascopy, with every split folded in.`
}

/**
 * The first of January of the last close's year, which is what people ask
 * about. Before 1 Feb that is barely a month, so it is the year before.
 */
function defaultStartDay(lastDay: number): number {
  const last = new Date(lastDay * DAY_MS)
  const year =
    last.getUTCMonth() === 0 ? last.getUTCFullYear() - 1 : last.getUTCFullYear()
  return Date.UTC(year, 0, 1) / DAY_MS
}

/** "Mar 2025" across more than a year, "4 Mar" inside one. */
function chartDayLabel(day: number, span: number): string {
  return formatMonth(day, span <= 366)
}
