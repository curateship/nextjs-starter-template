import { CircleAlertIcon, ClockIcon, RepeatIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { initialsFor } from "@/lib/crm/inbox-time"
import { formatUtcDate } from "@/lib/format/format-time"
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
      {formatUtcDate(`${dueDate}T00:00:00Z`)}
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
