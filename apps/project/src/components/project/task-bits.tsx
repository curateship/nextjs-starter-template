import {
  CircleAlertIcon,
  ClockIcon,
  HourglassIcon,
  MoonIcon,
  PlayIcon,
  Repeat2Icon,
  RepeatIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { initialsFor } from "@/lib/crm/inbox-time"
import { dayLabel } from "@/lib/project/days"
import {
  PICKED_MANY_DAYS,
  PROJECT_COLOR_DOT,
  TASK_STATUS_LABEL,
  type ProjectColor,
  type TaskStatus,
} from "@/lib/project/rules"
import { isOverdue } from "@/lib/project/dates"
import { cn } from "@/lib/utils"

/** The small pieces every Project screen draws a task or a person with. */

export function PersonAvatar({
  name,
  avatarUrl,
  size = "sm",
  className,
}: {
  name: string
  avatarUrl?: string
  size?: "sm" | "default"
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback>{initialsFor(name, name)}</AvatarFallback>
    </Avatar>
  )
}

export function ProjectDot({
  color,
  className,
}: {
  color: ProjectColor
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", PROJECT_COLOR_DOT[color], className)}
    />
  )
}

/** Never colour alone: the word is always there, and Stuck carries an icon. */
export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge
      variant={status === "stuck" ? "destructive" : status === "done" ? "secondary" : "outline"}
    >
      {status === "stuck" ? <CircleAlertIcon aria-hidden /> : null}
      {TASK_STATUS_LABEL[status]}
    </Badge>
  )
}

export function WaitingBadge() {
  return (
    <Badge variant="outline">
      <ClockIcon aria-hidden />
      Waiting
    </Badge>
  )
}

/** "Oct 14, 2026", or "Overdue · Oct 14, 2026" in the destructive colour. */
export function DueDate({
  dueDate,
  status,
  className,
}: {
  dueDate: string | null
  status: TaskStatus
  className?: string
}) {
  if (!dueDate) return <span className={cn("text-muted-foreground", className)}>No due date</span>
  const overdue = isOverdue(dueDate, status)
  return (
    <span className={cn(overdue ? "text-destructive" : "text-muted-foreground", className)}>
      {overdue ? "Overdue · " : null}
      {dayLabel(dueDate)}
    </span>
  )
}

export function StepsCount({ steps }: { steps: { done: number; total: number } }) {
  if (steps.total === 0) return null
  return (
    <span className="text-muted-foreground">
      {steps.done} of {steps.total} steps done
    </span>
  )
}

/**
 * "Picked on 4 days": a task picked on three or more check-ins and still not
 * Done, so a task that drags shows up without anyone writing a report.
 */
export function PickedDaysBadge({
  pickedDays,
  status,
}: {
  pickedDays: number
  status: TaskStatus
}) {
  if (pickedDays < PICKED_MANY_DAYS || status === "done") return null
  return (
    <Badge variant="outline">
      <RepeatIcon aria-hidden />
      Picked on {pickedDays} days
    </Badge>
  )
}

/** A label on a card or row: its colour as a dot, and always its name. */
export function LabelChip({ label }: { label: { name: string; color: ProjectColor } }) {
  return (
    <Badge variant="outline" className="max-w-40">
      <ProjectDot color={label.color} className="size-2" />
      <span className="truncate">{label.name}</span>
    </Badge>
  )
}

/** "Snoozed until Dec 1", while the day hasn't come. */
export function SnoozedBadge({ until, today }: { until: string | null; today: string }) {
  if (!until || until <= today) return null
  return (
    <Badge variant="outline">
      <MoonIcon aria-hidden />
      Snoozed until {dayLabel(until)}
    </Badge>
  )
}

/** "Waiting on: Get the logo approved", or "Ready to start" once it is Done. */
export function WaitingOnBadge({
  waitingOn,
}: {
  waitingOn: { title: string | null; ready: boolean } | null
}) {
  if (!waitingOn) return null
  if (waitingOn.ready) {
    return (
      <Badge variant="outline">
        <PlayIcon aria-hidden />
        Ready to start
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="max-w-56">
      <HourglassIcon aria-hidden />
      <span className="truncate">
        Waiting on: {waitingOn.title ?? "1 task in another project"}
      </span>
    </Badge>
  )
}

/** A small mark on a task that comes back on its own. */
export function RepeatMark({ repeat }: { repeat: unknown }) {
  if (!repeat) return null
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Repeat2Icon className="size-3" aria-hidden />
      Repeats
    </span>
  )
}
