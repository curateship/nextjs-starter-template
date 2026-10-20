import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  type CollisionDetection,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, Link2Icon, PlusIcon } from "lucide-react"

import { PanelBody } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { dayLine, groupByBodyPart, groupedIds, type DayGroup } from "@/components/fitness/program/day-groups"
import { NewExercise } from "@/components/fitness/program/new-exercise"
import { useThisWeek } from "@/components/fitness/program/this-week"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Exercise } from "@/lib/api/fitness/exercises"
import { changeWeek, type DayExercise, type WeekDay } from "@/lib/api/fitness/programs"
import { loadWorkoutPage } from "@/lib/api/fitness/workouts"
import { BODY_PART_LABELS } from "@/lib/fitness/exercise-catalog"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeightNumber, type WeightUnit } from "@/lib/fitness/weights"
import { cn } from "@/lib/utils"

/** "3 min", "1:30", "45 s". */
function restWords(seconds: number) {
  if (seconds <= 0) return "No rest"
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const left = seconds % 60
  return left ? `${minutes}:${String(left).padStart(2, "0")}` : `${minutes} min`
}

/** The day's heading across the top of the middle panel: its name large and the quiet line under it. */
export function DayHeading({ title, line }: { title: string; line: string }) {
  return (
    <div className="grid min-w-0 gap-1 border-b px-5 pt-5 pb-4">
      <h2 className="truncate text-3xl font-bold tracking-tight">{title}</h2>
      <p className="truncate text-sm text-muted-foreground">{line}</p>
    </div>
  )
}

/**
 * The working sets ticked so far in this week's workout for the day, by
 * day exercise, for the "0/4 sets" on each row. Empty until a workout for
 * the day has been started this week.
 */
function useDayProgress(page: ProgramViewProps["page"], day: WeekDay) {
  const { byWeekday } = useThisWeek(page.program.id, page.today)
  const row = byWeekday.get(day.weekday)
  const workoutId = row?.workoutId && row.dayId === day.id ? row.workoutId : null
  const [loaded, setLoaded] = React.useState<{ workoutId: string; done: Map<string, number> } | null>(null)

  React.useEffect(() => {
    if (!workoutId) return
    let live = true
    loadWorkoutPage(workoutId).then(
      ({ workout }) => {
        if (!live) return
        const done = new Map<string, number>()
        for (const exercise of workout.exercises) {
          if (!exercise.dayExerciseId) continue
          const ticked = exercise.sets.filter((set) => set.kind === "working" && set.done).length
          done.set(exercise.dayExerciseId, (done.get(exercise.dayExerciseId) ?? 0) + ticked)
        }
        setLoaded({ workoutId, done })
      },
      // The counts are a nicety: without them every row reads 0, as before a workout.
      () => undefined
    )
    return () => {
      live = false
    }
  }, [workoutId])

  return loaded && loaded.workoutId === workoutId ? loaded.done : null
}

/**
 * The Day view's list, as Tyler drew it on 20 Oct 2026: the day's exercises
 * edge to edge under grey body part headings ("Chest · 2"), each row with its
 * drag handle, its number (filled in when it is open on the right), its name,
 * "Rest 3 min · Last: 60 kg × 8" and the sets ticked this week, "0/4 sets".
 *
 * Pointing at a body part's heading shows a "+" that adds a lift of that body
 * part (Tyler: "Add a '+' icon on hover over to add an exercise to that body
 * part"). A row drags within its body part only, because its body part comes
 * from its main muscle, not from where it sits. The order saved is the order
 * shown, so the workout runs top to bottom.
 */
export function DayExercises({
  page,
  go,
  day,
  pickedId,
  canChange,
}: Pick<ProgramViewProps, "page" | "go"> & {
  day: WeekDay
  pickedId: string | undefined
  canChange: boolean
}) {
  const router = useRouter()
  const library = React.useMemo(() => new Map(page.exercises.map((exercise) => [exercise.id, exercise])), [page.exercises])
  const [groups, setGroups] = React.useState(() => groupByBodyPart(day.exercises, library))
  const [shown, setShown] = React.useState(day.exercises)
  if (shown !== day.exercises) {
    setShown(day.exercises)
    setGroups(groupByBodyPart(day.exercises, library))
  }
  const progress = useDayProgress(page, day)
  const unit = page.preferences.unit
  const dndId = React.useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const ordered = groups.flatMap((group) => group.rows)

  async function onDragEnd(event: DragEndEvent) {
    const group = groups.find((entry) => entry.rows.some((row) => row.id === event.active.id))
    if (!group) return
    const from = group.rows.findIndex((row) => row.id === event.active.id)
    const to = group.rows.findIndex((row) => row.id === event.over?.id)
    if (from < 0 || to < 0 || from === to) return
    const before = groups
    const next = groups.map((entry) => (entry === group ? { ...entry, rows: arrayMove(entry.rows, from, to) } : entry))
    setGroups(next)
    try {
      await changeWeek({ action: "reorderExercises", dayId: day.id, ids: groupedIds(next) })
      await router.invalidate()
    } catch (error) {
      setGroups(before)
      reportFitnessError(error)
    }
  }

  return (
    <PanelBody padded={false}>
      <DayHeading title={day.name} line={dayLine(page, day.weekday, day)} />
      {ordered.length === 0 ? (
        <p className="m-5 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {canChange ? "No exercises yet. Press New exercise to put the first one in." : "No exercises yet."}
        </p>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={withinBodyPart} onDragEnd={(event) => void onDragEnd(event)}>
          {groups.map((group) => (
            <BodyPartSection
              key={group.part}
              group={group}
              page={page}
              go={go}
              day={day}
              canChange={canChange}
            >
              {group.rows.map((row) => {
                const index = ordered.indexOf(row)
                const inSuperset =
                  row.groupKey !== null &&
                  (ordered[index - 1]?.groupKey === row.groupKey || ordered[index + 1]?.groupKey === row.groupKey)
                return (
                  <ExerciseRow
                    key={row.id}
                    row={row}
                    position={index + 1}
                    exercise={library.get(row.exerciseId)}
                    last={page.lastTimes[row.exerciseId]}
                    done={progress?.get(row.id) ?? 0}
                    unit={unit}
                    picked={row.id === pickedId}
                    inSuperset={inSuperset}
                    canChange={canChange}
                    onPick={() => go({ open: row.id })}
                  />
                )
              })}
            </BodyPartSection>
          ))}
        </DndContext>
      )}
    </PanelBody>
  )
}

/**
 * A row only ever lands among its own body part's rows, so dragging over
 * another body part leaves the row where it would drop rather than snapping
 * back, and the arrow keys stop at the body part's ends.
 */
const withinBodyPart: CollisionDetection = (args) => {
  const container = args.active.data.current?.sortable?.containerId
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (droppable) => droppable.data.current?.sortable?.containerId === container
    ),
  })
}

/** One body part: its grey heading with the count and the "+" that shows on hover, then its rows. */
function BodyPartSection({
  group,
  page,
  go,
  day,
  canChange,
  children,
}: Pick<ProgramViewProps, "page" | "go"> & {
  group: DayGroup
  day: WeekDay
  canChange: boolean
  children: React.ReactNode
}) {
  const label = BODY_PART_LABELS[group.part]
  return (
    <section aria-label={label}>
      <div className="group/part flex min-h-11 items-center gap-1.5 border-b bg-muted/40 px-5 py-1.5">
        <h3 className="text-[13px] font-semibold">{label}</h3>
        <span className="text-[13px] text-muted-foreground">· {group.rows.length}</span>
        {canChange ? (
          <NewExercise
            page={page}
            go={go}
            day={day}
            bodyPart={group.part}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Add a ${label.toLowerCase()} exercise`}
                className={cn(
                  "ml-1 text-muted-foreground opacity-0 transition-opacity group-hover/part:opacity-100 focus-visible:opacity-100",
                  "data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                )}
              >
                <PlusIcon />
              </Button>
            }
          />
        ) : null}
      </div>
      <SortableContext id={group.part} items={group.rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        <ol aria-label={`${label} exercises`}>{children}</ol>
      </SortableContext>
    </section>
  )
}

function ExerciseRow({
  row,
  position,
  exercise,
  last,
  done,
  unit,
  picked,
  inSuperset,
  canChange,
  onPick,
}: {
  row: DayExercise
  position: number
  exercise: Exercise | undefined
  last: { weightKg: number; reps: number } | undefined
  /** Working sets ticked in this week's workout for the day. */
  done: number
  unit: WeightUnit
  picked: boolean
  inSuperset: boolean
  canChange: boolean
  onPick: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !canChange,
  })
  const name = exercise?.name ?? "Exercise"
  const lastWords = !last
    ? "Not logged yet"
    : exercise?.isBodyweight
      ? last.weightKg > 0
        ? `Last: +${formatWeightNumber(last.weightKg, unit)} ${unit} × ${last.reps}`
        : `Last: bodyweight × ${last.reps}`
      : `Last: ${formatWeightNumber(last.weightKg, unit)} ${unit} × ${last.reps}`
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex items-center gap-2 border-b bg-card py-3 pr-5 pl-2", isDragging && "z-10 opacity-80 shadow-sm")}
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
          <TooltipContent>Drag to reorder within its body part</TooltipContent>
        </Tooltip>
      ) : (
        <span className="w-7" />
      )}
      <button
        type="button"
        aria-current={picked ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onPick}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border text-sm tabular-nums",
            picked && "border-foreground bg-foreground text-background"
          )}
        >
          {position}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-[15px] font-medium">{name}</span>
          <span className="flex min-w-0 items-center gap-1 truncate text-[13px] text-muted-foreground">
            {inSuperset ? (
              <>
                <Link2Icon className="size-3.5 shrink-0" aria-hidden />
                Superset ·{" "}
              </>
            ) : null}
            {row.restSeconds > 0 ? `Rest ${restWords(row.restSeconds)}` : "No rest"} · {lastWords}
          </span>
        </span>
        <span className="shrink-0 rounded-lg border px-2.5 py-1 text-[13px] text-muted-foreground tabular-nums">
          {done}/{row.sets} sets
        </span>
      </button>
    </li>
  )
}
