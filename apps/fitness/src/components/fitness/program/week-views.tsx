import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  BedIcon,
  CopyIcon,
  DumbbellIcon,
  EllipsisIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  PlayIcon,
  PencilIcon,
  PlusIcon,
  SkipForwardIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { PanelBody, RightEmpty } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { PanelCard } from "@/components/fitness/panel-card"
import { SCHEDULE_STATUS, skipCalendarDay } from "@/components/fitness/program/calendar-actions"
import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { DayExercisePanel } from "@/components/fitness/program/day-exercise-panel"
import { dayLine } from "@/components/fitness/program/day-groups"
import { DayExercises, DayHeading } from "@/components/fitness/program/day-list"
import { NameDialog } from "@/components/fitness/program/name-dialog"
import { NewButton, NewExercise } from "@/components/fitness/program/new-exercise"
import { AiPlanDialog, TemplateDialog } from "@/components/fitness/program/plan-dialogs"
import { ProgramStateLine } from "@/components/fitness/program/program-actions"
import { ProgramHero } from "@/components/fitness/program/program-hero"
import { ProgramLengthLine } from "@/components/fitness/program/program-length"
import { StatusDot, type DotKind } from "@/components/fitness/status-dot"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
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
import { changeWeek, type WeekDay } from "@/lib/api/fitness/programs"
import { WEEKDAY_NAMES, WEEK_MONDAY_FIRST, formatDay, weekdayOf } from "@/lib/fitness/dates"
import { beginWorkout } from "@/lib/api/fitness/workouts"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

function dayOf(page: ProgramViewProps["page"], weekday: number) {
  return page.week.find((entry) => entry.weekday === weekday) ?? null
}

// ---------------------------------------------------------------------------
// Left: the program and its week
// ---------------------------------------------------------------------------

/**
 * The left panel: the program's header, banner and picture (`ProgramHero`),
 * then This week as Tyler drew it on 18 Oct 2026: how many workouts are done against the
 * weekly goal, the streak, and the week from Monday to Sunday, each day a
 * workout or Rest with a dot for how it went. Picking a day opens it in the
 * middle.
 */
export function WeekLeft({ page, search, go }: ProgramViewProps) {
  return (
    <ProgramHero data={page}>
      <PanelBody>
        <ProgramStateLine data={page} />
        <ProgramLengthLine data={page} />
        {page.openWorkout && page.openWorkout.id !== search.workout ? (
          <div className="grid gap-2 rounded-lg border p-3 text-sm">
            <p>
              <span className="font-medium">{page.openWorkout.name}</span> from {formatDay(page.openWorkout.day)} isn&apos;t
              finished.
            </p>
            <Button type="button" onClick={() => go({ workout: page.openWorkout!.id, open: undefined })}>
              <PlayIcon />
              Pick up {page.openWorkout.name}
            </Button>
          </div>
        ) : null}
        <ThisWeekCard page={page} search={search} go={go} />
      </PanelBody>
    </ProgramHero>
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
            : status === "done" || status === "missed" || status === "paused" || status === "skipped"
              ? status
              : isToday
                ? "today"
                : "planned"
          const word =
            status && status !== "planned" ? SCHEDULE_STATUS[status].label : isToday ? "Today" : null
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
                onClick={() => go({ view: "day", day: weekday, open: undefined })}
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
 * The day's menu in the middle panel's header, on every view as Tyler drew
 * Progress on 18 Oct 2026: rename, copy, make it a rest day, a template or
 * the AI for the whole week, and an extra workout. Away from the Day view it
 * acts on the weekday last picked, today's by default.
 */
export function DayMenu({ page, search, go }: ProgramViewProps) {
  const router = useRouter()
  const weekday = search.day
  const day = dayOf(page, weekday)
  const canChange = !page.program.archived
  const { byWeekday } = useThisWeek(page.program.id, page.today)
  // Today's planned date, which "Skip today" skips or brings back.
  const todaysRow = day && weekday === weekdayOf(page.today) ? byWeekday.get(weekday) : undefined
  const skippable = todaysRow && !todaysRow.workoutId && (todaysRow.status === "planned" || todaysRow.status === "skipped")
  const [renaming, setRenaming] = React.useState(false)
  const [copying, setCopying] = React.useState(false)
  const [resting, setResting] = React.useState(false)
  const [templates, setTemplates] = React.useState(false)
  const [ai, setAi] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
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
      go({ workout: id, open: undefined })
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
                <Button type="button" variant="ghost" size="icon" aria-label={`${WEEKDAY_NAMES[weekday]} actions`}>
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
                {skippable ? (
                  <DropdownMenuItem
                    onSelect={() => void act(() => skipCalendarDay(todaysRow, todaysRow.status !== "skipped"))}
                  >
                    {todaysRow.status === "skipped" ? <Undo2Icon /> : <SkipForwardIcon />}
                    {todaysRow.status === "skipped" ? "Don't skip today" : "Skip today"}
                  </DropdownMenuItem>
                ) : null}
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
                go({ day: toWeekday, open: undefined })
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
                  go({ open: undefined })
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

/**
 * Start workout, the middle header's main button on every view: it starts the
 * weekday last picked, or carries on with today's if it is already open. Only
 * the person who trains sees it, and in a narrow header it keeps its icon and
 * drops its words.
 */
export function StartWorkoutButton({ page, search, go }: ProgramViewProps) {
  const day = dayOf(page, search.day)
  const { byWeekday } = useThisWeek(page.program.id, page.today)
  const { start, busy } = useStartWorkout(page, go)
  if (!day || !page.program.mine || page.program.archived) return null
  const todayRow = search.day === weekdayOf(page.today) ? byWeekday.get(search.day) : undefined
  const label = todayRow?.workoutId && todayRow.dayId === day.id ? "Carry on" : "Start workout"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          className="@max-3xl:size-8 @max-3xl:px-0"
          aria-label={`${label}: ${day.name}`}
          disabled={busy}
          onClick={() => void start(day, todayRow)}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <PlayIcon className="fill-current" />}
          <span className="@max-3xl:hidden">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}: {day.name}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The Day view's "New …" (UI standard: "The primary New … button opens a
 * dropdown, not a window"): New exercise on a workout day, New workout on a
 * rest day. Start workout stays the header's main button, as Tyler picked on
 * 20 Oct 2026, so this one is outlined.
 */
export function DayNew(props: ProgramViewProps) {
  const day = dayOf(props.page, props.search.day)
  if (props.page.program.archived) return null
  return day ? <NewExercise key={day.id} {...props} day={day} /> : <NewWorkoutDay {...props} />
}

/** New workout on a rest day: its name makes the weekday a workout day. */
function NewWorkoutDay({ page, search }: ProgramViewProps) {
  const router = useRouter()
  const weekday = search.day
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const nameId = React.useId()

  async function create() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the workout a name, such as Push or Legs.")
      return
    }
    setBusy(true)
    try {
      await changeWeek({ action: "setDay", programId: page.program.id, weekday, name: name.trim() })
      toast.success(`${WEEKDAY_NAMES[weekday]} is now a workout day.`)
      calendarChanged()
      await router.invalidate()
      setOpen(false)
      setName("")
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NewRecordDropdown
      label="New workout"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create workout"
      busy={busy}
      onSubmit={() => void create()}
      trigger={<NewButton label="New workout" />}
    >
      <div className="grid gap-2">
        <Label htmlFor={nameId}>Workout name on {WEEKDAY_NAMES[weekday]}</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={60}
          autoFocus
          placeholder="Push, Pull, Legs, Upper..."
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
    </NewRecordDropdown>
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

/**
 * The middle panel on the Day view, as Tyler drew it on 18 Oct 2026: the
 * picked weekday's workout as a large heading with how long it takes, then
 * its exercises as cards in order. A rest day says so; New workout in the
 * header makes it a workout day, or the whole week can come from a template
 * or the AI.
 */
export function DayMiddle({ page, search, go }: ProgramViewProps) {
  const weekday = search.day
  const day = dayOf(page, weekday)
  const canChange = !page.program.archived

  if (day) {
    return (
      <DayExercises key={day.id} page={page} go={go} day={day} pickedId={search.open} canChange={canChange} />
    )
  }
  return <RestDay page={page} weekday={weekday} canChange={canChange} />
}

function RestDay({
  page,
  weekday,
  canChange,
}: {
  page: ProgramViewProps["page"]
  weekday: number
  canChange: boolean
}) {
  const router = useRouter()
  const [templates, setTemplates] = React.useState(false)
  const [ai, setAi] = React.useState(false)

  return (
    <PanelBody padded={false}>
      <DayHeading title="Rest" line={dayLine(page, weekday, null)} />
      <div className="grid gap-3 p-5">
      <div className="grid gap-1 rounded-xl border p-4">
        <p className="text-sm font-medium">{WEEKDAY_NAMES[weekday]} is a rest day.</p>
        <p className="text-sm text-muted-foreground">
          Nothing is planned and nothing counts as missed.
          {canChange ? " Press New workout to make it a workout day and give it exercises." : ""}
        </p>
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
      </div>
    </PanelBody>
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

/** The right panel on the Day view: the picked exercise, or what to click. */
export function DayRight({ page, search, go }: ProgramViewProps) {
  const day = dayOf(page, search.day)
  const row = day?.exercises.find((entry) => entry.id === search.open)
  if (!day || !row) {
    return (
      <RightEmpty
        title="Exercise"
        icon={DumbbellIcon}
        line={day ? "Click an exercise to change its sets, reps and weight here." : "A rest day has no exercises."}
      />
    )
  }
  return (
    <DayExercisePanel
      key={row.id}
      page={page}
      day={day}
      row={row}
      onClose={() => go({ open: undefined })}
    />
  )
}

