import * as React from "react"
import { useRouter } from "@tanstack/react-router"
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
  BedIcon,
  CopyIcon,
  EllipsisIcon,
  GripVerticalIcon,
  LayoutTemplateIcon,
  Link2Icon,
  Loader2Icon,
  PlayIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PanelBody, PanelEmpty, PanelHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ExercisePicker } from "@/components/fitness/exercise-picker"
import { PanelCard } from "@/components/fitness/panel-card"
import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { DayExercisePanel } from "@/components/fitness/program/day-exercise-panel"
import { NameDialog } from "@/components/fitness/program/name-dialog"
import { AiPlanDialog, TemplateDialog } from "@/components/fitness/program/plan-dialogs"
import { ProgramStateLine } from "@/components/fitness/program/program-actions"
import { ProgramHero } from "@/components/fitness/program/program-hero"
import { StatusDot, type DotKind } from "@/components/fitness/status-dot"
import { TONE } from "@/components/fitness/status-tones"
import { Meter } from "@/components/ui/meter"
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

function dayOf(page: ProgramViewProps["page"], weekday: number) {
  return page.week.find((entry) => entry.weekday === weekday) ?? null
}

// ---------------------------------------------------------------------------
// Left: the program and its week
// ---------------------------------------------------------------------------

/**
 * The left panel, as Tyler drew it on 18 Oct 2026: the program's banner,
 * picture and name, then This week: how many workouts are done against the
 * weekly goal, the streak, and the week from Monday to Sunday, each day a
 * workout or Rest with a dot for how it went. Picking a day opens it in the
 * middle.
 */
export function WeekLeft({ page, search, go }: ProgramViewProps) {
  return (
    <>
      <ProgramHero data={page} />
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
        <ThisWeekCard page={page} search={search} go={go} />
      </PanelBody>
    </>
  )
}

function ThisWeekCard({ page, search, go }: ProgramViewProps) {
  const { byWeekday } = useThisWeek(page.program.id, page.today)
  const todayWeekday = weekdayOf(page.today)
  const { thisWeek, goal, streak } = page.weeklyGoal

  return (
    <PanelCard storageId="fitness-left-week" title="This week" flush>
      <div className="grid grid-cols-2 border-b">
        <div className="grid gap-1 border-r p-4">
          <span className="text-[13px] text-muted-foreground">Workouts</span>
          <span className="text-2xl font-semibold tabular-nums">
            {thisWeek}
            <span className="text-base font-normal text-muted-foreground"> / {goal}</span>
          </span>
          <Meter
            value={thisWeek}
            max={goal}
            size="sm"
            label="Workouts this week"
            valueText={`${thisWeek} of ${goal}`}
            className="mt-1"
          />
        </div>
        <div className="grid content-start gap-1 p-4">
          <span className="text-[13px] text-muted-foreground">Streak</span>
          <span className="text-2xl font-semibold tabular-nums">
            {streak}
            <span className="text-base font-normal text-muted-foreground"> {streak === 1 ? "week" : "weeks"}</span>
          </span>
          <span className="text-[13px] text-muted-foreground">in a row</span>
        </div>
      </div>
      <ul className="grid gap-0.5 p-2" aria-label="The week">
        {WEEK_MONDAY_FIRST.map((weekday) => {
          const day = dayOf(page, weekday)
          const row = byWeekday.get(weekday)
          const picked = search.view === "day" && search.day === weekday
          const isToday = weekday === todayWeekday
          const status = day ? row?.status : undefined
          const dot: DotKind = !day
            ? "rest"
            : status === "done" || status === "missed" || status === "paused"
              ? status
              : isToday
                ? "today"
                : "planned"
          const word =
            status === "done" ? "Done" : status === "missed" ? "Missed" : status === "paused" ? "Paused" : isToday ? "Today" : null
          return (
            <li key={weekday}>
              <button
                type="button"
                aria-current={picked ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-background",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  picked && "border-border bg-background shadow-xs"
                )}
                onClick={() => go({ view: "day", day: weekday, pick: undefined })}
              >
                <span className={cn("w-8 shrink-0 text-[13px] text-muted-foreground", isToday && "font-semibold text-foreground")}>
                  {WEEKDAY_NAMES[weekday].slice(0, 3)}
                </span>
                <StatusDot kind={dot} />
                <span className={cn("min-w-0 flex-1 truncate", !day && "text-muted-foreground", isToday && day && "font-medium")}>
                  {day ? day.name : "Rest"}
                </span>
                {word ? <span className="shrink-0 text-xs text-muted-foreground">{word}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
// Middle: the picked day
// ---------------------------------------------------------------------------

/**
 * The Day view's buttons, in the row with the dashboard's tabs as Tyler drew
 * it on 18 Oct 2026: the day's menu (rename, copy, make it a rest day, a
 * template or the AI for the whole week, an extra workout) and Start workout.
 */
export function DayActions({ page, search, go }: ProgramViewProps) {
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
   * A workout that isn't on the week, for a session done off-plan. Leaving it
   * with nothing ticked throws it away.
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

  return (
    <>
      {canChange ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label={`${WEEKDAY_NAMES[weekday]} actions`}>
                  {busy ? <Loader2Icon className="animate-spin" /> : <EllipsisIcon />}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{WEEKDAY_NAMES[weekday]} actions</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            // Roomier rows than the shell's menus, as Tyler drew this one on 18 Oct 2026.
            className="min-w-64 rounded-xl p-1.5 [&_[data-slot=dropdown-menu-item]]:gap-3 [&_[data-slot=dropdown-menu-item]]:px-3 [&_[data-slot=dropdown-menu-item]]:py-2 [&_[data-slot=dropdown-menu-separator]]:mx-2"
          >
            {day ? (
              <>
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  <PencilIcon />
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
            <DropdownMenuItem onSelect={() => setTemplates(true)}>
              <LayoutTemplateIcon />
              Use a template for the week
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAi(true)}>
              <SparklesIcon />
              Build the week with AI
            </DropdownMenuItem>
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
          {starting ? <Loader2Icon className="animate-spin" /> : <PlayIcon className="fill-current" />}
          {todayRow?.workoutId && todayRow.dayId === day.id ? "Carry on" : "Start workout"}
        </Button>
      ) : null}

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
      <WeekDialogs page={page} templates={templates} ai={ai} onTemplates={setTemplates} onAi={setAi} onDone={refresh} />
    </>
  )
}

/** The two windows that fill the whole week at once: a template, or the AI. */
function WeekDialogs({
  page,
  templates,
  ai,
  onTemplates,
  onAi,
  onDone,
}: {
  page: ProgramViewProps["page"]
  templates: boolean
  ai: boolean
  onTemplates: (open: boolean) => void
  onAi: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  return (
    <>
      <TemplateDialog
        open={templates}
        programId={page.program.id}
        templates={page.templates}
        hasPlan={page.week.length > 0}
        onClose={() => onTemplates(false)}
        onDone={onDone}
      />
      <AiPlanDialog
        open={ai}
        programId={page.program.id}
        defaultDays={Math.max(page.week.length, 3)}
        unit={page.preferences.unit}
        hasPlan={page.week.length > 0}
        onClose={() => onAi(false)}
        onDone={onDone}
      />
    </>
  )
}

/** "3 min", "1:30", "45 s". */
function restWords(seconds: number) {
  if (seconds <= 0) return "No rest"
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const left = seconds % 60
  return left ? `${minutes}:${String(left).padStart(2, "0")}` : `${minutes} min`
}

/**
 * How long a day takes, roughly: 45 seconds a set, the rest between sets, a
 * minute between exercises, to the nearest 5 minutes.
 */
function dayMinutes(exercises: readonly DayExercise[]) {
  const seconds = exercises.reduce(
    (sum, row) => sum + row.sets * 45 + Math.max(row.sets - 1, 0) * row.restSeconds,
    Math.max(exercises.length - 1, 0) * 60
  )
  return Math.max(5, Math.round(seconds / 60 / 5) * 5)
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })

/** The quiet line under the day's name: "Sunday · Today · 3 exercises · 9 sets · about 25 min". */
function dayLine(page: ProgramViewProps["page"], weekday: number, day: WeekDay | null) {
  const parts: string[] = [WEEKDAY_NAMES[weekday]]
  if (weekday === weekdayOf(page.today)) parts.push("Today")
  if (day) {
    const sets = day.exercises.reduce((sum, row) => sum + row.sets, 0)
    parts.push(`${day.exercises.length} ${day.exercises.length === 1 ? "exercise" : "exercises"}`)
    if (sets) parts.push(`${sets} ${sets === 1 ? "set" : "sets"}`, `about ${dayMinutes(day.exercises)} min`)
  }
  return parts.join(" · ")
}

/**
 * The middle panel on the Day view, as Tyler drew it on 18 Oct 2026: the
 * picked weekday's workout as a large heading with how long it takes, then
 * its exercises as cards in order. A rest day says so, and can be made a
 * workout day, or the whole week can come from a template or the AI.
 */
export function DayMiddle({ page, search, go }: ProgramViewProps) {
  const router = useRouter()
  const weekday = search.day
  const day = dayOf(page, weekday)
  const canChange = !page.program.archived

  if (day) {
    return (
      <DayExercises key={day.id} page={page} day={day} pickedId={search.pick} canChange={canChange} onPick={(pick) => go({ pick })} />
    )
  }
  return (
    <RestDay
      page={page}
      weekday={weekday}
      canChange={canChange}
      onMake={async (name) => {
        try {
          await changeWeek({ action: "setDay", programId: page.program.id, weekday, name })
          toast.success(`${WEEKDAY_NAMES[weekday]} is now a workout day.`)
          calendarChanged()
          await router.invalidate()
          return true
        } catch (error) {
          reportFitnessError(error)
          return false
        }
      }}
    />
  )
}

/** The day's heading: its name large, the quiet line under it, and a button at the right. */
function DayHeading({ title, line, action }: { title: string; line: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-1 pb-1">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h2 className="truncate text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="truncate text-[13px] text-muted-foreground">{line}</p>
      </div>
      {action}
    </div>
  )
}

function RestDay({
  page,
  weekday,
  canChange,
  onMake,
}: {
  page: ProgramViewProps["page"]
  weekday: number
  canChange: boolean
  onMake: (name: string) => Promise<boolean>
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const [templates, setTemplates] = React.useState(false)
  const [ai, setAi] = React.useState(false)
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
      <DayHeading title="Rest" line={dayLine(page, weekday, null)} />
      <div className="grid gap-4 rounded-xl border p-4">
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
        <div className="grid gap-2 rounded-xl border p-4">
          <p className="text-sm font-medium">Or fill the whole week at once</p>
          <p className="text-sm text-muted-foreground">
            A template or the AI sets every weekday, so it replaces the week you have now.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setTemplates(true)}>
              <LayoutTemplateIcon />
              Use a template
            </Button>
            <Button type="button" variant="outline" onClick={() => setAi(true)}>
              <SparklesIcon />
              Build with AI
            </Button>
          </div>
        </div>
      ) : null}
      <WeekDialogs
        page={page}
        templates={templates}
        ai={ai}
        onTemplates={setTemplates}
        onAi={setAi}
        onDone={async () => {
          calendarChanged()
          await router.invalidate()
        }}
      />
    </PanelBody>
  )
}

/** The day's exercises in order. Drag the handle to reorder; click a card to edit it on the right. */
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
      <DayHeading
        title={day.name}
        line={dayLine(page, day.weekday, day)}
        action={
          canChange ? (
            <Button type="button" variant="outline" disabled={adding} onClick={() => setPicking(true)}>
              {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add exercise
            </Button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No exercises yet. Press Add exercise to put the first one in.
        </p>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2" aria-label={`${day.name} exercises`}>
              {rows.map((row, index) => {
                const inGroup = row.groupKey !== null && (rows[index - 1]?.groupKey === row.groupKey || rows[index + 1]?.groupKey === row.groupKey)
                const groupStart = inGroup && rows[index - 1]?.groupKey !== row.groupKey
                return (
                  <ExerciseRow
                    key={row.id}
                    row={row}
                    position={index + 1}
                    exercise={names.get(row.exerciseId)}
                    last={page.lastTimes[row.exerciseId]}
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

/** "80 kg", "+10 kg" on a bodyweight lift, "Bodyweight", or "No weight" in amber when nothing is set yet. */
function WeightPill({ row, exercise, unit }: { row: DayExercise; exercise: Exercise | undefined; unit: WeightUnit }) {
  const pill = "rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
  if (row.weightKg > 0) {
    return (
      <span className={cn(pill, "border")}>
        {exercise?.isBodyweight ? `+${formatWeight(row.weightKg, unit)}` : formatWeight(row.weightKg, unit)}
      </span>
    )
  }
  if (exercise?.isBodyweight) return <span className={cn(pill, "border text-muted-foreground")}>Bodyweight</span>
  return <span className={cn(pill, TONE.warning)}>No weight</span>
}

function ExerciseRow({
  row,
  position,
  exercise,
  last,
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
  last: { day: string; sets: number; reps: number } | undefined
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
  const lastWords = last
    ? `Last: ${last.sets} × ${last.reps} on ${SHORT_DATE.format(new Date(`${last.day}T00:00:00Z`))}`
    : "Not logged yet"
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative grid gap-1", isDragging && "z-10 opacity-80")}
    >
      {groupStart ? (
        <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          <Link2Icon className="size-3.5" aria-hidden />
          Superset: no rest until the last one
        </p>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-card py-2.5 pr-3 pl-1 transition-colors",
          picked && "border-foreground ring-1 ring-foreground",
          inGroup && !picked && "border-l-2 border-l-foreground/40"
        )}
      >
        {canChange ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={setActivatorNodeRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Drag ${name} to reorder`}
                className="cursor-grab touch-none text-muted-foreground/60"
                {...attributes}
                {...listeners}
              >
                <GripVerticalIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Drag to reorder</TooltipContent>
          </Tooltip>
        ) : (
          <span className="w-1" />
        )}
        <button
          type="button"
          aria-current={picked ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onPick}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border text-xs tabular-nums">
            {position}
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.restSeconds > 0 ? `Rest ${restWords(row.restSeconds)}` : "No rest"} · {lastWords}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums">
              {row.sets} × {row.reps}
            </span>
            <WeightPill row={row} exercise={exercise} unit={unit} />
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

