import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  ClockIcon,
  HourglassIcon,
  MessageSquareDotIcon,
  MoonIcon,
  PlayIcon,
  Repeat2Icon,
  RepeatIcon,
} from "lucide-react"

import { TypeIconGlyph } from "@/components/project/task-type-icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { initialsFor } from "@/lib/crm/inbox-time"
import { dayLabel } from "@/lib/project/days"
import {
  DUE_MOVED_MANY,
  PICKED_MANY_DAYS,
  PROJECT_COLOR_DOT,
  TASK_STATUS_LABEL,
  type ProjectColor,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"
import { isOverdue } from "@/lib/project/dates"
import type { TaskTypeChip } from "@/lib/project/task-types"
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

/** "3 new": messages in a task's chat, or a project's, that I haven't read. */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <Badge className={className}>
      <MessageSquareDotIcon aria-hidden />
      {count} new
      <span className="sr-only"> {count === 1 ? "message" : "messages"}</span>
    </Badge>
  )
}

/** A Done task its reviewer hasn't confirmed yet. It still counts as Done. */
export function ReviewBadge({ review }: { review: { waiting: boolean } }) {
  if (!review.waiting) return null
  return (
    <Badge variant="outline">
      <ClipboardCheckIcon aria-hidden />
      Waiting for review
    </Badge>
  )
}

/**
 * "6 open · Away until Dec 4" beside a name in a hand-to picker, so nobody
 * hands work to someone on holiday or already swamped. Handing it over is
 * still allowed.
 */
export function RoomNote({ room }: { room: { open: number; awayUntil: string | null } | undefined }) {
  if (!room) return null
  return (
    // Only in the open list: the chosen name in a closed picker stays short.
    <span className="text-muted-foreground in-data-[slot=select-value]:hidden">
      {" · "}
      {room.open} open
      {room.awayUntil ? ` · Away until ${dayLabel(room.awayUntil)}` : ""}
    </span>
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

/** A task's type on a card or row: its icon in its colour, and always its name. */
export function TypeChip({ type }: { type: TaskTypeChip | null }) {
  if (!type) return null
  return (
    <Badge variant="outline" className="max-w-40">
      <TypeIconGlyph icon={type.icon} color={type.color} className="size-3" />
      <span className="truncate">{type.name}</span>
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

/**
 * "Waiting on: Get the logo approved" for one task still open, "Waiting on 2
 * tasks" for more, and "Ready to start" once every one is Done.
 */
export function WaitingOnBadge({
  waitingOn,
}: {
  waitingOn: { tasks: { title: string | null; done: boolean }[]; ready: boolean } | null
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
  const open = waitingOn.tasks.filter((task) => !task.done)
  return (
    <Badge variant="outline" className="max-w-56">
      <HourglassIcon aria-hidden />
      <span className="truncate">
        {open.length === 1
          ? `Waiting on: ${open[0].title ?? "1 task in another project"}`
          : `Waiting on ${open.length} tasks`}
      </span>
    </Badge>
  )
}

/**
 * High gets a mark on cards and rows. Low is drawn faintly instead, so
 * people use it and High keeps meaning something. Normal shows nothing.
 */
export function PriorityMark({ priority }: { priority: TaskPriority }) {
  if (priority === "high") {
    return (
      <Badge variant="outline">
        <ArrowUpIcon aria-hidden />
        High
      </Badge>
    )
  }
  if (priority === "low") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowDownIcon className="size-3" aria-hidden />
        Low
      </span>
    )
  }
  return null
}

/** "Date moved 3 times", beside the date of a task not Done that keeps slipping. */
export function DueMovesMark({ moves, status }: { moves: number; status: TaskStatus }) {
  if (moves < DUE_MOVED_MANY || status === "done") return null
  return (
    <Badge variant="outline">
      <CalendarClockIcon aria-hidden />
      Date moved {moves} times
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
