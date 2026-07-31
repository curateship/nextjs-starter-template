import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  CircleDollarSignIcon,
  LayersIcon,
  LineChartIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MembershipSummary } from "@/lib/api/membership"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * The front door for everything about members and money.
 *
 * Every figure and every chart is read from the tables the Users, Plans and
 * Revenue pages already read, so nothing here can disagree with the page it
 * links to. Where a card would need history the app does not keep, it shows
 * today's picture and says so on the card rather than inventing a trend.
 */

// One colour, mixed down. Everything derives from the theme's primary so the
// charts follow whatever the workspace is styled to, in both themes.
const shade = (percent: number) =>
  `color-mix(in oklch, var(--primary) ${percent}%, var(--background))`

const planColours = [
  "var(--primary)",
  shade(80),
  shade(60),
  shade(42),
  shade(30),
]

export function AdminMembershipDashboard({
  summary,
}: {
  summary: MembershipSummary
}) {
  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <HeadlineFigures summary={summary} />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
        <JoiningChart summary={summary} />
        <RevenueByPlanChart summary={summary} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ArpuCard summary={summary} />
        <SubscriptionsCard summary={summary} />
        <PeopleByPlanCard summary={summary} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The headline row: one card, the figures side by side, hairlines between them.

function HeadlineFigures({ summary }: { summary: MembershipSummary }) {
  const { revenue } = summary

  const figures = [
    {
      to: "/admin/users",
      icon: UsersIcon,
      label: "People",
      value: revenue.totalUsers.toLocaleString(),
      // The only honest month-on-month figure in the app: joining dates are on
      // the row, so last month's total can be counted back to.
      before: `${summary.accountsLastMonth.toLocaleString()} at the end of last month`,
      change: percentChange(summary.accountsLastMonth, revenue.totalUsers),
      footer: peopleFooter(summary),
    },
    {
      to: "/admin/users",
      icon: UserPlusIcon,
      label: "Joined this month",
      value: summary.newThisMonth.toLocaleString(),
      before: `${summary.newLastMonth.toLocaleString()} joined last month`,
      change: percentChange(summary.newLastMonth, summary.newThisMonth),
      footer: null,
    },
    {
      to: "/admin/billing",
      icon: BarChart3Icon,
      label: "Paying",
      value: revenue.paidSubscribers.toLocaleString(),
      before: null,
      change: null,
      footer: `${revenue.trialing} on a trial, ${revenue.cancelling} ending`,
    },
    {
      to: "/admin/plans",
      icon: CircleDollarSignIcon,
      label: "Revenue a month",
      value: formatMoney(revenue.monthlyRecurringCents, revenue.currency),
      before: null,
      change: null,
      footer: `${summary.paidPlans} of ${summary.livePlans} plans cost money`,
    },
  ]

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-0">
        {figures.map((figure, index) => (
          <div key={figure.label} className="flex items-start">
            <Link
              to={figure.to}
              className="group/figure -m-2 min-w-0 flex-1 space-y-1 rounded-lg p-2 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <figure.icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate text-xs font-medium sm:text-sm">
                  {figure.label}
                </span>
              </div>
              <p className="h-4 text-xs text-muted-foreground/70 tabular-nums">
                {figure.before}
              </p>
              {/* Mono and tabular so the figures line up across the row and do
                  not jump about as they change. */}
              <p className="font-mono text-2xl leading-tight font-semibold tracking-tight tabular-nums lg:text-[28px]">
                {figure.value}
              </p>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                {figure.change ? (
                  <ChangeBadge change={figure.change} />
                ) : null}
                <span className="text-muted-foreground">{figure.footer}</span>
              </div>
            </Link>
            {index < figures.length - 1 ? (
              <div
                className="mx-4 hidden h-full w-px shrink-0 bg-border lg:block xl:mx-6"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

type Change = { percent: number; up: boolean }

/** Null when there is nothing to compare against — never a made-up 0%. */
function percentChange(before: number, after: number): Change | null {
  if (!before) return null
  const percent = ((after - before) / before) * 100
  return { percent: Math.abs(percent), up: after >= before }
}

function ChangeBadge({ change }: { change: Change }) {
  const Icon = change.up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    // Never colour alone: the arrow points the way the number went.
    <span
      className={cn(
        "flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums",
        change.up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-destructive"
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {change.up ? "+" : "-"}
      {Math.round(change.percent)}%
      <span className="ml-1 font-normal text-muted-foreground">
        vs last month
      </span>
    </span>
  )
}

function peopleFooter(summary: MembershipSummary) {
  const parts = [
    `${summary.members} ${summary.members === 1 ? "member" : "members"}`,
    `${summary.admins} ${summary.admins === 1 ? "admin" : "admins"}`,
  ]
  if (summary.suspended > 0) parts.push(`${summary.suspended} suspended`)
  return parts.join(", ")
}

// ---------------------------------------------------------------------------
// The chart cards. Each is a Card with its own flat header row, matching the
// reference: a bordered icon button, the title, and controls on the right.

function ChartCard({
  icon: Icon,
  title,
  legend,
  control,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  legend?: React.ReactNode
  control?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-0 py-0", className)}>
      <div className="flex min-h-14 flex-col gap-2 border-b px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40"
            aria-hidden
          >
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <h2 className="text-sm font-medium sm:text-base">{title}</h2>
        </div>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {legend}
          {control}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">{children}</div>
    </Card>
  )
}

function LegendDot({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="size-2 shrink-0 rounded-full sm:size-2.5"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      <span className="text-[10px] text-muted-foreground sm:text-xs">
        {label}
      </span>
    </span>
  )
}

/**
 * Both periods draw the same two lines — what is happening now against the
 * stretch before it — so they share one shape and only the wording changes.
 */
const joiningConfig = (period: "year" | "month"): ChartConfig => ({
  current: {
    label: period === "year" ? "This year" : "This month",
    color: "var(--primary)",
  },
  previous: {
    label: period === "year" ? "Prev year" : "Last month",
    color: shade(70),
  },
})

/**
 * The reference's "Total Revenue" card. This app keeps no revenue history —
 * nothing records what was being paid last March — but it does know when every
 * account was created, so the same chart is drawn from real joining dates.
 */
function JoiningChart({ summary }: { summary: MembershipSummary }) {
  const [period, setPeriod] = React.useState<"year" | "month">("year")
  const showingYear = period === "year"

  const data = showingYear
    ? summary.signupsByMonth.map((point) => ({
        label: point.month,
        current: point.thisYear,
        previous: point.lastYear,
      }))
    : summary.signupsByDay.map((point) => ({
        label: point.day,
        current: point.thisMonth,
        previous: point.lastMonth,
      }))
  const config = joiningConfig(period)
  const total = data.reduce((sum, point) => sum + point.current, 0)

  return (
    <ChartCard
      icon={LineChartIcon}
      title="People joining"
      className="flex-1"
      legend={
        <div className="hidden items-center gap-4 lg:flex">
          <LegendDot
            colour="var(--primary)"
            label={showingYear ? "This year" : "This month"}
          />
          <LegendDot
            colour={shade(70)}
            label={showingYear ? "Prev year" : "Last month"}
          />
        </div>
      }
      control={
        <Select
          value={period}
          onValueChange={(value) => setPeriod(value as "year" | "month")}
        >
          <SelectTrigger
            className="w-[130px] shrink-0"
            aria-label="Period for people joining"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="year">This year</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <div>
        <p className="font-mono text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {total.toLocaleString()}
        </p>
        <p className="text-[10px] tracking-wider text-muted-foreground uppercase sm:text-xs">
          {showingYear
            ? "joined in the last 12 months"
            : "joined so far this month"}
        </p>
      </div>
      <div className="h-[200px] w-full min-w-0 sm:h-[240px] lg:h-[280px]">
        <ChartContainer config={config} className="h-full w-full">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              dy={8}
              // A month of days is too many labels to read; show every third.
              interval={showingYear ? 0 : 2}
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
              type="linear"
              dataKey="previous"
              stroke="var(--color-previous)"
              strokeWidth={1.5}
              strokeOpacity={0.5}
              fill="var(--color-previous)"
              fillOpacity={0.08}
            />
            <Line
              type="linear"
              dataKey="current"
              stroke="var(--color-current)"
              strokeWidth={1.5}
              strokeLinecap="round"
              dot={{ fill: "var(--color-current)", strokeWidth: 0, r: 2 }}
              activeDot={{ r: 3.5 }}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </ChartCard>
  )
}

/**
 * The reference's "MRR by plan" card. Six months of stacked bars would need
 * six months of history, so this is one bar per plan at what it brings in
 * today — the same chart, honestly fed.
 */
function RevenueByPlanChart({ summary }: { summary: MembershipSummary }) {
  // A paid plan nobody is on brings in nothing, and a chart of nothing draws an
  // axis in fractions of a cent — say there is nothing instead.
  const paidPlans = summary.planMembership.filter(
    (plan) => plan.isPaid && plan.monthlyCents > 0
  )

  const config: ChartConfig = {
    monthlyCents: { label: "A month", color: "var(--primary)" },
  }

  return (
    <ChartCard
      icon={BarChart3Icon}
      title="Revenue by plan"
      className="xl:w-[410px]"
    >
      {paidPlans.length === 0 ? (
        <EmptyChart message="No paid plans are bringing anything in yet." />
      ) : (
        <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
          <ChartContainer config={config} className="h-full w-full">
            <BarChart
              layout="vertical"
              data={paidPlans}
              barSize={24}
              margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
            >
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                tickFormatter={(value: number) =>
                  formatMoney(value, summary.revenue.currency)
                }
              />
              <YAxis
                type="category"
                dataKey="planName"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                width={72}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      formatMoney(Number(value), summary.revenue.currency)
                    }
                  />
                }
              />
              <Bar
                dataKey="monthlyCents"
                radius={[0, 4, 4, 0]}
                fill="var(--color-monthlyCents)"
              >
                {paidPlans.map((plan, index) => (
                  <Cell
                    key={plan.planId}
                    fill={planColours[index % planColours.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// The three small cards.

function MiniCard({
  icon: Icon,
  title,
  value,
  helper,
  footer,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
  helper: string
  footer: string
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-3">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40"
            aria-hidden
          >
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-lg font-semibold tabular-nums">
                {value}
              </span>
              <span className="text-xs text-muted-foreground">{helper}</span>
            </div>
          </div>
        </div>
        <div className="min-h-[144px] w-full flex-1">{children}</div>
        <p className="text-[10px] text-muted-foreground sm:text-xs">{footer}</p>
      </CardContent>
    </Card>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[144px] items-center justify-center">
      <p className="text-center text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

/** What each paying person is worth a month, and what each plan brings in. */
function ArpuCard({ summary }: { summary: MembershipSummary }) {
  const paidPlans = summary.planMembership.filter(
    (plan) => plan.isPaid && plan.people > 0
  )
  const perPlan = paidPlans.map((plan) => ({
    planName: plan.planName,
    perPerson: Math.round(plan.monthlyCents / plan.people),
  }))

  const config: ChartConfig = {
    perPerson: { label: "Each a month", color: "var(--primary)" },
  }

  return (
    <MiniCard
      icon={CircleDollarSignIcon}
      title="Revenue per paying person"
      value={formatMoney(summary.arpuCents, summary.revenue.currency)}
      helper="a month"
      footer="Today's picture — this app keeps no month-by-month history."
    >
      {perPlan.length === 0 ? (
        <EmptyChart message="Nobody is paying yet." />
      ) : (
        <ChartContainer config={config} className="h-full w-full">
          <BarChart data={perPlan}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="planName"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    formatMoney(Number(value), summary.revenue.currency)
                  }
                />
              }
            />
            <Bar
              dataKey="perPerson"
              fill="var(--color-perPerson)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      )}
    </MiniCard>
  )
}

const subscriptionConfig = {
  people: { label: "People", color: "var(--primary)" },
} satisfies ChartConfig

/** Where the paying people stand: settled, on a trial, or on their way out. */
function SubscriptionsCard({ summary }: { summary: MembershipSummary }) {
  const { revenue } = summary
  const settled = Math.max(
    0,
    revenue.paidSubscribers - revenue.trialing - revenue.cancelling
  )
  const data = [
    { stage: "Settled", people: settled },
    { stage: "On a trial", people: revenue.trialing },
    { stage: "Ending", people: revenue.cancelling },
  ]

  return (
    <MiniCard
      icon={BarChart3Icon}
      title="Paying people"
      value={revenue.paidSubscribers.toLocaleString()}
      helper="right now"
      footer="Ending means they keep it until their period runs out."
    >
      {revenue.paidSubscribers === 0 ? (
        <EmptyChart message="Nobody is paying yet." />
      ) : (
        <ChartContainer config={subscriptionConfig} className="h-full w-full">
          <BarChart data={data} layout="vertical" barSize={22}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="stage"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              width={70}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="people" radius={[0, 4, 4, 0]}>
              {data.map((row, index) => (
                <Cell
                  key={row.stage}
                  fill={planColours[index % planColours.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </MiniCard>
  )
}

/** The reference's donut, on real numbers: everybody, split by plan. */
function PeopleByPlanCard({ summary }: { summary: MembershipSummary }) {
  const [activeSlice, setActiveSlice] = React.useState<number | null>(null)

  const slices = summary.planMembership
    .filter((plan) => plan.people > 0)
    .map((plan, index) => ({
      name: plan.planName,
      people: plan.people,
      colour: planColours[index % planColours.length],
    }))

  const everyone = slices.reduce((sum, slice) => sum + slice.people, 0)
  const biggest = slices.reduce(
    (top, slice) => (slice.people > top.people ? slice : top),
    slices[0] ?? { name: "", people: 0, colour: "" }
  )
  const config: ChartConfig = { people: { label: "People" } }

  return (
    <MiniCard
      icon={LayersIcon}
      title="People by plan"
      value={everyone.toLocaleString()}
      helper="accounts"
      footer="Everyone in the app, counted once."
    >
      {slices.length === 0 ? (
        <EmptyChart message="No accounts yet." />
      ) : (
        <div className="flex flex-1 items-center justify-center gap-4 sm:gap-6">
          <div className="relative size-[150px] shrink-0">
            <ChartContainer config={config} className="h-full w-full">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="people"
                  nameKey="name"
                  innerRadius="52%"
                  outerRadius="80%"
                  // A gap between slices needs two slices; on one it just
                  // notches the ring.
                  paddingAngle={slices.length > 1 ? 3 : 0}
                  strokeWidth={0}
                  onMouseEnter={(_, index: number) => setActiveSlice(index)}
                  onMouseLeave={() => setActiveSlice(null)}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.colour} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-lg font-semibold tabular-nums">
                {everyone ? Math.round((biggest.people / everyone) * 100) : 0}%
              </span>
              <span className="text-[9px] text-muted-foreground">
                {biggest.name}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2.5">
            {slices.map((slice, index) => (
              <div
                key={slice.name}
                className={cn(
                  "flex items-center gap-2.5 transition-opacity",
                  activeSlice !== null && activeSlice !== index && "opacity-50"
                )}
                onMouseEnter={() => setActiveSlice(index)}
                onMouseLeave={() => setActiveSlice(null)}
              >
                <span
                  className="h-4 w-1 shrink-0 rounded-sm"
                  style={{ backgroundColor: slice.colour }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {slice.name}
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {everyone
                    ? Math.round((slice.people / everyone) * 100)
                    : 0}
                  %
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </MiniCard>
  )
}
