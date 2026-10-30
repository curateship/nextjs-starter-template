import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { ArrowUpRightIcon, EyeOffIcon, GripVerticalIcon, PlusIcon, TriangleIcon } from "lucide-react"
import { Area, AreaChart, YAxis } from "recharts"

import { NewTaskWithProjectPicker } from "@/components/project/new-task-header"
import { PanelCard } from "@/components/project/panel-card"
import { PersonAvatar, ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  saveAdminHiddenProjects,
  saveAdminProjectOrder,
  type AdminDashboard,
  type AdminProjectCards,
} from "@/lib/api/project/admin-dashboard"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { openTaskCount, projectCardList, projectDueLine, type PacedProject } from "@/lib/project/admin-project-cards"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { PANEL_GAP } from "@/lib/project/panel-gutter"
import { PROJECT_PACE_LABEL, type ProjectPace } from "@/lib/project/project-pace"
import { cn } from "@/lib/utils"

type Project = AdminDashboard["cards"]["projects"][number]

/** Projects shown as blocks before "Show all". */
const BLOCKS = 5

/**
 * Each block's look, from Tyler's drawing of 29 Oct 2026
 * (`workspace/docs/assets/pasted-image-1793297357679510000.png`). Behind is a
 * faint red with a red edge, Slowing down the same in amber, On track the
 * same in green. The block's colour is mixed in rather than see-through,
 * so the ring between the faces can be the same colour.
 */
const PACE_LOOK: Record<ProjectPace, { block: string; pill: string; dot: string; track: string }> = {
  behind: {
    block: "border-red-500/20 [--block:color-mix(in_oklab,var(--color-red-500)_5%,var(--background))]",
    pill: "bg-red-500/10 text-red-600 dark:text-red-400",
    dot: "bg-red-500",
    track: "bg-red-500/10",
  },
  slowing: {
    block: "border-amber-500/25 [--block:color-mix(in_oklab,var(--color-amber-500)_6%,var(--background))]",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    track: "bg-amber-500/10",
  },
  on_track: {
    // Light green, as the others are light red and amber (Tyler, 29 Oct 2026: "change the on track to light green").
    block: "border-green-500/20 [--block:color-mix(in_oklab,var(--color-green-500)_5%,var(--background))]",
    pill: "bg-green-500/10 text-green-700 dark:text-green-400",
    dot: "bg-green-600",
    track: "bg-green-500/10",
  },
}

/**
 * The project My tasks is filtered to: a grey edge and a soft shadow, lifting
 * it off the card (Tyler, 29 Oct 2026: "the black border is too harsh. make it
 * gray and add some background shadow").
 */
const PICKED = "border-muted-foreground/40 shadow-md"

/** A block's buttons show while it is pointed at or holds focus, and always on a screen with no pointer. */
const QUIET =
  "opacity-0 transition-opacity group-hover/block:opacity-100 group-has-[:focus-visible]/block:opacity-100 [@media(hover:none)]:opacity-100"
/** The name makes room for those buttons only while they show, so it isn't cut short the rest of the time. */
const ROOM_FOR_BUTTONS =
  "group-hover/block:pr-28 group-has-[:focus-visible]/block:pr-28 [@media(hover:none)]:pr-28"

/**
 * The Projects card on the site admin's My dashboard (task "My dashboard/01
 * Project cards", Tyler, 29 Oct 2026). It took the place of "Projects running
 * late": every team's open projects as blocks, Behind ones first in red and
 * Slowing down next in amber, each with its status, how much is done, its due
 * date, how many are stuck, its lead and people, and a small line of what
 * got finished each day for two weeks. Pressing a block shows only that
 * project's tasks in My tasks, and pressing it again shows them all. Projects
 * with nothing open sit under the blocks as thin lines. The site admin may
 * hide a project and drag the blocks into their own order; both are theirs
 * alone. Null when there are no projects at all.
 */
export function ProjectsCard({
  projects,
  extras,
  today,
  picked,
  onPick,
}: {
  projects: Project[]
  extras: AdminProjectCards
  /** The site admin's own today, for days left. */
  today: string
  /** The project My tasks is filtered to. */
  picked: string | undefined
  onPick: (projectId: string | undefined) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  // A drag or a hide shows at once and goes back if the save is refused.
  const [hidden, setHidden] = useSyncedDraft(extras.hidden)
  const [order, setOrder] = useSyncedDraft(extras.order)
  const [all, setAll] = React.useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dndId = React.useId()

  if (projects.length === 0) return null
  const list = projectCardList(projects, hidden, order)
  const blocks = all ? list.active : list.active.slice(0, BLOCKS)

  async function save(work: () => Promise<unknown>, undo: () => void) {
    const ok = await run(work)
    if (ok) await router.invalidate()
    else undo()
  }

  function hide(projectId: string, hiding: boolean) {
    const before = hidden
    const next = hiding ? [...hidden, projectId] : hidden.filter((id) => id !== projectId)
    setHidden(next)
    if (hiding && picked === projectId) onPick(undefined)
    void save(
      () => saveAdminHiddenProjects(next),
      () => setHidden(before)
    )
  }

  function drop(event: DragEndEvent) {
    const overId = event.over?.id
    if (overId === undefined || overId === event.active.id) return
    const ids = list.active.map((row) => row.project.id)
    const moved = arrayMove(ids, ids.indexOf(String(event.active.id)), ids.indexOf(String(overId)))
    // The thin lines keep their places after the blocks, for when they get tasks again.
    const next = [...moved, ...list.idle.map((row) => row.project.id)]
    const before = order
    setOrder(next)
    void save(
      () => saveAdminProjectOrder(next),
      () => setOrder(before)
    )
  }

  return (
    <PanelCard
      storageId="project-admin-projects"
      title="Projects"
      after={<span className="font-normal text-muted-foreground/70">{list.active.length + list.idle.length}</span>}
    >
      <div className={cn("grid", PANEL_GAP)}>
        {list.active.length ? (
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}>
            <SortableContext items={blocks.map((row) => row.project.id)} strategy={verticalListSortingStrategy}>
              <ul className={cn("grid", PANEL_GAP)} aria-label="Projects with open tasks">
                {blocks.map((row) => (
                  <ProjectBlock
                    key={row.project.id}
                    row={row}
                    extras={extras}
                    today={today}
                    picked={picked === row.project.id}
                    dragDisabled={busy || list.active.length < 2}
                    onPick={() => onPick(picked === row.project.id ? undefined : row.project.id)}
                    onHide={() => hide(row.project.id, true)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : null}
        {list.active.length > BLOCKS ? (
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${list.active.length}`}
          </Button>
        ) : null}
        {list.idle.length ? (
          <ul className="grid gap-1" aria-label="Projects with nothing open">
            {list.idle.map((row) => (
              <IdleLine
                key={row.project.id}
                row={row}
                extras={extras}
                today={today}
                picked={picked === row.project.id}
                onPick={() => onPick(picked === row.project.id ? undefined : row.project.id)}
                onHide={() => hide(row.project.id, true)}
              />
            ))}
          </ul>
        ) : null}
        {list.hidden.length ? <HiddenProjects projects={list.hidden} onShow={(id) => hide(id, false)} /> : null}
      </div>
    </PanelCard>
  )
}

/** One project's block: what it is, how it's doing, and its own buttons. */
function ProjectBlock({
  row,
  extras,
  today,
  picked,
  dragDisabled,
  onPick,
  onHide,
}: {
  row: PacedProject<Project>
  extras: AdminProjectCards
  today: string
  picked: boolean
  dragDisabled: boolean
  onPick: () => void
  onHide: () => void
}) {
  const { project } = row
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled: dragDisabled,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/block relative rounded-xl border bg-[var(--block)]",
        PACE_LOOK[row.pace].block,
        picked && PICKED,
        isDragging && "z-10 shadow-md"
      )}
    >
      <ProjectSummary row={row} extras={extras} today={today} picked={picked} onPick={onPick} />
      <div className={cn("absolute top-3 right-3 flex items-center", QUIET)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              disabled={dragDisabled}
              aria-label={`Drag ${project.name} to change the order`}
              className={cn(
                "flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-50",
                focusRingInset
              )}
            >
              <GripVerticalIcon className="size-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Drag to change the order</TooltipContent>
        </Tooltip>
        <ProjectButtons project={project} onHide={onHide} />
      </div>
    </li>
  )
}

/** A project with nothing open: one thin line, which opens to the full block. */
function IdleLine({
  row,
  extras,
  today,
  picked,
  onPick,
  onHide,
}: {
  row: PacedProject<Project>
  extras: AdminProjectCards
  today: string
  picked: boolean
  onPick: () => void
  onHide: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const { project } = row
  return (
    <li
      className={cn(
        "group/block relative rounded-xl border bg-[var(--block)] [--block:var(--background)]",
        picked && PICKED
      )}
    >
      {open ? (
        <ProjectSummary row={row} extras={extras} today={today} picked={picked} onPick={onPick} />
      ) : (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className={cn(
            "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-3.5 py-2 text-left text-sm",
            ROOM_FOR_BUTTONS,
            focusRingInset
          )}
        >
          <ProjectDot color={project.color} />
          <span className="truncate text-muted-foreground">{project.name}</span>
          <span className="sr-only">, nothing open. Show it in full.</span>
        </button>
      )}
      <div className={cn("absolute top-1 right-3 flex items-center", open && "top-3", QUIET)}>
        <ProjectButtons project={project} onHide={onHide} />
      </div>
    </li>
  )
}

/**
 * The block's body, one button that filters My tasks to the project: the
 * name, status, team and stuck count, the bar, the due date, the people and
 * the line of finished tasks.
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
      className={cn("grid w-full min-w-0 gap-2.5 rounded-xl p-3.5 text-left", focusRingInset)}
    >
      <span className="mb-0.5 flex min-w-0 items-center gap-2.5">
        <ProjectPicture project={project} />
        <span className="grid min-w-0 flex-1">
          <span className={cn("truncate text-[15px] leading-5 font-semibold", ROOM_FOR_BUTTONS)}>{project.name}</span>
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <PaceChip pace={pace} due={due} />
            <span className="truncate text-muted-foreground">{project.team.name}</span>
          </span>
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

/**
 * The project's own round picture, or its colour as a full dot the same size
 * when it has none or the picture no longer loads (Tyler, 29 Oct 2026:
 * "replace this with the project avatar or if theres no avatar then use the
 * dot but make it full size dot that matches the size of the avatar").
 */
function ProjectPicture({ project }: { project: Project }) {
  const [broken, setBroken] = React.useState<string | null>(null)
  const url = project.avatarUrl && project.avatarUrl !== broken ? project.avatarUrl : null
  if (!url) return <ProjectDot color={project.color} className="size-9" />
  return (
    <img
      src={url}
      alt=""
      className="size-9 shrink-0 rounded-full border object-cover"
      onError={() => setBroken(url)}
    />
  )
}

/** "+" for a new task in the project, Hide, and the arrow to its page. */
function ProjectButtons({ project, onHide }: { project: Project; onHide: () => void }) {
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
                size="icon-xs"
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
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Hide ${project.name} from this card`} onClick={onHide}>
            <EyeOffIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hide from this card</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" asChild>
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

/** "Hidden 2", which opens the hidden projects, each with Show to put it back. */
function HiddenProjects({ projects, onShow }: { projects: Project[]; onShow: (projectId: string) => void }) {
  return (
    <Collapsible className="grid gap-1">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/hidden flex items-center gap-1.5 justify-self-start rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground",
            focusRingInset
          )}
        >
          Hidden
          <span className="text-muted-foreground/70">{projects.length}</span>
          <TriangleIcon
            aria-hidden
            className="size-2 rotate-180 fill-current transition-transform group-data-[state=open]/hidden:rotate-0"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-1">
          {projects.map((project) => (
            <li key={project.id} className="flex min-h-9 min-w-0 items-center gap-3 px-2 text-sm">
              <ProjectDot color={project.color} className="size-2" />
              <span className="min-w-0 flex-1 truncate text-foreground/80">{project.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground/70">{openTaskCount(project.counts)} open</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => onShow(project.id)}>
                Show
              </Button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
