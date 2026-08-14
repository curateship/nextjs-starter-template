import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  LayersIcon,
  LineChartIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { chartHeightClassName, EmptyChart, LegendDot } from "@/components/shared/dashboard/chart-card"
import {
  DashboardPanels,
  type DashboardBlock,
} from "@/components/shared/dashboard/dashboard-panels"
import { CardHeaderRow, CardTop, EmptyRow, FeedCard } from "@/components/shared/feed-card"
import { ActivityCard } from "@/components/shared/dashboard/activity-card"
import { SampleValue } from "@/components/shared/dashboard/sample-figure"
import { VisitorsCard } from "@/components/shared/dashboard/visitors-card"
import { StatStrip, ChangeBadge, type StatFigure } from "@/components/shared/dashboard/stat-strip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Meter, MeterRow } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { UnderlineTab, UnderlineTabsList } from "@/components/ui/underline-tabs"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  AUTOMATION_RUNS_CAPTION,
  automationRuns,
  automationSuccessRate,
} from "@/lib/dashboard/admin-overview-sample"
import type { AdminOverview, OverviewAutomation } from "@/lib/api/admin-overview"
import {
  isPendingDeletion,
  restoreDeadline,
} from "@/lib/account-deletion"
import { shade } from "@/lib/dashboard/chart-colours"
import {
  findDashboardWidget,
  isDashboardBoardEmpty,
  type DashboardWidgetId,
  type DashboardWidgetSlot,
} from "@/lib/dashboard/dashboard-widgets"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { formatDate } from "@/lib/format/format-time"
import { formatSharePercent } from "@/lib/format/format-number"
import { buildMembershipFigures } from "@/lib/billing/membership-figures"
import { cancellationReasonLabel } from "@/lib/billing/cancellation"
import { percentChange } from "@/lib/format/percent-change"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

/**
 * The admin's front door: what needs doing, what has been happening, and how
 * the app is going, in one screen.
 *
 * Almost everything here is read from the tables the page it links to reads,
 * so a figure and its own page can never disagree. Two cards cannot be: the
 * app records no visitor traffic and has no automation run engine yet, so
 * those figures are stand-ins and say so on the card, in words. Every one of
 * them lives in `lib/dashboard/admin-overview-sample.ts` — nothing else invents a
 * number.
 */

/** How many automations the list shows before it sends you to the full page. */
const AUTOMATIONS_SHOWN = 5

export function AdminOverviewDashboard({
  overview,
}: {
  overview: AdminOverview
}) {
  const runtime = useShellRuntime()
  const layout = runtime.config.dashboardWidgets

  /**
   * A slot's widgets as panel blocks. Each one keeps the share of its column
   * the fixed layout gave it, so the arrangement this page opens with is the
   * one it always had: roughly 55/45 across, then 40/60 down the left and
   * 40/30/30 down the right.
   *
   * `DashboardPanels` handles the rest: it takes the height the top slot
   * leaves, so the page itself never scrolls and the long cards scroll inside
   * instead, and below 1280px it drops the dividers and lets the columns stack.
   */
  const blocksIn = (slot: DashboardWidgetSlot): DashboardBlock[] =>
    layout[slot].flatMap((id) => {
      const widget = findDashboardWidget(id)
      if (!widget) return []

      return [
        {
          id,
          size: widget.size,
          minSize: widget.minSize,
          render: (className: string) => renderWidget(id, overview, className),
        },
      ]
    })

  if (isDashboardBoardEmpty(layout)) {
    return <EmptyBoard />
  }

  const left = blocksIn("left")
  const right = blocksIn("right")

  return (
    <>
      {/* The top slot is a plain stack, not panels: it is above the two columns
          and every card in it keeps its own height, the same way they all do on
          a narrow screen. `shrink-0` because the page is a flex column — the
          columns below take the rest of the height and would otherwise squash
          these, and a card hides what overflows.

          The height cap is what keeps a chart card usable up here. Inside a
          column its chart fills the panel it is given; with no panel and no
          cap, "fill what you are given" turns into the whole window, and one
          card pushes everything else off the screen. 16rem leaves the columns
          below the bulk of the height, which is where most of the reading is.
          A card shorter than that — the figures strip — is untouched by it. */}
      {layout.top.map((id) => (
        <React.Fragment key={id}>
          {renderWidget(id, overview, "shrink-0 max-h-64")}
        </React.Fragment>
      ))}

      {left.length || right.length ? (
        <DashboardPanels page="overview" left={left} right={right} />
      ) : null}
    </>
  )
}

/** Every widget this page can draw. The arrangement decides which, and where. */
function renderWidget(
  id: DashboardWidgetId,
  overview: AdminOverview,
  className: string
) {
  switch (id) {
    case "figures":
      return (
        <StatStrip
          figures={buildOverviewFigures(overview)}
          className={className}
        />
      )
    case "inbox":
      return (
        <ActivityCard
          activity={overview.feeds.notifications.latest}
          className={className}
        />
      )
    case "people":
      return <PeopleCard overview={overview} className={className} />
    case "traffic":
      return <VisitorsCard className={className} />
    case "automations":
      return (
        <AutomationsCard
          automations={overview.automations}
          className={className}
        />
      )
  }
}

/**
 * Taking every widget off is allowed — an admin who wants an empty front door
 * can have one — so this says what happened and where to undo it, rather than
 * leaving the page looking broken.
 */
function EmptyBoard() {
  return (
    <Card className="shrink-0">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <LayoutDashboardIcon className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          There are no widgets on your dashboard.
        </p>
        <Button asChild variant="outline">
          <Link to="/admin/settings/$tab" params={{ tab: "widgets" }}>
            Choose widgets
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// The headline row.

/**
 * The Membership page's four figures, plus this week's feedback — the only
 * other number in the app with an honest week-before to compare against.
 */
function buildOverviewFigures({
  membership,
  feeds,
}: AdminOverview): StatFigure[] {
  return [
    ...buildMembershipFigures(membership),
    {
      key: "feedback",
      to: "/admin/feedback",
      label: "Feedback this week",
      value: feeds.feedback.last7Days.toLocaleString(),
      before: `${feeds.feedback.previous7Days.toLocaleString()} the week before`,
      change: percentChange(
        feeds.feedback.previous7Days,
        feeds.feedback.last7Days
      ),
      changeCaption: "vs last week",
      footer: `${feeds.feedback.noReply.toLocaleString()} with no reply`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Who is in the app: the shape of arrivals over the month, the newest few by
// name, and who sits on which plan. One card with tabs, because all three
// answer the same question at different zoom levels.

const joiningConfig: ChartConfig = {
  current: { label: "This month", color: "var(--primary)" },
  previous: { label: "Last month", color: shade(70) },
}

type PeopleTab = "joining" | "members" | "plans" | "leaving"

const PEOPLE_TABS: {
  value: PeopleTab
  tab: string
  icon: React.ComponentType<{ className?: string }>
  title: string
}[] = [
  { value: "joining", tab: "Joining", icon: LineChartIcon, title: "People joining" },
  { value: "members", tab: "Newest", icon: UsersIcon, title: "Newest members" },
  { value: "plans", tab: "Plans", icon: LayersIcon, title: "Membership" },
  { value: "leaving", tab: "Leaving", icon: LogOutIcon, title: "People leaving" },
]

function PeopleCard({
  overview,
  className,
}: {
  overview: AdminOverview
  className?: string
}) {
  const [tab, setTab] = React.useState<PeopleTab>("joining")
  const { membership } = overview
  const everyone = membership.revenue.totalUsers
  const current = PEOPLE_TABS.find((entry) => entry.value === tab) ?? PEOPLE_TABS[0]

  return (
    <FeedCard className={className}>
      <Tabs
        className="flex min-h-0 flex-1 gap-0"
        value={tab}
        onValueChange={(value) => setTab(value as PeopleTab)}
      >
        <CardHeaderRow
          icon={current.icon}
          title={current.title}
          // Dropped rather than truncating the heading once the tabs and this
          // count no longer both fit — which is most widths in this column.
          metaClassName="hidden 2xl:flex"
          meta={
            tab === "joining"
              ? `${membership.newLastMonth.toLocaleString()} last month`
              : tab === "leaving"
                ? `${overview.scheduledCancellations.length.toLocaleString()} shown`
              : `${everyone.toLocaleString()} ${plural(everyone, "account")} in all`
          }
        >
          {/* `-mb-px` so the line under the chosen tab lands on the card's own
              hairline rather than a pixel above it. */}
          <UnderlineTabsList className="-mb-px">
            {PEOPLE_TABS.map((entry) => (
              <UnderlineTab
                key={entry.value}
                value={entry.value}
                label={entry.tab}
              />
            ))}
          </UnderlineTabsList>
        </CardHeaderRow>

        <TabsContent value="joining" className="flex min-h-0 flex-col">
          <JoiningChart overview={overview} />
        </TabsContent>
        <TabsContent value="members" className="flex min-h-0 flex-col">
          <NewestMembers overview={overview} />
        </TabsContent>
        <TabsContent value="plans" className="flex min-h-0 flex-col">
          <PlanMembership overview={overview} />
        </TabsContent>
        <TabsContent value="leaving" className="flex min-h-0 flex-col">
          <LeavingMembers overview={overview} />
        </TabsContent>
      </Tabs>
    </FeedCard>
  )
}

function LeavingMembers({ overview }: { overview: AdminOverview }) {
  const leaving = overview.scheduledCancellations

  if (!leaving.length) {
    return <EmptyRow>Nobody is scheduled to leave.</EmptyRow>
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead column="main">Person</TableHead>
            <TableHead column="meta">Why</TableHead>
            <TableHead column="meta">Ends</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaving.map((member) => (
            <TableRow key={member.userId}>
              <TableCell column="main">
                <Link
                  to="/admin/users"
                  search={{ open: member.userId }}
                  className="block max-w-64 truncate font-medium hover:underline"
                  title={member.name}
                >
                  {member.name}
                </Link>
                <span
                  className="block max-w-64 truncate text-xs text-muted-foreground"
                  title={member.email}
                >
                  {member.email}
                </span>
              </TableCell>
              <TableCell column="meta">
                <span
                  className="block max-w-56 truncate"
                  title={cancellationReasonLabel(member.reason)}
                >
                  {cancellationReasonLabel(member.reason)}
                </span>
                {member.feedback ? (
                  <span
                    className="block max-w-56 truncate text-xs text-muted-foreground"
                    title={member.feedback}
                  >
                    {member.feedback}
                  </span>
                ) : null}
              </TableCell>
              <TableCell column="meta">{formatDate(member.endsAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

/**
 * The reference's revenue line, drawn from the one daily series the app really
 * has. Nothing records what was being paid last March, but every account
 * carries the day it was created, so this is that — honestly fed.
 */
function JoiningChart({ overview }: { overview: AdminOverview }) {
  const { membership } = overview
  const data = membership.signupsByDay.map((point) => ({
    label: point.day,
    current: point.thisMonth,
    previous: point.lastMonth,
  }))
  const change = percentChange(membership.newLastMonth, membership.newThisMonth)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-mono text-3xl leading-tight font-semibold tracking-tight tabular-nums">
            {membership.newThisMonth.toLocaleString()}
          </p>
          {change ? <ChangeBadge change={change} /> : null}
        </div>
        <div className="hidden items-center gap-4 lg:flex">
          <LegendDot colour="var(--primary)" label="This month" />
          <LegendDot colour={shade(70)} label="Last month" />
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyChart message="Nobody has joined yet." />
      ) : (
        <div className={`${chartHeightClassName} xl:h-auto xl:min-h-[120px] xl:flex-1`}>
          <ChartContainer config={joiningConfig} className="h-full w-full">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                dy={8}
                // A month of days is too many labels to read; show every third.
                interval={2}
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
                isAnimationActive={false}
                stroke="var(--color-previous)"
                strokeWidth={1.5}
                strokeOpacity={0.5}
                fill="var(--color-previous)"
                fillOpacity={0.08}
              />
              <Line
                type="linear"
                dataKey="current"
                isAnimationActive={false}
                stroke="var(--color-current)"
                strokeWidth={1.5}
                strokeLinecap="round"
                dot={{ fill: "var(--color-current)", strokeWidth: 0, r: 2 }}
                activeDot={{ r: 3.5 }}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      )}
    </div>
  )
}

/** Why a row is not simply a new member, in the Users page's own words. */
function accountNote(member: AdminOverview["newestMembers"][number]) {
  if (isPendingDeletion(member) && member.deletedAt) {
    return `Deletes ${formatDate(restoreDeadline(member.deletedAt))}`
  }
  return member.status === "suspended" ? "Suspended" : null
}

/**
 * A plain table rather than `DashboardTable`: that one brings its own card
 * chrome, which inside this card would be a second border around the first.
 */
function NewestMembers({ overview }: { overview: AdminOverview }) {
  const members = overview.newestMembers

  if (!members.length) {
    return <EmptyRow>No accounts yet.</EmptyRow>
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead column="main">Person</TableHead>
              <TableHead column="meta">Plan</TableHead>
              <TableHead column="meta">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell column="main">
                  <span
                    className="block max-w-64 truncate font-medium"
                    title={member.name}
                  >
                    {member.name}
                  </span>
                  {/* The same marks the Users page puts on a row, in the same
                      words. Without them a suspended account, or one already on
                      its way out, reads here as an ordinary new member. */}
                  {accountNote(member) ? (
                    <span className="block text-xs text-destructive">
                      {accountNote(member)}
                    </span>
                  ) : null}
                  <span
                    className="block max-w-64 truncate text-xs text-muted-foreground"
                    title={member.email}
                  >
                    {member.email}
                  </span>
                </TableCell>
                <TableCell column="meta">
                  <Badge variant={member.planIsPaid ? "default" : "secondary"}>
                    {member.planName}
                  </Badge>
                </TableCell>
                <TableCell column="meta">
                  {formatDate(member.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      <Link
        to="/admin/users"
        className={cn(
          "flex items-center justify-center border-t px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/40 sm:px-5",
          focusRingInset
        )}
      >
        View all accounts
      </Link>
    </>
  )
}

// ---------------------------------------------------------------------------
// The "Plans" tab of the people card: who is on which plan.

function PlanMembership({ overview }: { overview: AdminOverview }) {
  const { membership } = overview
  const everyone = membership.revenue.totalUsers
  const plans = membership.planMembership

  return (
    <>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4 sm:px-5 sm:py-5">
        {plans.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No plans set up yet.
          </p>
        ) : (
          plans.map((plan) => {
            const share = formatSharePercent(plan.people, everyone)
            return (
              <MeterRow
                key={plan.planId}
                label={plan.planName}
                value={
                  <>
                    {plan.people.toLocaleString()}{" "}
                    <span className="font-normal text-muted-foreground">
                      {share}
                    </span>
                  </>
                }
                meter={{
                  value: plan.people,
                  max: everyone,
                  label: plan.planName,
                  valueText: `${plan.people.toLocaleString()} of ${everyone.toLocaleString()} people`,
                  // A shade, never the only thing saying which is which — the
                  // plan's own name is on the row above it.
                  tone: plan.isPaid ? "default" : "muted",
                }}
              />
            )
          })
        )}
      </CardContent>
      <CardFooter className="grid grid-cols-3 gap-3 border-t bg-muted/40 p-4 sm:px-5">
        <FooterFigure label="Admins" value={membership.admins} />
        <FooterFigure label="Members" value={membership.members} />
        <FooterFigure label="Suspended" value={membership.suspended} />
      </CardFooter>
    </>
  )
}

function FooterFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-lg leading-tight font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Right column: the automations. Their names and whether each one compiles are
// real; how often they run and how often that works are not recorded anywhere
// yet, so those two columns are stand-ins.

function AutomationsCard({
  automations,
  className,
}: {
  automations: OverviewAutomation[]
  className?: string
}) {
  // What is broken goes first — it is the only thing on this card anybody has
  // to do something about.
  const shown = [...automations]
    .sort((a, b) => {
      if (a.isValid !== b.isValid) return a.isValid ? 1 : -1
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    .slice(0, AUTOMATIONS_SHOWN)

  return (
    <FeedCard className={className}>
      <CardTop
        icon={WorkflowIcon}
        title="Automations"
        meta={`${automations.length} in all`}
        action={
          <Button asChild variant="outline">
            <Link to="/admin/automations">Manage</Link>
          </Button>
        }
      />
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-8 sm:px-5">
          <p className="text-center text-sm text-muted-foreground">
            No automations yet.
          </p>
          <Button asChild variant="outline">
            <Link to="/admin/automations">Build one</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 sm:px-5">
            <span className="text-xs font-medium text-muted-foreground">
              Automation
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              Runs, {AUTOMATION_RUNS_CAPTION}
              <SampleValue className="no-underline">(sample)</SampleValue>
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="divide-y">
              {shown.map((automation) => (
                <AutomationRow key={automation.id} automation={automation} />
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </FeedCard>
  )
}

function AutomationRow({ automation }: { automation: OverviewAutomation }) {
  const runs = automationRuns(automation.id)
  const rate = automationSuccessRate(automation.id)

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 sm:px-5",
        !automation.isValid && "bg-muted/30"
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          automation.isValid
            ? "bg-emerald-500 dark:bg-emerald-400"
            : "bg-amber-500 dark:bg-amber-400"
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <Link
            to="/admin/automations/$automationId"
            params={{ automationId: automation.id }}
            className={cn(
              "min-w-0 truncate rounded-sm text-sm font-medium hover:underline",
              !automation.isValid && "text-muted-foreground"
            )}
            title={automation.name}
          >
            {automation.name}
          </Link>
          <span className="shrink-0 text-xs tabular-nums">
            <SampleValue>
              {runs.value.toLocaleString()} · {rate.value}%
            </SampleValue>
          </span>
        </div>
        <Meter
          size="sm"
          value={rate.value}
          label={`${automation.name}, share of runs that finished (sample figure)`}
          valueText={`${rate.value}% — a stand-in, nothing records this yet`}
          tone={automation.isValid ? "positive" : "warning"}
        />
        {/* The word beside the dot, so the state never rests on a colour. */}
        <p className="truncate text-xs text-muted-foreground">
          {automation.isValid ? "Ready" : "Needs attention"} ·{" "}
          {automation.summary}
        </p>
      </div>
      {!automation.isValid ? (
        <Button asChild variant="outline">
          <Link
            to="/admin/automations/$automationId"
            params={{ automationId: automation.id }}
          >
            Fix
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
