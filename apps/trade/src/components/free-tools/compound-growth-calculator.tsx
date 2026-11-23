import * as React from "react"
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfToday,
} from "date-fns"

import { DecimalField } from "@/components/free-tools/decimal-field"
import { GrowthChart } from "@/components/free-tools/growth-chart"
import { FreeToolSignUpCard } from "@/components/free-tools/sign-up-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { NumberField } from "@/components/ui/number-field"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  GAIN_PERIODS,
  LENGTH_UNITS,
  MAX_DAYS,
  dailyRate,
  growForwards,
  lengthInDays,
  maxLength,
  neededGain,
  type GainPeriod,
  type GrowthResult,
  type LengthUnit,
  type LosingDays,
} from "@/lib/free-tools/compound-growth"
import { formatToolMoney, formatToolPercent } from "@/lib/free-tools/money"
import { stickyPanelTableHeaderClassName } from "@/lib/layout/panel-section-bar"
import { cn } from "@/lib/utils"

const MAX_MONEY = 1_000_000_000
const MAX_GAIN_PERCENT = 1000

type Mode = "forwards" | "backwards"

/**
 * `/tools/compound-growth`: what a steady gain grows money into, or what gain
 * a goal needs by a date. Everything is worked out in the browser as the
 * visitor types; nothing is sent anywhere.
 *
 * The start amount and the losing-days switch are shared by both tabs, so
 * moving between them keeps what was typed.
 */
export function CompoundGrowthCalculator({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = React.useState<Mode>("forwards")
  const [start, setStart] = React.useState(1000)
  const [losingOn, setLosingOn] = React.useState(false)
  const [losingPer100, setLosingPer100] = React.useState(40)
  const [lossPercent, setLossPercent] = React.useState(1)
  const losingDays = React.useMemo<LosingDays | null>(
    () => (losingOn ? { per100: losingPer100, lossPercent } : null),
    [losingOn, losingPer100, lossPercent]
  )

  const startField = (
    <DecimalField
      id="growth-start"
      label="Starting amount"
      unit="$"
      value={start}
      min={1}
      max={MAX_MONEY}
      onChange={setStart}
    />
  )
  const losingFields = (
    <LosingDaysFields
      on={losingOn}
      per100={losingPer100}
      lossPercent={lossPercent}
      onOnChange={setLosingOn}
      onPer100Change={setLosingPer100}
      onLossPercentChange={setLossPercent}
    />
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-2 text-left md:gap-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Compound growth calculator</h1>
        <p className="text-sm text-muted-foreground">
          What a steady gain turns your money into, or what gain a goal needs by
          a date.
        </p>
      </header>

      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as Mode)}
        className="flex flex-col gap-2 md:gap-3"
      >
        <TabsList>
          <TabsTrigger value="forwards">What it grows to</TabsTrigger>
          <TabsTrigger value="backwards">What a goal needs</TabsTrigger>
        </TabsList>
        <TabsContent value="forwards" className="flex flex-col gap-2 md:gap-3">
          <Forwards
            start={start}
            startField={startField}
            losingDays={losingDays}
            losingFields={losingFields}
          />
        </TabsContent>
        <TabsContent value="backwards" className="flex flex-col gap-2 md:gap-3">
          <Backwards
            start={start}
            startField={startField}
            losingDays={losingDays}
            losingFields={losingFields}
          />
        </TabsContent>
      </Tabs>

      {signedIn ? null : <FreeToolSignUpCard />}
    </div>
  )
}

function Forwards({
  start,
  startField,
  losingDays,
  losingFields,
}: {
  start: number
  startField: React.ReactNode
  losingDays: LosingDays | null
  losingFields: React.ReactNode
}) {
  const [gain, setGain] = React.useState(1)
  const [per, setPer] = React.useState<GainPeriod>("day")
  const [length, setLength] = React.useState(365)
  const [unit, setUnit] = React.useState<LengthUnit>("days")
  const [monthlyAdd, setMonthlyAdd] = React.useState(0)
  const days = lengthInDays(length, unit)

  const result = React.useMemo(
    () =>
      growForwards({
        start,
        dailyRate: dailyRate(gain, per),
        days,
        monthlyAdd,
        losingDays,
      }),
    [start, gain, per, days, monthlyAdd, losingDays]
  )

  return (
    <>
      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {startField}
            <div className="flex items-end gap-2">
              <DecimalField
                id="growth-gain"
                label="Gain"
                unit="%"
                value={gain}
                min={0}
                max={MAX_GAIN_PERCENT}
                className="flex-1"
                onChange={setGain}
              />
              <PeriodSelect
                id="growth-per"
                label="Every"
                value={per}
                options={GAIN_PERIODS}
                onChange={(value) => setPer(value as GainPeriod)}
              />
            </div>
            <div className="flex items-end gap-2">
              <NumberField
                id="growth-length"
                label="For"
                value={length}
                min={1}
                max={maxLength(unit)}
                className="flex-1"
                onChange={setLength}
              />
              <PeriodSelect
                id="growth-unit"
                label="Counted in"
                value={unit}
                options={LENGTH_UNITS}
                onChange={(value) => {
                  const next = value as LengthUnit
                  setUnit(next)
                  setLength((current) => Math.min(current, maxLength(next)))
                }}
              />
            </div>
            <DecimalField
              id="growth-monthly"
              label="Added every month"
              hint="Goes in at the end of each full month, after that day's gain."
              unit="$"
              value={monthlyAdd}
              min={0}
              max={MAX_MONEY}
              onChange={setMonthlyAdd}
            />
            {losingFields}
          </CardContent>
        </Card>

        <AnswerCard
          sentence={forwardsSentence({
            start,
            gain,
            per,
            days,
            monthlyAdd,
            losingDays,
            end: result.end,
          })}
          figures={[
            { label: "End amount", value: formatToolMoney(result.end) },
            { label: "Money put in", value: formatToolMoney(result.putIn) },
            result.made >= 0
              ? { label: "Money made", value: formatToolMoney(result.made) }
              : { label: "Money lost", value: formatToolMoney(-result.made) },
          ]}
        />
      </div>
      <GrowthDetail result={result} />
    </>
  )
}

function Backwards({
  start,
  startField,
  losingDays,
  losingFields,
}: {
  start: number
  startField: React.ReactNode
  losingDays: LosingDays | null
  losingFields: React.ReactNode
}) {
  const [goal, setGoal] = React.useState(100_000)
  const [picked, setDate] = React.useState<Date | undefined>()
  // A year from the visitor's today, read only in the browser: the server's
  // clock may already be on tomorrow for a visitor in Toronto. The server
  // draws no date and the browser fills it in as the page wakes.
  const defaultTime = React.useSyncExternalStore(
    subscribeToNothing,
    () => addDays(startOfToday(), 365).getTime(),
    () => null
  )
  const date =
    picked ?? (defaultTime === null ? undefined : new Date(defaultTime))

  const days = date ? differenceInCalendarDays(date, startOfToday()) : null
  const problem =
    days === null
      ? "Pick the date you want to reach the goal by."
      : days < 1
        ? "Pick a date after today."
        : days > MAX_DAYS
          ? "Pick a date within 50 years."
          : goal <= start
            ? "The starting amount already reaches that goal. Pick a bigger goal."
            : null
  const needed = React.useMemo(
    () =>
      problem || days === null
        ? null
        : neededGain({ start, goal, days, losingDays }),
    [problem, start, goal, days, losingDays]
  )
  const result = React.useMemo(
    () =>
      needed && days !== null
        ? growForwards({
            start,
            dailyRate: needed.perGainingDay,
            days,
            monthlyAdd: 0,
            losingDays,
          })
        : null,
    [needed, start, days, losingDays]
  )

  return (
    <>
      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {startField}
            <DecimalField
              id="growth-goal"
              label="Goal"
              unit="$"
              value={goal}
              min={1}
              max={MAX_MONEY}
              onChange={setGoal}
            />
            <div className="grid gap-2">
              <FieldLabel htmlFor="growth-date">By</FieldLabel>
              <DatePicker id="growth-date" value={date} onChange={setDate} />
            </div>
            {losingFields}
          </CardContent>
        </Card>

        {problem ? (
          <AnswerCard sentence={problem} figures={[]} />
        ) : !needed || days === null ? (
          <AnswerCard
            sentence="No gain can reach that goal: every day would be a losing day, or a losing day takes everything."
            figures={[]}
          />
        ) : (
          <AnswerCard
            sentence={`To turn ${formatToolMoney(start)} into ${formatToolMoney(goal)} by ${format(date!, "d MMM yyyy")}, ${days.toLocaleString("en-US")} ${days === 1 ? "day" : "days"} away, you need ${formatToolPercent(needed.perGainingDay)} ${losingDays ? "on every day that is not a losing day" : "every single day"}.`}
            figures={[
              {
                label: losingDays ? "Each gaining day" : "Each day",
                value: formatToolPercent(needed.perGainingDay),
              },
              {
                label: "Each week, on average",
                value: formatToolPercent(needed.perWeek),
              },
              {
                label: "Each month, on average",
                value: formatToolPercent(needed.perMonth),
              },
            ]}
          />
        )}
      </div>
      {result ? <GrowthDetail result={result} /> : null}
    </>
  )
}

/** "$1,000 at 1% a day for 365 days becomes $37,783.", with any extras named. */
function forwardsSentence(input: {
  start: number
  gain: number
  per: GainPeriod
  days: number
  monthlyAdd: number
  losingDays: LosingDays | null
  end: number
}): string {
  const { start, gain, per, days, monthlyAdd, losingDays, end } = input
  const extras = [
    monthlyAdd > 0 ? `adding ${formatToolMoney(monthlyAdd)} a month` : null,
    losingDays
      ? `with ${losingDays.per100} out of 100 days losing ${losingDays.lossPercent}%`
      : null,
  ].filter(Boolean)
  const length = `${days.toLocaleString("en-US")} ${days === 1 ? "day" : "days"}`
  const withExtras = extras.length ? `, ${extras.join(" and ")},` : ""
  return `${formatToolMoney(start)} at ${gain}% a ${per} for ${length}${withExtras} becomes ${formatToolMoney(end)}.`
}

function LosingDaysFields({
  on,
  per100,
  lossPercent,
  onOnChange,
  onPer100Change,
  onLossPercentChange,
}: {
  on: boolean
  per100: number
  lossPercent: number
  onOnChange: (on: boolean) => void
  onPer100Change: (value: number) => void
  onLossPercentChange: (value: number) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Switch id="growth-losing" checked={on} onCheckedChange={onOnChange} />
        <FieldLabel
          htmlFor="growth-losing"
          hint="Losing days are spread evenly: with 40 out of 100, the 3rd, 5th, 8th and 10th days lose, and so on."
        >
          Mix in losing days
        </FieldLabel>
      </div>
      {on ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="growth-losing-days"
            label="Losing days out of 100"
            value={per100}
            min={0}
            max={100}
            onChange={onPer100Change}
          />
          <DecimalField
            id="growth-loss"
            label="Loss on a losing day"
            unit="%"
            value={lossPercent}
            min={0}
            max={100}
            onChange={onLossPercentChange}
          />
        </div>
      ) : null}
    </>
  )
}

function PeriodSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * The answer, then the plain line every answer on this page carries. The line
 * names no statistic about real traders: any such figure has to come from
 * Trade's own records, and none is wired in yet.
 */
function AnswerCard({
  sentence,
  figures,
}: {
  sentence: string
  figures: { label: string; value: string }[]
}) {
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
          <dl className="grid gap-4 sm:grid-cols-3">
            {figures.map((figure) => (
              <div key={figure.label} className="grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  {figure.label}
                </dt>
                <dd className="font-mono text-lg font-medium tabular-nums">
                  {figure.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Real trading never gains the same amount every day. Losing days come
          in between, and after a 50% loss it takes a 100% gain just to get back
          to where you started.
        </p>
      </CardContent>
    </Card>
  )
}

function GrowthDetail({ result }: { result: GrowthResult }) {
  const anyAdded = result.rows.some((row) => row.addedThisMonth > 0)
  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Balance over time</CardTitle>
        </CardHeader>
        <CardContent>
          <GrowthChart points={result.points} />
        </CardContent>
      </Card>
      <TableSurface>
        <ScrollArea viewportClassName="max-h-96">
          <Table
            containerClassName={cn(
              "overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
              stickyPanelTableHeaderClassName
            )}
          >
            <TableHeader>
              <TableRow>
                <TableHead column="meta">When</TableHead>
                {anyAdded ? <TableHead column="meta">Added</TableHead> : null}
                <TableHead column="meta">Balance</TableHead>
                <TableHead column="meta">Made so far</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.day}>
                  <TableCell column="meta">
                    {rowLabel(row.day, row.month)}
                  </TableCell>
                  {anyAdded ? (
                    <TableCell column="meta" className="tabular-nums">
                      {row.addedThisMonth > 0
                        ? formatToolMoney(row.addedThisMonth)
                        : "None"}
                    </TableCell>
                  ) : null}
                  <TableCell column="meta" className="tabular-nums">
                    {formatToolMoney(row.balance)}
                  </TableCell>
                  <TableCell column="meta" className="tabular-nums">
                    {formatToolMoney(row.balance - row.putIn)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TableSurface>
    </>
  )
}

function subscribeToNothing() {
  return () => {}
}

/** "Start", "Month 3", or "Day 45" for a last row that stops mid-month. */
function rowLabel(day: number, month: number): string {
  if (day === 0) return "Start"
  if (Number.isInteger(month)) return `Month ${month}`
  return `Day ${day}`
}
