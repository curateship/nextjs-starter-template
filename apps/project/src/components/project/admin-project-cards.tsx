import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"
import { Area, AreaChart, YAxis } from "recharts"

import { NewTaskWithProjectPicker } from "@/components/project/new-task-header"
import { PersonAvatar } from "@/components/project/task-bits"
import { SlideBar } from "@/components/shared/notes/side-rows"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AdminDashboard, AdminProjectCards } from "@/lib/api/project/admin-dashboard"
import { plural } from "@/lib/format/plural"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { pacedProject, projectDueLine, type PacedProject } from "@/lib/project/admin-project-cards"
import { PROJECT_PACE_LABEL, type ProjectPace } from "@/lib/project/project-pace"
import { cn } from "@/lib/utils"

type Project = AdminDashboard["projects"][number]

/**
 * Each status's colours, from Tyler's drawing of 29 Oct 2026
 * (`workspace/docs/assets/pasted-image-1793297357679510000.png`): red for
 * Behind, amber for Slowing down, green for On track ("change the on track
 * to light green"), on the chip and the bar's track. The block itself is the
 * shell's white tile since 9 Nov 2026.
 */
const PACE_LOOK: Record<ProjectPace, { pill: string; dot: string; track: string }> = {
  behind: {
    pill: "bg-red-500/10 text-red-600 dark:text-red-400",
    dot: "bg-red-500",
    track: "bg-red-500/10",
  },
  slowing: {
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    track: "bg-amber-500/10",
  },
  on_track: {
    pill: "bg-green-500/10 text-green-700 dark:text-green-400",
    dot: "bg-green-600",
    track: "bg-green-500/10",
  },
}

/**
 * A Projects block on the site admin's own page (task "My
 * dashboard/left-panel-blocks", Tyler, 6 Nov 2026: "a new "Projects" block
 * where I can select a project with the same functionality as the pinned
 * card"). It is one project drawn as the Pinned projects card drew each of
 * its projects (task "My dashboard/01 Project cards", 29 Oct 2026): its
 * status, how much is done, its due date, how many are late and stuck, its
 * lead and people, and a small line of what got finished each day for two
 * weeks. Pressing it shows only that project's tasks in My tasks, and
 * pressing it again shows them all. Since 9 Nov 2026 it sits in the shell's
 * block card (task "Shell look/three-panel-shell-look"): the name is the
 * block's heading, the + and arrow are in the heading row
 * (`ProjectBlockButtons`), and while it is picked the shell's small bar
 * slides in before its status.
 */
export function ProjectBlock({
  project,
  extras,
  today,
  picked,
  onPick,
}: {
  project: Project
  extras: AdminProjectCards
  /** The site admin's own today, for days left. */
  today: string
  /** My tasks is filtered to this project. */
  picked: boolean
  onPick: () => void
}) {
  const row = pacedProject(project)
  return (
    // The faces' ring is the tile's white.
    <div className="@container relative [--block:var(--card)]">
      <ProjectSummary row={row} extras={extras} today={today} picked={picked} onPick={onPick} />
    </div>
  )
}

/** "+" for a new task in the project, and the arrow to its page, for the block's heading row. */
export function ProjectBlockButtons({ project }: { project: Pick<Project, "id" | "name"> }) {
  return (
    <>
      {/* New task's own trigger wraps the tooltip's, so both reach the button. */}
      <Tooltip>
        <NewTaskWithProjectPicker align="start" projectId={project.id}>
          {(loading) => (
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`New task in ${project.name}`}
                disabled={loading}
              >
                <PlusIcon className="size-4" />
              </Button>
            </TooltipTrigger>
          )}
        </NewTaskWithProjectPicker>
        <TooltipContent>New task here</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/projects/$projectId" params={{ projectId: project.id }} aria-label={`Open ${project.name}`}>
              <ArrowUpRightIcon className="size-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open project</TooltipContent>
      </Tooltip>
    </>
  )
}

/**
 * The block's tile, one button that filters My tasks to the project: the
 * status, team and stuck count, the bar, the due date, the people and the
 * line of finished tasks. The name is the block's heading.
 */
function ProjectSummary({
  row,
  extras,
  today,
  picked,
  onPick,
}: {
  row: PacedProject<Project>
  extras: AdminProjectCards
  today: string
  picked: boolean
  onPick: () => void
}) {
  const { project, pace, late } = row
  const due = projectDueLine(project.dueDate, today)
  const people = extras.people[project.id]
  const finished = extras.finished[project.id]
  const look = PACE_LOOK[pace]
  const { done, todo, doing, stuck } = project.counts
  const total = done + todo + doing + stuck
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onPick}
      className={cn("grid w-full min-w-0 gap-2.5 rounded-[inherit] p-3 text-left", focusRingInset)}
    >
      <span className="sr-only">{project.name}</span>
      <span className="flex min-w-0 items-center text-xs">
        <SlideBar on={picked} />
        <span className="flex min-w-0 items-center gap-2">
          <PaceChip pace={pace} due={due} />
          <span className="truncate text-muted-foreground">{project.team.name}</span>
        </span>
      </span>
      <span
        role="meter"
        aria-label="Tasks done"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={`${done} of ${total} tasks done`}
        className={cn("block h-1 w-full overflow-hidden rounded-full", look.track)}
      >
        <span className="block h-full rounded-full bg-green-600" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
      </span>
      {/* The counts drop under the faces when the panel is too narrow for both. */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Faces lead={project.lead} people={people} />
        {finished ? <FinishedLine days={finished} /> : null}
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
          {late ? <span className="text-destructive">{late} late</span> : null}
          {stuck ? <span className="text-destructive">{stuck} stuck</span> : null}
          <span className="text-muted-foreground">{total ? `${done}/${total} done` : "No tasks yet"}</span>
        </span>
      </span>
      <span className="sr-only">
        {picked ? "Showing only this project's tasks. Press to show them all." : "Show only this project's tasks."}
      </span>
    </button>
  )
}

/**
 * "● Behind" as a coloured chip. The project's due date is its hover hint
 * (Tyler, 29 Oct 2026: "The due tomorrow can just be a tooltip when hover
 * over the behind chip"), and is read out to a screen reader with it.
 */
function PaceChip({ pace, due }: { pace: ProjectPace; due: ReturnType<typeof projectDueLine> }) {
  const look = PACE_LOOK[pace]
  const chip = (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 font-medium", look.pill)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", look.dot)} />
      {PROJECT_PACE_LABEL[pace]}
      {due ? <span className="sr-only">, {due.text}</span> : null}
    </span>
  )
  if (!due) return chip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>{due.text}</TooltipContent>
    </Tooltip>
  )
}

/** The face ring is the block's own colour, so the faces overlap cleanly on a tinted block. */
const FACE = "-ml-1 shrink-0 ring-2 ring-[var(--block)] first:ml-0"

/**
 * The lead first, drawn dark, then up to four people, then "+3" for the rest,
 * overlapping a little, as Tyler drew it on 29 Oct 2026.
 */
function Faces({
  lead,
  people,
}: {
  lead: Project["lead"]
  people: AdminProjectCards["people"][string] | undefined
}) {
  const more = people ? people.total - people.faces.length : 0
  return (
    <span className="flex shrink-0 items-center">
      {lead ? (
        <PersonAvatar
          name={lead.name}
          avatarUrl={lead.avatarUrl}
          className={cn(FACE, "[&_[data-slot=avatar-fallback]]:bg-foreground [&_[data-slot=avatar-fallback]]:text-background")}
        />
      ) : null}
      {people?.faces.map((person) => (
        <PersonAvatar key={person.id} name={person.name} avatarUrl={person.avatarUrl} className={FACE} />
      ))}
      {more > 0 ? <span className="ml-1.5 text-xs text-muted-foreground">+{more}</span> : null}
      {lead ? <span className="sr-only">Lead: {lead.name}.</span> : null}
      {people ? (
        <span className="sr-only">
          {people.total} {lead ? plural(people.total, "other person", "other people") : plural(people.total, "person", "people")}{" "}
          on it.
        </span>
      ) : null}
    </span>
  )
}

/**
 * Tasks finished each day over the last two weeks, oldest on the left. No
 * axes and no hover: it shows whether the project is moving. Drawn in
 * `currentColor` like the shell's figure sparkline, so dark mode needs nothing.
 */
function FinishedLine({ days }: { days: number[] }) {
  const gradientId = React.useId()
  const total = days.reduce((sum, count) => sum + count, 0)
  const data = days.map((value, index) => ({ index, value }))
  return (
    <span className="shrink-0 text-primary">
      <span className="sr-only">
        {total} {plural(total, "task")} finished in the last two weeks.
      </span>
      <AreaChart aria-hidden width={72} height={22} data={data} margin={{ top: 2, right: 1, bottom: 1, left: 1 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, Math.max(...days)]} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="currentColor"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </span>
  )
}
