import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeftIcon,
  BedIcon,
  CopyIcon,
  EllipsisIcon,
  GripVerticalIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PanelBody, PanelEmpty, PanelHeader, PanelToolbar } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ExercisePicker } from "@/components/fitness/exercise-picker"
import { PanelCard } from "@/components/fitness/panel-card"
import { SCHEDULE_STATUS } from "@/components/fitness/program/calendar-actions"
import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { DayExercisePanel } from "@/components/fitness/program/day-exercise-panel"
import { NameDialog } from "@/components/fitness/program/name-dialog"
import { AiPlanDialog, TemplateDialog } from "@/components/fitness/program/plan-dialogs"
import { ProgramBadges, ProgramSettingsMenu, ProgramStateLine } from "@/components/fitness/program/program-actions"
import { useStartWorkout } from "@/components/fitness/program/start-workout"
import { useThisWeek } from "@/components/fitness/program/this-week"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Exercise } from "@/lib/api/fitness/exercises"
import { changeWeek, type DayExercise, type WeekDay } from "@/lib/api/fitness/programs"
import { WEEKDAY_NAMES, WEEK_MONDAY_FIRST, formatDay, weekdayOf } from "@/lib/fitness/dates"
import { beginWorkout } from "@/lib/api/fitness/workouts"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** "rest 3 min", "rest 90 s", "rest 1 min 30 s". */
function restWords(seconds: number) {
  if (seconds <= 0) return "no rest"
  if (seconds < 60) return `rest ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const left = seconds % 60
  return left ? `rest ${minutes} min ${left} s` : `rest ${minutes} min`
}

/** "5 x 5 · 80 kg · rest 3 min". */
function exerciseSummary(row: DayExercise, exercise: Exercise | undefined, unit: WeightUnit) {
  const weight = exercise?.isBodyweight
    ? row.weightKg > 0
      ? `bodyweight + ${formatWeight(row.weightKg, unit)}`
      : "bodyweight"
    : row.weightKg > 0
      ? formatWeight(row.weightKg, unit)
      : "no weight set"
  return `${row.sets} x ${row.reps} · ${weight} · ${restWords(row.restSeconds)}`
}

function dayOf(page: ProgramViewProps["page"], weekday: number) {
  return page.week.find((entry) => entry.weekday === weekday) ?? null
}

// ---------------------------------------------------------------------------
// Left: the program and its week
// ---------------------------------------------------------------------------

/**
 * The left panel: the program, then its week from Monday to Sunday. Each row
 * is a workout or Rest, with this week's status beside it. Picking a row
 * opens that day in the middle.
 */
export function WeekLeft({ page, search, go }: ProgramViewProps) {
  const navigate = useNavigate()
  const { byWeekday } = useThisWeek(page.program.id, page.today)
  const todayWeekday = weekdayOf(page.today)
  const { thisWeek, goal, streak } = page.weeklyGoal

  return (
    <>
      <PanelHeader>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" aria-label="All programs">
              <Link to="/programs">
                <ArrowLeftIcon />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>All programs</TooltipContent>
        </Tooltip>
        <div className="grid min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{page.program.name}</h1>
          <ProgramBadges data={page} />
        </div>
        <ProgramSettingsMenu data={page} onDeleted={() => void navigate({ to: "/programs" })} />
      </PanelHeader>
      <PanelBody>
        <ProgramStateLine data={page} />
        {page.openWorkout && page.openWorkout.id !== search.workout ? (
          <div className="grid gap-2 rounded-lg border p-3 text-sm">
            <p>
              <span className="font-medium">{page.openWorkout.name}</span> from {formatDay(page.openWorkout.day)} isn&apos;t
              finished.
            </p>
            <Button type="button" onClick={() => go({ workout: page.openWorkout!.id, pick: undefined })}>
              <PlayIcon />
              Pick up {page.openWorkout.name}
            </Button>
          </div>
        ) : null}
        <PanelCard storageId="fitness-left-week" title="This week" meta={`${thisWeek} of ${goal}`}>
          <ul className="-mx-2 grid gap-0.5" aria-label="The week">
            {WEEK_MONDAY_FIRST.map((weekday) => {
              const day = dayOf(page, weekday)
              const row = byWeekday.get(weekday)
              const picked = search.view === "day" && search.day === weekday
              const status = row ? SCHEDULE_STATUS[row.status] : null
              const StatusIcon = status?.icon
              return (
                <li key={weekday}>
                  <button
                    type="button"
                    aria-current={picked ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background",
                      picked && "bg-background font-medium"
                    )}
                    onClick={() => go({ view: "day", day: weekday, pick: undefined })}
                  >
                    <span className={cn("w-9 shrink-0 text-muted-foreground", weekday === todayWeekday && "font-semibold text-foreground")}>
                      {WEEKDAY_NAMES[weekday].slice(0, 3)}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", !day && "text-muted-foreground")}>
                      {day ? day.name : "Rest"}
                    </span>
                    {weekday === todayWeekday ? (
                      <span className="shrink-0 text-xs text-muted-foreground">Today</span>
                    ) : null}
                    {status && StatusIcon && row?.status !== "planned" ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <StatusIcon className="size-3" />
                        {status.label}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            {thisWeek} of {goal} workouts this week · {streak} {streak === 1 ? "week" : "weeks"} in a row
          </p>
        </PanelCard>
      </PanelBody>
    </>
  )
}

// ---------------------------------------------------------------------------
// Middle: the picked day
// ---------------------------------------------------------------------------

/**
 * The middle panel on the Day view: the picked weekday's workout and its
 * exercises in order, with Start. A rest day says so, and can be made a
 * workout day, or the whole week can come from a template or the AI.
 */
export function DayMiddle({ page, search, go }: ProgramViewProps) {
  const router = useRouter()
  const weekday = search.day
  const day = dayOf(page, weekday)
  const canChange = !page.program.archived
  const [renaming, setRenaming] = React.useState(false)
  const [copying, setCopying] = React.useState(false)
  const [resting, setResting] = React.useState(false)
  const [templates, setTemplates] = React.useState(false)
  const [ai, setAi] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const { byWeekday } = useThisWeek(page.program.id, page.today)
  const { start, busy: starting } = useStartWorkout(page, go)
  const todayRow = weekday === weekdayOf(page.today) ? byWeekday.get(weekday) : undefined

  async function refresh() {
    calendarChanged()
    await router.invalidate()
  }

  async function act(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
      await refresh()
      return true
    } catch (error) {
      reportFitnessError(error)
      return false
    } finally {
      setBusy(false)
    }
  }

  /**
   * A workout that isn't on the week, for a session done off-plan. It used to
   * be "Start an empty workout" on History; Tyler, 18 Oct 2026, asked for it
   * here instead. Leaving it with nothing ticked throws it away.
   */
  async function logExtra() {
    setBusy(true)
    try {
      const { id } = await beginWorkout({ from: "empty", programId: page.program.id })
      go({ workout: id, pick: undefined })
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const weekMenu = (
    <>
      <DropdownMenuItem onSelect={() => setTemplates(true)}>
        <LayoutTemplateIcon />
        Use a template for the week
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setAi(true)}>
        <SparklesIcon />
        Build the week with AI
      </DropdownMenuItem>
    </>
  )

  return (
    <>
      <PanelToolbar>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {WEEKDAY_NAMES[weekday]}
          <span className="font-normal text-muted-foreground"> · {day ? day.name : "Rest"}</span>
        </h2>
        {canChange ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label={`${WEEKDAY_NAMES[weekday]} actions`}>
                    {busy ? <Loader2Icon className="animate-spin" /> : <EllipsisIcon />}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{WEEKDAY_NAMES[weekday]} actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {day ? (
                <>
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <SettingsIcon />
                    Rename this workout
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCopying(true)}>
                    <CopyIcon />
                    Copy to another weekday
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setResting(true)}>
                    <BedIcon />
                    Make it a rest day
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              {weekMenu}
              {page.program.mine ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void logExtra()}>
                    <PlusIcon />
                    Log an extra workout
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {day && page.program.mine && canChange ? (
          <Button type="button" disabled={starting} onClick={() => void start(day, todayRow)}>
            {starting ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
            {todayRow?.workoutId && todayRow.dayId === day.id ? "Carry on" : "Start workout"}
          </Button>
        ) : null}
      </PanelToolbar>
      {day ? (
        <DayExercises key={day.id} page={page} day={day} pickedId={search.pick} canChange={canChange} onPick={(pick) => go({ pick })} />
      ) : (
        <RestDay
          weekday={weekday}
          canChange={canChange}
          onMake={(name) =>
            act(
              () => changeWeek({ action: "setDay", programId: page.program.id, weekday, name }),
              `${WEEKDAY_NAMES[weekday]} is now a workout day.`
            )
          }
          onTemplates={() => setTemplates(true)}
          onAi={() => setAi(true)}
        />
      )}

      {day ? (
        <>
          <NameDialog
            open={renaming}
            title="Rename this workout"
            name={day.name}
            maxLength={60}
            saveLabel="Save changes"
            onClose={() => setRenaming(false)}
            onSave={async (name) => {
              await changeWeek({ action: "setDay", programId: page.program.id, weekday, name })
              await refresh()
            }}
          />
          <CopyDayDialog
            open={copying}
            day={day}
            week={page.week}
            onClose={() => setCopying(false)}
            onCopy={async (toWeekday) => {
              const done = await act(
                () => changeWeek({ action: "copyDay", dayId: day.id, toWeekday }),
                `${day.name} copied to ${WEEKDAY_NAMES[toWeekday]}.`
              )
              if (done) {
                setCopying(false)
                go({ day: toWeekday, pick: undefined })
              }
            }}
          />
          <ConfirmDialog
            open={resting}
            onOpenChange={setResting}
            title={`Make ${WEEKDAY_NAMES[weekday]} a rest day?`}
            description={`${day.name} and its ${day.exercises.length} ${day.exercises.length === 1 ? "exercise" : "exercises"} come off ${WEEKDAY_NAMES[weekday]}, and its planned dates leave the calendar. Workouts already logged stay in History.`}
            confirmLabel="Make it a rest day"
            destructive
            loading={busy}
            onConfirm={() =>
              void act(
                () => changeWeek({ action: "restDay", dayId: day.id }),
                `${WEEKDAY_NAMES[weekday]} is now a rest day.`
              ).then((done) => {
                if (done) {
                  setResting(false)
                  go({ pick: undefined })
                }
              })
            }
          />
        </>
      ) : null}
      <TemplateDialog
        open={templates}
        programId={page.program.id}
        templates={page.templates}
        hasPlan={page.week.length > 0}
        onClose={() => setTemplates(false)}
        onDone={refresh}
      />
      <AiPlanDialog
        open={ai}
        programId={page.program.id}
        defaultDays={Math.max(page.week.length, 3)}
        unit={page.preferences.unit}
        hasPlan={page.week.length > 0}
        onClose={() => setAi(false)}
        onDone={refresh}
      />
    </>
  )
}

function RestDay({
  weekday,
  canChange,
  onMake,
  onTemplates,
  onAi,
}: {
  weekday: number
  canChange: boolean
  onMake: (name: string) => Promise<boolean>
  onTemplates: () => void
  onAi: () => void
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const nameId = React.useId()

  async function make() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the workout a name, such as Push or Legs.")
      return
    }
    setBusy(true)
    const done = await onMake(name.trim())
    setBusy(false)
    if (done) setName("")
  }

  return (
    <PanelBody>
      <div className="grid gap-4 rounded-lg border p-4">
        <div className="grid gap-1">
          <p className="text-sm font-medium">{WEEKDAY_NAMES[weekday]} is a rest day.</p>
          <p className="text-sm text-muted-foreground">
            Nothing is planned and nothing counts as missed. Make it a workout day to give it exercises.
          </p>
        </div>
        {canChange ? (
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              void make()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={nameId}>Workout name</Label>
              <Input
                id={nameId}
                value={name}
                maxLength={60}
                placeholder="Push, Pull, Legs, Upper..."
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setInvalid(false)
                }}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Make it a workout day
            </Button>
          </form>
        ) : null}
      </div>
      {canChange ? (
        <div className="grid gap-2 rounded-lg border p-4">
          <p className="text-sm font-medium">Or fill the whole week at once</p>
          <p className="text-sm text-muted-foreground">
            A template or the AI sets every weekday, so it replaces the week you have now.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onTemplates}>
              <LayoutTemplateIcon />
              Use a template
            </Button>
            <Button type="button" variant="outline" onClick={onAi}>
              <SparklesIcon />
              Build with AI
            </Button>
          </div>
        </div>
      ) : null}
    </PanelBody>
  )
}

/** The day's exercises in order. Drag the handle to reorder; click a row to edit it on the right. */
function DayExercises({
  page,
  day,
  pickedId,
  canChange,
  onPick,
}: {
  page: ProgramViewProps["page"]
  day: WeekDay
  pickedId: string | undefined
  canChange: boolean
  onPick: (dayExerciseId: string) => void
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState(day.exercises)
  const [shown, setShown] = React.useState(day.exercises)
  if (shown !== day.exercises) {
    setShown(day.exercises)
    setRows(day.exercises)
  }
  const [picking, setPicking] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const names = React.useMemo(() => new Map(page.exercises.map((exercise) => [exercise.id, exercise])), [page.exercises])
  const unit = page.preferences.unit
  const dndId = React.useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function onDragEnd(event: DragEndEvent) {
    const from = rows.findIndex((row) => row.id === event.active.id)
    const to = rows.findIndex((row) => row.id === event.over?.id)
    if (from < 0 || to < 0 || from === to) return
    const before = rows
    const next = arrayMove(rows, from, to)
    setRows(next)
    try {
      await changeWeek({ action: "reorderExercises", dayId: day.id, ids: next.map((row) => row.id) })
      await router.invalidate()
    } catch (error) {
      setRows(before)
      reportFitnessError(error)
    }
  }

  async function add(exercise: Exercise) {
    setAdding(true)
    try {
      const { id } = await changeWeek({
        action: "addExercise",
        dayId: day.id,
        exerciseId: exercise.id,
        sets: 3,
        reps: exercise.movement === "isolation" ? 10 : 5,
        weightKg: 0,
        restSeconds: exercise.movement === "isolation" ? 90 : 180,
      })
      await router.invalidate()
      if (id) onPick(id)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setAdding(false)
    }
  }

  return (
    <PanelBody>
      {rows.length === 0 ? (
        <PanelEmpty>No exercises yet. Add the first one below.</PanelEmpty>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <ol className="divide-y rounded-lg border" aria-label={`${day.name} exercises`}>
              {rows.map((row, index) => {
                const inGroup = row.groupKey !== null && (rows[index - 1]?.groupKey === row.groupKey || rows[index + 1]?.groupKey === row.groupKey)
                const groupStart = inGroup && rows[index - 1]?.groupKey !== row.groupKey
                return (
                  <ExerciseRow
                    key={row.id}
                    row={row}
                    position={index + 1}
                    exercise={names.get(row.exerciseId)}
                    unit={unit}
                    picked={row.id === pickedId}
                    inGroup={inGroup}
                    groupStart={groupStart}
                    canChange={canChange}
                    onPick={() => onPick(row.id)}
                  />
                )
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {canChange ? (
        <Button type="button" variant="outline" className="justify-self-start" disabled={adding} onClick={() => setPicking(true)}>
          {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Add exercise
        </Button>
      ) : null}
      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        exercises={page.exercises}
        title={`Add an exercise to ${day.name}`}
        onPick={(exercise) => void add(exercise)}
      />
    </PanelBody>
  )
}

function ExerciseRow({
  row,
  position,
  exercise,
  unit,
  picked,
  inGroup,
  groupStart,
  canChange,
  onPick,
}: {
  row: DayExercise
  position: number
  exercise: Exercise | undefined
  unit: WeightUnit
  picked: boolean
  inGroup: boolean
  groupStart: boolean
  canChange: boolean
  onPick: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !canChange,
  })
  const name = exercise?.name ?? "Exercise"
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative bg-card", isDragging && "z-10 opacity-80", inGroup && "border-l-2 border-l-primary")}
    >
      {groupStart ? (
        <p className="px-3 pt-2 text-xs font-medium text-primary">Superset: no rest until the last one</p>
      ) : null}
      <div className={cn("flex items-center gap-1 pr-2", picked && "bg-muted")}>
        {canChange ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={setActivatorNodeRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Drag ${name} to reorder`}
                className="ml-1 cursor-grab touch-none text-muted-foreground"
                {...attributes}
                {...listeners}
              >
                <GripVerticalIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Drag to reorder</TooltipContent>
          </Tooltip>
        ) : null}
        <button
          type="button"
          aria-current={picked ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          onClick={onPick}
        >
          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{position}</span>
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{exerciseSummary(row, exercise, unit)}</span>
          </span>
        </button>
      </div>
    </li>
  )
}

/** Copies a workout day's exercises onto another weekday. A weekday that already has a workout is replaced. */
function CopyDayDialog({
  open,
  day,
  week,
  onClose,
  onCopy,
}: {
  open: boolean
  day: WeekDay
  week: readonly WeekDay[]
  onClose: () => void
  onCopy: (toWeekday: number) => Promise<void>
}) {
  const others = WEEK_MONDAY_FIRST.filter((weekday) => weekday !== day.weekday)
  const [target, setTarget] = React.useState<number>(others.find((weekday) => !week.some((entry) => entry.weekday === weekday)) ?? others[0])
  const [busy, setBusy] = React.useState(false)
  const selectId = React.useId()
  const replacing = week.find((entry) => entry.weekday === target)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Copy {day.name} to another weekday</DialogTitle>
          <DialogDescription>
            The copy has the same exercises, sets, reps and weights. Each day keeps its own weights from then on.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor={selectId}>Weekday</Label>
            <Select value={String(target)} onValueChange={(value) => setTarget(Number(value))}>
              <SelectTrigger id={selectId} className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {others.map((weekday) => {
                  const there = week.find((entry) => entry.weekday === weekday)
                  return (
                    <SelectItem key={weekday} value={String(weekday)}>
                      {WEEKDAY_NAMES[weekday]} {there ? `(now ${there.name})` : "(rest day)"}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {replacing ? (
              <p className="text-sm text-muted-foreground">
                {replacing.name} on {WEEKDAY_NAMES[target]} is replaced by the copy.
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onCopy(target).finally(() => setBusy(false))
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Copy to {WEEKDAY_NAMES[target]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Right: the picked exercise
// ---------------------------------------------------------------------------

/**
 * The right panel on the Day view: the picked exercise. The program's own
 * settings live in the cog beside its name (Tyler, 18 Oct 2026), so with
 * nothing picked this only says what to pick.
 */
export function DayRight({ page, search, go }: ProgramViewProps) {
  const day = dayOf(page, search.day)
  const row = day?.exercises.find((entry) => entry.id === search.pick)
  if (!day || !row) {
    return (
      <>
        <PanelHeader>
          <h2 className="text-sm font-semibold">Exercise</h2>
        </PanelHeader>
        <PanelEmpty>
          {day ? "Pick an exercise in the middle to change its sets, reps and weight here." : "A rest day has no exercises."}
        </PanelEmpty>
      </>
    )
  }
  const index = day.exercises.findIndex((entry) => entry.id === row.id)
  return (
    <DayExercisePanel
      key={row.id}
      page={page}
      day={day}
      row={row}
      first={index === 0}
      onClose={() => go({ pick: undefined })}
    />
  )
}

