import * as React from "react"
import {
  ActivityIcon,
  BarChart3Icon,
  CalendarRangeIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleStopIcon,
  ClockIcon,
  CornerDownRightIcon,
  ListOrderedIcon,
  MailIcon,
  MailXIcon,
  PauseIcon,
  WorkflowIcon,
} from "lucide-react"

import { AutomationNodeIcon } from "@/components/automations/automation-node-icon"
import { InspectorNote } from "@/components/automations/inspector-card"
import { RecordFrame } from "@/components/crm/record-frame"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { LIVE_FLOW_PERIODS, type LiveFlowPeriod } from "@/components/automations/use-live-flow-report"
import type {
  LiveFlowActivityKind,
  LiveFlowEmailRow,
  LiveFlowReport,
  LiveFlowStep,
} from "@/lib/api/automations/live-flow"
import { automationNodeIcon } from "@/lib/automations/node-registry"
import { waitNode } from "@/lib/automations/nodes/wait"
import { formatClockTime, formatDateTime, formatDuration, formatShortTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

const number = (value: number) => value.toLocaleString("en-US")
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const people = (count: number) => `${number(count)} ${plural(count, "person", "people")}`

/** A time still to come: the clock within 12 hours, the day and clock after that. */
function when(iso: string) {
  return new Date(iso).getTime() - Date.now() < 12 * 3_600_000 ? formatClockTime(iso) : formatDateTime(iso)
}

/** A moment gone: the time alone within the last 12 hours, the date and time before that. */
function pausedWhen(iso: string) {
  return Date.now() - new Date(iso).getTime() < 12 * 3_600_000 ? formatClockTime(iso) : formatDateTime(iso)
}

type StatusTone = "amber" | "sky" | "red" | "muted" | "paused"

/** The status box's colours and mark, per tone, light and dark. */
const STATUS_LOOK: Record<StatusTone, { box: string; icon: React.ReactNode }> = {
  amber: { box: "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200", icon: <ClockIcon /> },
  sky: { box: "bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200", icon: <ActivityIcon /> },
  red: { box: "bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-200", icon: <CircleAlertIcon /> },
  muted: { box: "bg-muted/60 text-muted-foreground", icon: <ClockIcon /> },
  paused: { box: "bg-muted/60 text-foreground", icon: <PauseIcon /> },
}

/**
 * What the flow is doing now, as one sentence whose first part is bold (Tyler,
 * 23 Nov 2026, picked "Status line", then drew it as an amber box: "40 people
 * held at Drip, outside sending hours until 9:00 AM"). Amber while people
 * wait for a time, blue while they move, grey while nobody is in it.
 */
function liveFlowStatus(report: LiveFlowReport): { lead: string; rest: string; tone: StatusTone } {
  if (!report.enabled) return { lead: report.pausedReason ?? "Off", rest: "", tone: report.pausedReason ? "red" : "muted" }
  if (report.paused) {
    const by = report.paused.by ? ` by ${report.paused.by}` : ""
    return {
      lead: "Paused",
      rest: `. ${report.inFlow > 0 ? `${people(report.inFlow)} held where they are` : "Nobody in it yet"}. Paused${by}, ${pausedWhen(report.paused.at)}.`,
      tone: "paused",
    }
  }
  const drip = report.steps.find((step) => step.drip && step.held > 0)
  if (drip?.drip) {
    const next = drip.drip.outsideHoursUntil
      ? `outside sending hours until ${when(drip.drip.outsideHoursUntil)}`
      : drip.nextMoveAt
        ? `next batch ${when(drip.nextMoveAt)}`
        : "next batch soon"
    return { lead: `${people(drip.held)} held at ${drip.name}`, rest: `, ${next}`, tone: "amber" }
  }
  if (report.stats.workingNow > 0) return { lead: people(report.stats.workingNow), rest: " moving through the steps now", tone: "sky" }
  if (report.stats.waiting > 0) return { lead: people(report.stats.waiting), rest: " waiting for an approval", tone: "amber" }
  const sleeping = report.steps.find((step) => step.held > 0 && step.nextMoveAt)
  if (sleeping?.nextMoveAt) return { lead: `${people(report.inFlow)} in it`, rest: `, the next moves on ${when(sleeping.nextMoveAt)}`, tone: "amber" }
  if (report.inFlow > 0) return { lead: `${people(report.inFlow)} in it`, rest: "", tone: "sky" }
  const toGo = report.steps[0]?.segment?.stillToGo
  if (toGo) return { lead: `${people(toGo)} still to let in`, rest: " from the segment", tone: "sky" }
  return { lead: "Live", rest: ", waiting for somebody to start", tone: "muted" }
}

/** The status sentence in its coloured box. */
function StatusBox({ report }: { report: LiveFlowReport }) {
  const status = liveFlowStatus(report)
  const look = STATUS_LOOK[status.tone]
  return (
    <p className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm leading-snug", look.box)}>
      <span aria-hidden className="mt-0.5 flex shrink-0 [&_svg]:size-4">{look.icon}</span>
      <span className="min-w-0">
        <span className="font-semibold">{status.lead}</span>
        {status.rest}
      </span>
    </p>
  )
}

type BarTone = "blue" | "amber" | "grey" | "red"

/** A bar row's fill, faint track, and count colour. A row at nothing is grey whatever its colour. */
const BAR_LOOK: Record<BarTone, { fill: string; track: string; count: string }> = {
  blue: { fill: "bg-blue-500", track: "bg-blue-100 dark:bg-blue-950", count: "text-blue-700 dark:text-blue-300" },
  amber: { fill: "bg-amber-500", track: "bg-amber-100 dark:bg-amber-950", count: "text-amber-700 dark:text-amber-300" },
  grey: { fill: "bg-muted-foreground", track: "bg-muted", count: "text-foreground" },
  red: { fill: "bg-red-500", track: "bg-red-100 dark:bg-red-950", count: "text-red-700 dark:text-red-300" },
}

/**
 * A label, a bar in its own colour on a faint track of the same colour, and
 * the count (Tyler, 23 Nov 2026: "add some colors to the statistic card").
 * A row with nobody in it greys its label and count.
 */
function BarRows({ rows, max }: { rows: { label: string; count: number; tone: BarTone }[]; max: number }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3">
      {rows.map((row) => {
        const look = BAR_LOOK[row.tone]
        return (
          <React.Fragment key={row.label}>
            <dt className={cn("text-sm", row.count ? "text-foreground" : "text-muted-foreground")}>{row.label}</dt>
            <div
              role="meter"
              aria-label={row.label}
              aria-valuenow={row.count}
              aria-valuemin={0}
              aria-valuemax={max}
              className={cn("h-1.5 overflow-hidden rounded-full", look.track)}
            >
              <div className={cn("h-full rounded-full", look.fill)} style={{ width: `${max ? Math.min(100, (row.count / max) * 100) : 0}%` }} />
            </div>
            <dd className={cn("text-right text-sm tabular-nums", row.count ? cn("font-semibold", look.count) : "text-muted-foreground")}>
              {number(row.count)}
            </dd>
          </React.Fragment>
        )
      })}
    </dl>
  )
}

/** Plain label and value lines. */
function Facts({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-medium tabular-nums">{row.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

/** Runs in blue and Completed in green, the second with a bar of the first. */
function Tiles({
  first,
  second,
}: {
  first: { label: string; value: number; note: string }
  second: { label: string; value: number; of: number }
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="grid content-start gap-0.5 rounded-lg bg-blue-50 p-3 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200">
        <span className="text-xs text-blue-700 dark:text-blue-300">{first.label}</span>
        <span className="text-2xl font-semibold tabular-nums">{number(first.value)}</span>
        <span className="text-xs text-blue-700 dark:text-blue-300">{first.note}</span>
      </div>
      <div className="grid content-start gap-0.5 rounded-lg bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
        <span className="text-xs text-emerald-700 dark:text-emerald-300">{second.label}</span>
        <span className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums">{number(second.value)}</span>
          <span className="text-xs tabular-nums text-emerald-700 dark:text-emerald-300">/ {number(second.of)}</span>
        </span>
        <div
          role="meter"
          aria-label={second.label}
          aria-valuenow={second.value}
          aria-valuemin={0}
          aria-valuemax={second.of}
          aria-valuetext={`${second.value} of ${second.of}`}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900"
        >
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${second.of ? Math.min(100, (second.value / second.of) * 100) : 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/** Which period the totals cover, from the Statistics card's heading. */
function PeriodMenu({
  period,
  onPeriodChange,
  onOpenChange,
}: {
  period: LiveFlowPeriod
  onPeriodChange: (period: LiveFlowPeriod) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Which period the totals cover" className="text-muted-foreground">
          <CalendarRangeIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Count totals from</DropdownMenuLabel>
        {LIVE_FLOW_PERIODS.map((choice) => (
          <DropdownMenuItem key={choice.value} onSelect={() => onPeriodChange(choice.value)}>
            <span className="min-w-0 flex-1">{choice.label}</span>
            <CheckIcon className={choice.value === period ? "size-4" : "size-4 opacity-0"} aria-hidden />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The Statistics card: what the flow is doing now in one sentence, then every
 * run and how they stand. The sentence sits here rather than under the
 * flow's name in the header, where the panel's narrowest width cut it to a
 * few letters. The period, from the card's heading, narrows every card's
 * totals.
 */
function StatisticsCard({
  report,
  period,
  onPeriodChange,
}: {
  report: LiveFlowReport
  period: LiveFlowPeriod
  onPeriodChange: (period: LiveFlowPeriod) => void
}) {
  const { stats } = report
  const [menuOpen, setMenuOpen] = React.useState(false)
  return (
    <PanelCard
      icon={<BarChart3Icon />}
      storageId="automation-run-stats"
      title="Statistics"
      meta={period === "all" ? undefined : LIVE_FLOW_PERIODS.find((choice) => choice.value === period)?.label}
      action={<PeriodMenu period={period} onPeriodChange={onPeriodChange} onOpenChange={setMenuOpen} />}
      actionOpen={menuOpen}
    >
      <div className="grid gap-4">
        <StatusBox report={report} />
        <Tiles
          first={{ label: "Runs", value: stats.total, note: "in total" }}
          second={{ label: "Completed", value: stats.completed, of: stats.total }}
        />
        {/* "Held" is somebody asleep at a Drip or Wait until a time still to
            come; "Working now" is due now (Tyler, 23 Nov 2026, picked "Split
            Running"). The bars are out of everyone in the flow now. */}
        <BarRows
          max={Math.max(stats.total, stats.workingNow + stats.held + stats.waiting)}
          rows={[
            { label: "Working now", count: stats.workingNow, tone: "blue" },
            { label: "Held", count: stats.held, tone: "amber" },
            { label: "Waiting", count: stats.waiting, tone: "grey" },
            { label: "Failed", count: stats.failed, tone: "red" },
            { label: "Stopped", count: stats.stopped, tone: "grey" },
          ]}
        />
        {stats.typicalSeconds !== null ? (
          <Facts rows={[{ label: "Typical time through", value: formatDuration(stats.typicalSeconds * 1000) }]} />
        ) : null}
      </div>
    </PanelCard>
  )
}

type Tone = "amber" | "red" | "green" | "muted"

/** A tile's top edge, fill, words and dot, per colour, light and dark. */
const TILE_TONES: Record<Tone, { edge: string; fill: string; text: string; dot: string }> = {
  amber: {
    edge: "border-t-amber-500",
    fill: "bg-amber-50 dark:bg-amber-950/60",
    text: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  red: {
    edge: "border-t-red-500",
    fill: "bg-red-50 dark:bg-red-950/60",
    text: "text-red-800 dark:text-red-300",
    dot: "bg-red-500",
  },
  muted: {
    edge: "border-t-muted-foreground/25",
    fill: "bg-muted/60",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
  green: {
    edge: "border-t-emerald-500",
    fill: "bg-emerald-50 dark:bg-emerald-950/60",
    text: "text-emerald-800 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
}

/**
 * Three coloured tiles straight under a card's heading, edge to edge, drawn
 * to Tyler's Drip design of 23 Nov 2026: a coloured top edge, the count, and
 * a dot with the label. Side by side once the card is 20rem wide; in the
 * narrowest side panel each tile is a row with its count at the right, so a
 * label like "Waiting here" is never cut. The caller pulls it up to the
 * heading.
 */
function ColourTiles({ tiles }: { tiles: { label: string; count: number; tone: Tone }[] }) {
  return (
    <div className="-mx-4 @container">
      <div className="grid grid-cols-1 @xs:grid-cols-3">
        {tiles.map((tile) => {
          const tone = TILE_TONES[tile.tone]
          return (
            <div
              key={tile.label}
              className={cn(
                "flex min-w-0 items-center justify-between gap-2 border-t-2 px-4 py-2.5 @xs:grid @xs:justify-start @xs:gap-1 @xs:py-3",
                tone.edge,
                tone.fill,
                tone.text
              )}
            >
              <span className="order-2 text-lg font-semibold tabular-nums @xs:order-none @xs:text-2xl">{number(tile.count)}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
                <span className="truncate">{tile.label}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Each email of a sequence, or one Send email step, with what became of it
 * (Tyler, 23 Nov 2026: "email 1: 800 sent, 20 opened, 5 clicked. 400
 * waiting"), drawn as Activity's lines are: a numbered mark, the subject, its
 * sent, opened and clicked under it, and who waits for it next at the right.
 */
function EmailRows({ rows, showWaiting }: { rows: (Omit<LiveFlowEmailRow, "waiting"> & { waiting?: number })[]; showWaiting: boolean }) {
  return (
    <ol className="grid gap-4">
      {rows.map((row) => (
        <li key={row.nodeId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-50 text-xs font-semibold text-sky-700 tabular-nums dark:bg-sky-950 dark:text-sky-300"
          >
            {row.number}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="line-clamp-2 text-sm leading-snug">
              <span className="sr-only">Email {row.number}: </span>
              {row.subject || "No subject"}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {row.sent
                ? `${number(row.sent)} sent · ${number(row.opened)} opened · ${number(row.clicked)} clicked`
                : "Not sent yet"}
            </span>
          </span>
          {showWaiting ? (
            <span className="grid justify-items-end">
              <span className={cn("text-sm font-semibold tabular-nums", row.waiting ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                {number(row.waiting ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">waiting</span>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

/**
 * People who left the list after this flow emailed them, as one line of
 * dots (Tyler, 23 Nov 2026: "remove the dropped out tab and combine it with
 * the emails tab"). A count of nothing is grey. They stay in the flow, and
 * every later email step sends them nothing.
 */
function DroppedOutLine({ report }: { report: LiveFlowReport }) {
  const { droppedOut } = report
  const counts = [
    { label: "Unsubscribed", count: droppedOut.unsubscribed, dot: "bg-muted-foreground" },
    { label: "Bounced", count: droppedOut.bounced, dot: "bg-amber-500" },
    { label: "Spam", count: droppedOut.complained, dot: "bg-red-500" },
  ]
  return (
    <ul aria-label="Dropped out" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {counts.map((item) => (
        <li key={item.label} className={cn("flex items-center gap-1.5", !item.count && "text-muted-foreground/70")}>
          <span aria-hidden className={cn("size-1.5 rounded-full", item.count ? item.dot : "bg-muted-foreground/25")} />
          <span className={cn("tabular-nums", item.count && "font-semibold")}>{number(item.count)}</span>
          <span className={item.count ? "text-muted-foreground" : undefined}>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A Send sequence card's emails, its Emails tab when it holds the tabs, drawn
 * to Tyler's design of 23 Nov 2026: how many of everyone finished and how
 * many wait, over a bar (finished in green, waiting in amber), who dropped
 * out, then a line per email. Everyone is those this step started and those
 * in the flow still before the step, held at a Drip say.
 */
function SequenceEmails({ step, report, withDroppedOut }: { step: LiveFlowStep; report: LiveFlowReport; withDroppedOut: boolean }) {
  const sequence = step.sequence!
  if (sequence.missing) {
    return <InspectorNote>This sequence no longer exists. Pick another in the Send sequence step.</InspectorNote>
  }
  const everyone = sequence.people + sequence.beforeStep
  const waiting = sequence.emails.reduce((sum, email) => sum + email.waiting, 0)
  const share = (count: number) => `${everyone ? Math.min(100, (count / everyone) * 100) : 0}%`
  return (
    // Room between who dropped out and the first email (Tyler, 23 Nov 2026:
    // "add some spacing here").
    <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className="text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{number(sequence.finished)}</span> of {people(everyone)} finished
          </span>
          <span className="text-amber-700 tabular-nums dark:text-amber-300">{number(waiting)} waiting</span>
        </div>
        <div
          role="img"
          aria-label={`${sequence.finished} of ${everyone} finished, ${waiting} waiting`}
          className="flex h-2 overflow-hidden rounded-full bg-muted"
        >
          <span className="bg-emerald-500" style={{ width: share(sequence.finished) }} />
          <span className="bg-amber-100 dark:bg-amber-900/70" style={{ width: share(waiting) }} />
        </div>
        {/* Flow-wide, so on one card only when a flow has two Send sequence steps. */}
        {withDroppedOut ? <DroppedOutLine report={report} /> : null}
      </div>
      {sequence.emails.length ? (
        <EmailRows rows={sequence.emails} showWaiting />
      ) : (
        <InspectorNote>This sequence has no emails yet.</InspectorNote>
      )}
      <LastFailure step={step} />
    </div>
  )
}

/**
 * The Segment card, drawn to Tyler's design of 23 Nov 2026: everyone in the
 * flow as one big number over a bar, a coloured square per count (grey while
 * it is nothing), then the last 7 days under a line as a box a day, blue with
 * its count on a day somebody was let in.
 */
function SegmentDetails({ segment, inFlow }: { segment: NonNullable<LiveFlowStep["segment"]>; inFlow: number }) {
  const rows: { label: string; count: number | null; colour: string; inBar: boolean }[] = [
    { label: "In the flow now", count: inFlow, colour: "bg-blue-500", inBar: true },
    { label: "Still to let in", count: segment.stillToGo, colour: "bg-amber-500", inBar: true },
    { label: "Cannot be emailed", count: segment.cannotBeEmailed, colour: "bg-red-500", inBar: true },
    // Part of those in the flow, so it has no stretch of the bar of its own.
    { label: "New since Run", count: segment.newSinceRun, colour: "bg-emerald-500", inBar: false },
  ]
  const shown = rows.filter((row): row is typeof row & { count: number } => row.count !== null)
  const barTotal = shown.filter((row) => row.inBar).reduce((sum, row) => sum + row.count, 0)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid gap-3">
        <p className="flex items-baseline gap-2">
          <span className="text-4xl leading-none font-semibold tabular-nums">{number(inFlow)}</span>
          <span className="text-sm text-muted-foreground">in the flow now</span>
        </p>
        <div
          role="img"
          aria-label={shown.filter((row) => row.inBar).map((row) => `${row.label}: ${number(row.count)}`).join(", ")}
          className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        >
          {barTotal
            ? shown
                .filter((row) => row.inBar && row.count > 0)
                .map((row) => <span key={row.label} className={row.colour} style={{ width: `${(row.count / barTotal) * 100}%` }} />)
            : null}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 text-sm">
        {shown.map((row) => (
          <React.Fragment key={row.label}>
            <span aria-hidden className={cn("size-2.5 rounded-[3px]", row.count ? row.colour : "bg-muted-foreground/20")} />
            <dt className={cn("truncate", !row.count && "text-muted-foreground")}>{row.label}</dt>
            <dd className={cn("text-right tabular-nums", row.count ? "font-medium" : "text-muted-foreground")}>{number(row.count)}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="-mx-4 grid gap-2 border-t px-4 pt-3">
        <span className="text-xs text-muted-foreground">Let in, last 7 days</span>
        <ol className="grid grid-cols-7 gap-1">
          {segment.perDay.map((day) => {
            const date = new Date(`${day.day}T00:00:00Z`)
            const weekday = date.toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" })
            const long = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
            return (
              <li key={day.day} className="grid min-w-0 justify-items-stretch gap-1 text-center">
                <span
                  role="img"
                  aria-label={`${long}: ${people(day.letIn)} let in`}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-md text-xs font-medium tabular-nums",
                    day.letIn ? "bg-blue-500 text-white" : "bg-muted"
                  )}
                >
                  {/* "1.2K" past a thousand, so a day's box never runs out of room. */}
                  {day.letIn ? compact.format(day.letIn) : null}
                </span>
                <span aria-hidden className="text-[10px] text-muted-foreground">{weekday}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/** The newest error a step hit, in its own words, while any run has failed there. */
function LastFailure({ step }: { step: LiveFlowStep }) {
  if (!step.failed || !step.lastError) return null
  return <InspectorNote className="text-destructive">Last failure: {step.lastError}</InspectorNote>
}

/** Whether a moment is still ahead, read from the clock as the panel draws. */
const stillToCome = (iso: string) => new Date(iso).getTime() > Date.now()

/** "1.25%", with no trailing zeros. */
const percent = (count: number, of: number) => `${of ? Number(((count / of) * 100).toFixed(2)) : 0}%`

/** A Drip card's section under a line that runs to the card's edges. */
function DripSection({ label, aside, children }: { label?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="-mx-4 grid gap-3 border-t px-4 pt-4">
      {label ? (
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <h3 className="text-muted-foreground">{label}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/**
 * "Outside hours" in the Drip card's heading while its sending hours are shut
 * and people wait. Never "Paused", which is what the flow says when somebody
 * pressed Pause.
 */
function DripBadge({ step }: { step: LiveFlowStep }) {
  if (!step.drip?.outsideHoursUntil || step.held === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
      Outside hours
    </span>
  )
}

/**
 * The Drip card, drawn to Tyler's design of 23 Nov 2026: Waiting here, Passed
 * and Failed as coloured tiles under the heading, then the next batch, the
 * pace as three boxes, the bounces against the limit, and the last batches,
 * each under a line.
 */
function DripDetails({ step }: { step: LiveFlowStep }) {
  const drip = step.drip!
  const { bounce, pace } = drip
  const rate = bounce.sent ? (bounce.bounced / bounce.sent) * 100 : 0
  return (
    // Up by the body's own top space (Settings → Styling → Panel cards), so
    // the tiles' coloured edges meet the heading with no strip between.
    <div className="-mt-[var(--shell-panel-card-tile-top,0px)] grid grid-cols-[minmax(0,1fr)] gap-4">
      <ColourTiles
        tiles={[
          { label: "Waiting here", count: step.held, tone: "amber" },
          { label: "Passed", count: step.passed, tone: "green" },
          { label: "Failed", count: step.failed, tone: step.failed ? "red" : "muted" },
        ]}
      />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
          <ClockIcon className="size-4" />
        </span>
        {step.held > 0 && step.nextMoveAt ? (
          <span className="grid min-w-0 gap-0.5">
            <span className="text-xs text-muted-foreground">Next batch</span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold tabular-nums">{when(step.nextMoveAt)}</span>
              <span className="text-sm text-muted-foreground">{number(step.held)} held now</span>
            </span>
            {drip.outsideHoursUntil ? (
              <span className="text-xs text-muted-foreground">Outside sending hours, resumes {when(drip.outsideHoursUntil)}.</span>
            ) : null}
          </span>
        ) : (
          <span className="grid min-w-0 gap-0.5">
            <span className="text-xs text-muted-foreground">Next batch</span>
            <span className="text-sm">Nobody is waiting for one. The next person goes at once.</span>
          </span>
        )}
      </div>
      <DripSection label="Schedule">
        <div className="@container">
          <div className="grid grid-cols-1 gap-2 @xs:grid-cols-3">
            {[
              { figure: pace.size, words: "people at a time" },
              { figure: pace.gap, words: "apart" },
              { figure: pace.hours, words: pace.hoursNote },
            ].map((box) => (
              <div key={box.words} className="grid min-w-0 gap-0.5 rounded-lg bg-muted/60 px-3 py-2.5">
                <span className="truncate text-sm font-semibold tabular-nums">{box.figure}</span>
                <span className="truncate text-xs text-muted-foreground">{box.words}</span>
              </div>
            ))}
          </div>
        </div>
      </DripSection>
      <DripSection
        label="Bounces"
        aside={
          <span className="text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{number(bounce.bounced)}</span> of {number(bounce.sent)} · {percent(bounce.bounced, bounce.sent)}
          </span>
        }
      >
        <div className="grid gap-1.5">
          {/* Full at the limit, where the red mark is: 1.25 in 100 against a
              limit of 5 is a quarter of the way. */}
          <div
            role="meter"
            aria-label="Bounces against the limit"
            aria-valuenow={Number(rate.toFixed(2))}
            aria-valuemin={0}
            aria-valuemax={bounce.limitPercent}
            aria-valuetext={`${bounce.bounced} of ${bounce.sent} bounced, the flow pauses at ${bounce.limitPercent} in 100`}
            className="relative h-2 rounded-full bg-muted"
          >
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", rate >= bounce.limitPercent ? "bg-red-500" : "bg-amber-500")}
              style={{ width: `${Math.min(100, (rate / bounce.limitPercent) * 100)}%` }}
            />
            <span aria-hidden className="absolute -top-1 right-0 h-4 w-0.5 rounded-full bg-red-500" />
          </div>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">0%</span>
            <span className={cn("text-right", bounce.sent < bounce.minimum ? "text-muted-foreground" : "text-red-700 dark:text-red-400")}>
              {bounce.sent < bounce.minimum
                ? `The flow pauses at ${bounce.limitPercent} in 100 bounced, once ${bounce.minimum} people have been emailed.`
                : `The flow pauses at ${bounce.limitPercent} in 100 bounced.`}
            </span>
          </div>
        </div>
      </DripSection>
      {drip.batches.length ? (
        <DripSection label="Last batches">
          <ol className="grid gap-2.5 text-sm">
            {drip.batches.map((batch) => (
              <li key={batch.releaseAt} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                {/* Blue for a batch still to go, grey for one gone. */}
                <span aria-hidden className={cn("size-2 rounded-full", stillToCome(batch.releaseAt) ? "bg-blue-500" : "bg-muted-foreground/30")} />
                <span className="truncate">{formatDateTime(batch.releaseAt)}</span>
                <span className="font-semibold tabular-nums">{people(batch.size)}</span>
              </li>
            ))}
          </ol>
        </DripSection>
      ) : null}
      <LastFailure step={step} />
    </div>
  )
}

/** What the step's own kind adds to its card. */
function StepDetails({ step, report }: { step: LiveFlowStep; report: LiveFlowReport }) {
  if (step.segment) return <SegmentDetails segment={step.segment} inFlow={report.inFlow} />
  if (step.email) {
    return <EmailRows rows={[{ nodeId: step.nodeId, number: 1, subject: step.name, ...step.email }]} showWaiting={false} />
  }
  return null
}

/** What one step's card says: who is on it, who passed and failed, then its own kind's numbers. */
function StepBody({ step, report }: { step: LiveFlowStep; report: LiveFlowReport }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {step.segment ? null : (
        <Facts
          rows={[
            { label: step.kind === waitNode.kind ? "Waiting here" : "On it now", value: number(step.onNow) },
            ...(step.kind === waitNode.kind && step.nextMoveAt ? [{ label: "Next moves on", value: when(step.nextMoveAt) }] : []),
            { label: "Passed", value: number(step.passed) },
            { label: "Failed", value: number(step.failed) },
          ]}
        />
      )}
      <StepDetails step={step} report={report} />
      <LastFailure step={step} />
    </div>
  )
}

/**
 * Tabs under a card's heading, drawn as Project's Daily habits block draws
 * Today and History (Tyler, 23 Nov 2026: "Utilize tabs so we can consolidate
 * the send sequence into one card like this"): the shell's panel header with
 * `DashboardTabs` in it, edge to edge across the card's white body, so they
 * follow Settings → Styling → Dashboard tabs.
 */
function CardTabs({ tabs }: { tabs: { value: string; label: string; content: React.ReactNode }[] }) {
  const [shown, setShown] = React.useState(tabs[0].value)
  const current = tabs.find((tab) => tab.value === shown) ?? tabs[0]
  return (
    // One column that never grows past the card, so in the narrowest side
    // panel the tab row scrolls sideways instead of pushing the card wider.
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <DashboardCardHeader className="-mx-4 -mt-[var(--shell-panel-card-tile-top,0px)] px-4">
        <DashboardTabs value={current.value} onValueChange={setShown} tabs={tabs.map(({ value, label }) => ({ value, label }))} />
      </DashboardCardHeader>
      {current.content}
    </div>
  )
}

/** The colour and mark of each kind of activity line. */
const ACTIVITY_LOOK: Record<LiveFlowActivityKind, { icon: React.ReactNode; tone: string }> = {
  letIn: { icon: <CornerDownRightIcon />, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  movedOn: { icon: <CornerDownRightIcon />, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  waiting: { icon: <ClockIcon />, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  sent: { icon: <MailIcon />, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  started: { icon: <ListOrderedIcon />, tone: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  notSent: { icon: <MailXIcon />, tone: "bg-muted text-muted-foreground" },
  stopped: { icon: <CircleStopIcon />, tone: "bg-muted text-muted-foreground" },
  passed: { icon: <CheckIcon />, tone: "bg-muted text-muted-foreground" },
  failed: { icon: <CircleAlertIcon />, tone: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
}

/** "50m ago" within the day, then "Yesterday" and the date. */
function ago(iso: string) {
  const short = formatShortTimeAgo(iso)
  return /^\d+[smhd]/.test(short) ? `${short} ago` : short
}

/**
 * The last things the flow and its sequences did, drawn to Tyler's design of
 * 23 Nov 2026: a coloured mark for what happened, the person's name in bold
 * and what happened to them, their address under it, and how long ago.
 */
function ActivityList({ report }: { report: LiveFlowReport }) {
  if (!report.recent.length) {
    return <p className="text-sm text-muted-foreground">Nothing yet. Each step shows here as somebody passes it.</p>
  }
  return (
    <ol className="grid gap-4">
      {report.recent.map((item) => {
        const look = ACTIVITY_LOOK[item.kind]
        return (
          <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5", look.tone)}>
              {look.icon}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-sm leading-snug">
                <span className="font-semibold">{item.name ?? "A run started by hand"}</span>{" "}
                <span className="text-muted-foreground">
                  {item.action}
                  {item.until ? ` ${formatDateTime(item.until)}` : ""}
                </span>
              </span>
              {item.email ? <span className="truncate text-xs text-muted-foreground">{item.email}</span> : null}
            </span>
            <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{ago(item.at)}</span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * A step's card. The flow's last Send sequence card holds two tabs (Tyler,
 * 23 Nov 2026: "consolidate the send sequence into one card", then "remove
 * the dropped out tab and combine it with the emails tab"): Emails, its own
 * numbers and who dropped out; and Activity, the flow's last ten things.
 */
function StepCard({
  step,
  report,
  focused,
  withActivity,
}: {
  step: LiveFlowStep
  report: LiveFlowReport
  focused: boolean
  withActivity: boolean
}) {
  const icon = automationNodeIcon({ id: step.nodeId, kind: step.kind, x: 0, y: 0, settings: {} })
  return (
    <PanelCard
      id={`live-step-${step.nodeId}`}
      icon={<AutomationNodeIcon icon={icon} />}
      storageId={`automation-live-${step.kind}`}
      title={step.name}
      badge={<DripBadge step={step} />}
      openWhen={focused}
      className="scroll-mt-3"
    >
      {withActivity ? (
        <CardTabs
          tabs={[
            { value: "emails", label: "Emails", content: <SequenceEmails step={step} report={report} withDroppedOut /> },
            { value: "activity", label: "Activity", content: <ActivityList report={report} /> },
          ]}
        />
      ) : step.sequence ? (
        <SequenceEmails step={step} report={report} withDroppedOut={false} />
      ) : step.drip ? (
        <DripDetails step={step} />
      ) : (
        <StepBody step={step} report={report} />
      )}
    </PanelCard>
  )
}

/** Activity, with who dropped out on top, for a flow with no Send sequence step to hold them. */
function ActivityCard({ report }: { report: LiveFlowReport }) {
  return (
    <PanelCard icon={<ActivityIcon />} storageId="automation-live-recent" title="Activity">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <DroppedOutLine report={report} />
        <ActivityList report={report} />
      </div>
    </PanelCard>
  )
}

/**
 * A live flow's right panel (Tyler, 23 Nov 2026: "Below the statistic card,
 * there should be cards for each of the module that shows information
 * pertaining that node"): Statistics, one card per step in the order the
 * steps run. The last Send sequence card has Emails and Activity tabs; a
 * flow without one ends with an Activity card. The period, picked from the
 * Statistics card's heading, narrows the totals, never the numbers about now.
 * A step pressed on the canvas scrolls to its card and opens it.
 */
export function LiveFlowPanel({
  name,
  report,
  error,
  period,
  onPeriodChange,
  focusNodeId,
}: {
  name: string
  report: LiveFlowReport | null
  error: string | null
  period: LiveFlowPeriod
  onPeriodChange: (period: LiveFlowPeriod) => void
  focusNodeId: string | null
}) {
  React.useEffect(() => {
    if (!focusNodeId || !report) return
    document.getElementById(`live-step-${focusNodeId}`)?.scrollIntoView({ block: "start", behavior: "smooth" })
    // Only when a step is pressed, not each time the numbers are read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId, Boolean(report)])

  // The last Send sequence card holds the Emails and Activity tabs and who dropped out.
  const activityStep = report?.steps.filter((step) => step.sequence).at(-1)?.nodeId ?? null

  return (
    <RecordFrame
      avatar={<WorkflowIcon aria-hidden />}
      title={name}
      hideLabel="Hide the statistics"
      body={
        report ? (
          <>
            <StatisticsCard report={report} period={period} onPeriodChange={onPeriodChange} />
            {report.steps.map((step) => (
              <StepCard
                key={step.nodeId}
                step={step}
                report={report}
                focused={step.nodeId === focusNodeId}
                withActivity={step.nodeId === activityStep}
              />
            ))}
            {activityStep ? null : <ActivityCard report={report} />}
          </>
        ) : error ? (
          <ErrorRow message={error} />
        ) : (
          <LoadingRow label="Reading what the flow is doing…" className="py-4 text-xs" />
        )
      }
    />
  )
}
