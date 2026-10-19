import type * as React from "react"

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
import { clockLabel, dayLabel } from "@/lib/project/days"
import {
  DUE_MOVED_MANY,
  PICKED_MANY_DAYS,
  PROJECT_COLOR_DOT,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type ProjectColor,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"
import { dueDayOf, isOverdue, localTimeOf } from "@/lib/project/dates"
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

/**
 * A status's own dot, beside its name on the Board's column headings and in
 * the task panel's status pill. Always beside the word, never alone.
 */
const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-amber-500",
  doing: "bg-blue-500",
  done: "bg-green-600",
  stuck: "bg-red-500",
}

export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} />
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
/** "Oct 14", or "Oct 14 by 11:00 AM" with a "Due by" time, read on the reader's own clock. */
export function DueDate({
  dueDate,
  dueAt = null,
  status,
  className,
}: {
  dueDate: string | null
  dueAt?: string | null
  status: TaskStatus
  className?: string
}) {
  if (!dueDate) return <span className={cn("text-muted-foreground", className)}>No due date</span>
  const overdue = isOverdue(dueDate, status, dueAt)
  return (
    <span className={cn(overdue ? "text-destructive" : "text-muted-foreground", className)}>
      {overdue ? "Overdue · " : null}
      {dayLabel(dueDayOf({ dueDate, dueAt })!)}
      {dueAt ? ` by ${clockLabel(localTimeOf(dueAt))}` : null}
    </span>
  )
}

/**
 * The List's Assigned to, Due and Steps cells as chips, like its Status and
 * Priority (Tyler, 19 Oct 2026: "the assigned to, due date and steps should
 * also be chip ui").
 */
export function PersonChip({ person }: { person: { name: string; avatarUrl?: string } | null }) {
  if (!person) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Nobody
      </Badge>
    )
  }
  return (
    // A little taller than a plain chip, so the face fits inside it.
    <Badge variant="outline" className="h-6 max-w-full gap-1.5 pl-0.5">
      <PersonAvatar
        name={person.name}
        avatarUrl={person.avatarUrl}
        size="default"
        className="size-5 [&_[data-slot=avatar-fallback]]:text-[9px]"
      />
      <span className="truncate">{person.name}</span>
    </Badge>
  )
}

export function DueChip({ dueDate, dueAt, status }: { dueDate: string | null; dueAt: string | null; status: TaskStatus }) {
  const overdue = isOverdue(dueDate, status, dueAt)
  return (
    <Badge variant="outline" className={overdue ? "border-destructive/40" : undefined}>
      <DueDate dueDate={dueDate} dueAt={dueAt} status={status} />
    </Badge>
  )
}

export function StepsChip({ steps }: { steps: { done: number; total: number } }) {
  if (steps.total === 0) return null
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {steps.done} of {steps.total}
    </Badge>
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
    // Really faint, so tags never compete with the task's name (Tyler, 19 Oct 2026):
    // no edge, pale words and a half-strength dot.
    <Badge variant="outline" className="max-w-40 border-transparent px-1 font-normal text-muted-foreground/60">
      <ProjectDot color={label.color} className="size-1.5 opacity-50" />
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

/**
 * The List's Priority column: every priority as a chip, Normal included
 * (Tyler, 19 Oct 2026: "normal should be a chip too"). High keeps its arrow
 * and full colour; Normal and Low are muted, Low with its down arrow.
 */
export function PriorityChip({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant="outline" className={priority === "high" ? undefined : "text-muted-foreground"}>
      {priority === "high" ? <ArrowUpIcon aria-hidden /> : priority === "low" ? <ArrowDownIcon aria-hidden /> : null}
      {TASK_PRIORITY_LABEL[priority]}
    </Badge>
  )
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

/** A type's or section's name, or a warning, as a small chip tinted in its colour. */
const TINT: Record<ProjectColor, string> = {
  slate: "bg-muted text-foreground",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  green: "bg-green-600/10 text-green-700 dark:text-green-300",
  teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  pink: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
}

export function TintChip({ color, children }: { color: ProjectColor; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 max-w-40 items-center rounded px-1.5 text-xs", TINT[color])}>
      <span className="truncate">{children}</span>
    </span>
  )
}
