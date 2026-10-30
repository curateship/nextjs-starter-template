import * as React from "react"
import { useRouter } from "@tanstack/react-router"
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
import { ArchiveIcon, ArchiveRestoreIcon, GripVerticalIcon, PlusIcon, SettingsIcon } from "lucide-react"

import { HABIT_ICON_LOOK, HabitIconGlyph } from "@/components/project/habit-icons"
import { SaveLine } from "@/components/project/save-line"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  addHabit,
  addSampleRoutines,
  bringBackHabit,
  changeHabit,
  retireMyHabit,
  saveHabitOrder,
  saveMyHours,
  saveMyOwnWords,
  saveMyReminders,
  saveMySky,
  type DailyCard,
  type DailyHabit,
} from "@/lib/api/project/daily-card"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import {
  DAILY_LIMITS,
  DAY_PART_LABEL,
  DAY_PARTS,
  HABIT_ICONS,
  hoursInOrder,
  SKY_KINDS,
  SKY_LABEL,
  WEEKDAY_SHORT,
  type DayHours,
  type DayPart,
  type HabitIcon,
  type SkyKind,
} from "@/lib/project/daily-card"
import { clockLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/**
 * The window behind the Daily card's pencil (Tyler, 29 Oct 2026: "A pencil
 * on the card"). Everyone sets their own hours here. The site admin also
 * sets the sky, their habits for each part of the day, the routine reminders
 * and their own lines and questions. Every field saves itself; a new habit
 * is made with its own button.
 */
export function DailySettingsDialog({ daily, open, onClose }: { daily: DailyCard; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return
        // Leaving a field saves it, so closing first leaves the field being typed in.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Daily card</DialogTitle>
          <DialogDescription>
            {daily.admin
              ? "Your hours, sky, habits, reminders and words. Only you see your habits and journal."
              : "When your morning, afternoon and night start."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <HoursCard hours={daily.settings.hours} />
          {daily.admin ? (
            <>
              <HabitsCard daily={daily} />
              <RemindersCard daily={daily} />
              <SkyCard daily={daily} />
              <WordsCard kind="lines" items={daily.settings.ownLines} />
              <WordsCard kind="questions" items={daily.settings.ownQuestions} />
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="lg" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function useReload() {
  const router = useRouter()
  return React.useCallback(() => router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID }), [router])
}

function HoursCard({ hours }: { hours: DayHours }) {
  const reload = useReload()
  const [draft, setDraft] = useSyncedDraft(hours)
  const [invalid, setInvalid] = React.useState<DayPart | null>(null)
  const [state, track] = useSaveLine()
  async function commit(part: DayPart) {
    if (draft[part] === hours[part]) return
    if (!TIME.test(draft[part])) {
      setInvalid(part)
      showErrorToast("Pick a time like 09:00.")
      return
    }
    if (!hoursInOrder(draft)) {
      setInvalid(part)
      showErrorToast("Morning has to start before afternoon, and afternoon before night.")
      return
    }
    if (await track(() => saveMyHours(draft))) await reload()
  }
  return (
    <Card size="sm">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Your hours</CardTitle>
        <SaveLine state={state} />
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {DAY_PARTS.map((part) => (
          <div key={part} className="grid gap-2">
            <Label htmlFor={`daily-hours-${part}`}>{DAY_PART_LABEL[part]} starts</Label>
            <Input
              id={`daily-hours-${part}`}
              type="time"
              value={draft[part]}
              aria-invalid={invalid === part || undefined}
              onChange={(event) => {
                setDraft({ ...draft, [part]: event.target.value })
                setInvalid(null)
              }}
              onBlur={() => void commit(part)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function SkyCard({ daily }: { daily: DailyCard }) {
  const reload = useReload()
  const [state, track] = useSaveLine()
  const { sky, ownSkies } = daily.settings
  async function save(next: { sky: SkyKind; own: Record<DayPart, string> }) {
    if (await track(() => saveMySky(next))) await reload()
  }
  return (
    <Card size="sm">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Sky</CardTitle>
        <SaveLine state={state} />
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="daily-sky">Behind the greeting</Label>
          <Select value={sky} onValueChange={(value) => void save({ sky: value as SkyKind, own: ownSkies })}>
            <SelectTrigger id="daily-sky" className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKY_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {SKY_LABEL[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {sky === "own" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {DAY_PARTS.map((part) => (
              <ImageUpload
                key={part}
                label={DAY_PART_LABEL[part]}
                value={ownSkies[part]}
                onChange={(value) => void save({ sky, own: { ...ownSkies, [part]: value } })}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RemindersCard({ daily }: { daily: DailyCard }) {
  const reload = useReload()
  const saved = daily.settings.reminders
  const [draft, setDraft] = useSyncedDraft(saved)
  const [state, track] = useSaveLine()
  async function save(next: typeof saved) {
    setDraft(next)
    if (await track(() => saveMyReminders(next))) await reload()
    else setDraft(saved)
  }
  return (
    <Card size="sm">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Reminders</CardTitle>
        <SaveLine state={state} />
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          A bell notice at this time if that routine still has habits not ticked.
        </p>
        {DAY_PARTS.map((part) => {
          const time = draft[part]
          return (
            <div key={part} className="flex flex-wrap items-center gap-3">
              <Switch
                id={`daily-reminder-${part}`}
                checked={time !== null}
                onCheckedChange={(on) =>
                  void save({ ...draft, [part]: on ? (saved[part] ?? { morning: "10:00", afternoon: "15:00", night: "21:00" }[part]) : null })
                }
              />
              <Label htmlFor={`daily-reminder-${part}`} className="w-24">
                {DAY_PART_LABEL[part]}
              </Label>
              {time !== null ? (
                <Input
                  type="time"
                  aria-label={`${DAY_PART_LABEL[part]} reminder time`}
                  className="w-36"
                  value={time}
                  onChange={(event) => setDraft({ ...draft, [part]: event.target.value })}
                  onBlur={() => {
                    if (draft[part] === saved[part]) return
                    if (!TIME.test(draft[part] ?? "")) {
                      showErrorToast("Pick a time like 09:00.")
                      return
                    }
                    void save(draft)
                  }}
                />
              ) : (
                <span className="text-sm text-muted-foreground">Off</span>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function WordsCard({ kind, items }: { kind: "lines" | "questions"; items: string[] }) {
  const reload = useReload()
  const saved = items.join("\n")
  const [draft, setDraft] = useSyncedDraft(saved)
  const [state, track] = useSaveLine()
  const id = `daily-own-${kind}`
  async function save() {
    const next = draft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    if (next.join("\n") === saved) return
    const max = kind === "lines" ? DAILY_LIMITS.ownLine : DAILY_LIMITS.ownQuestion
    if (next.some((line) => line.length > max)) {
      showErrorToast(`Each one can be at most ${max} characters.`)
      return
    }
    if (next.length > DAILY_LIMITS.ownLines) {
      showErrorToast(`Keep it to ${DAILY_LIMITS.ownLines} at most.`)
      return
    }
    if (await track(() => saveMyOwnWords({ kind, items: next }))) await reload()
  }
  return (
    <Card size="sm">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{kind === "lines" ? "Your own lines" : "Your own night questions"}</CardTitle>
        <SaveLine state={state} />
      </CardHeader>
      <CardContent className="grid gap-2">
        <Label htmlFor={id}>
          {kind === "lines"
            ? "One per line. Each morning shows one of them."
            : "One per line. Each night asks one of them."}
        </Label>
        <Textarea id={id} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => void save()} />
      </CardContent>
    </Card>
  )
}

// --- Habits ---------------------------------------------------------------------

function HabitsCard({ daily }: { daily: DailyCard }) {
  const reload = useReload()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const admin = daily.admin!
  const [adding, setAdding] = React.useState<DayPart | null>(null)
  const [editing, setEditing] = React.useState<string | null>(null)

  async function act(work: () => Promise<unknown>, done?: string) {
    if (await run(work, done)) await reload()
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Habits</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {admin.habits.length === 0 && admin.retired.length === 0 ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              No habits yet. Start from a sample morning, afternoon and night list and change it, or add your own below.
            </p>
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              disabled={busy}
              onClick={() => void act(() => addSampleRoutines(), "Added the sample routines.")}
            >
              Start from the samples
            </Button>
          </div>
        ) : null}
        {DAY_PARTS.map((part) => (
          <RoutineList
            key={part}
            part={part}
            habits={admin.habits.filter((habit) => habit.part === part)}
            editing={editing}
            onEdit={setEditing}
            adding={adding === part}
            onAdd={(on) => setAdding(on ? part : null)}
          />
        ))}
        {admin.retired.length ? (
          <div className="grid gap-2">
            <span className="text-sm font-medium">Retired</span>
            <ul className="grid gap-1">
              {admin.retired.map((habit) => (
                <li key={habit.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {habit.name} · {DAY_PART_LABEL[habit.part]}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void act(() => bringBackHabit(habit.id), `"${habit.name}" is back.`)}
                  >
                    <ArchiveRestoreIcon className="size-4" />
                    Bring back
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RoutineList({
  part,
  habits,
  editing,
  onEdit,
  adding,
  onAdd,
}: {
  part: DayPart
  habits: DailyHabit[]
  editing: string | null
  onEdit: (habitId: string | null) => void
  adding: boolean
  onAdd: (on: boolean) => void
}) {
  const reload = useReload()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const ids = habits.map((habit) => habit.id)
  const [order, setOrder] = useSyncedDraft(ids.join(","))
  const shown = order
    .split(",")
    .flatMap((id) => habits.find((habit) => habit.id === id) ?? [])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dndId = React.useId()

  function drop(event: DragEndEvent) {
    const overId = event.over?.id
    if (overId === undefined || overId === event.active.id) return
    const current = shown.map((habit) => habit.id)
    const next = arrayMove(current, current.indexOf(String(event.active.id)), current.indexOf(String(overId)))
    const before = order
    setOrder(next.join(","))
    void run(() => saveHabitOrder({ part, habitIds: next })).then((ok) => (ok ? reload() : setOrder(before)))
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">{DAY_PART_LABEL[part]}</span>
        {habits.length < DAILY_LIMITS.habitsPerPart ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onAdd(!adding)} aria-expanded={adding}>
            <PlusIcon className="size-4" />
            Add a habit
          </Button>
        ) : null}
      </div>
      {shown.length ? (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}>
          <SortableContext items={shown.map((habit) => habit.id)} strategy={verticalListSortingStrategy}>
            <ul className="grid gap-1" aria-label={`${DAY_PART_LABEL[part]} habits`}>
              {shown.map((habit) => (
                <HabitLine
                  key={habit.id}
                  habit={habit}
                  dragDisabled={busy || shown.length < 2}
                  editing={editing === habit.id}
                  onEdit={(on) => onEdit(on ? habit.id : null)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-muted-foreground">No {part} habits.</p>
      )}
      {adding ? <HabitEditor part={part} onDone={() => onAdd(false)} /> : null}
    </div>
  )
}

function habitSummary(habit: Pick<DailyHabit, "target" | "days" | "atTime">) {
  return [
    habit.target > 1 ? `${habit.target} a day` : null,
    habit.days.length ? habit.days.map((day) => WEEKDAY_SHORT[day]).join(" ") : "Every day",
    habit.atTime ? clockLabel(habit.atTime) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

function HabitLine({
  habit,
  dragDisabled,
  editing,
  onEdit,
}: {
  habit: DailyHabit
  dragDisabled: boolean
  editing: boolean
  onEdit: (on: boolean) => void
}) {
  const reload = useReload()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: habit.id,
    disabled: dragDisabled || editing,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  return (
    <li ref={setNodeRef} style={style} className={cn("grid gap-2 rounded-md border bg-background px-2 py-1.5", isDragging && "z-10 shadow-md")}>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              disabled={dragDisabled || editing}
              aria-label={`Drag ${habit.name} to change the order`}
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
        <HabitIconGlyph icon={habit.icon} className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm">
          {habit.name}
          <span className="text-muted-foreground"> · {habitSummary(habit)}</span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Change ${habit.name}`} aria-expanded={editing} onClick={() => onEdit(!editing)}>
              <SettingsIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Change it</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Retire ${habit.name}`}
              disabled={busy}
              onClick={() =>
                void run(() => retireMyHabit(habit.id), `Retired "${habit.name}". Its ticks are kept.`).then((ok) => {
                  if (ok) void reload()
                })
              }
            >
              <ArchiveIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Retire it and keep its ticks</TooltipContent>
        </Tooltip>
      </div>
      {editing ? <HabitEditor part={habit.part} habit={habit} onDone={() => onEdit(false)} /> : null}
    </li>
  )
}

/** A habit's name, part of the day, icon, how many a day, which days and an optional time. */
function HabitEditor({ part, habit, onDone }: { part: DayPart; habit?: DailyHabit; onDone: () => void }) {
  const reload = useReload()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const prefix = React.useId()
  const [name, setName] = React.useState(habit?.name ?? "")
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [where, setWhere] = React.useState<DayPart>(habit?.part ?? part)
  const [icon, setIcon] = React.useState<HabitIcon | null>(habit?.icon ?? null)
  const [target, setTarget] = React.useState(String(habit?.target ?? 1))
  const [days, setDays] = React.useState<number[]>(habit?.days ?? [])
  const [atTime, setAtTime] = React.useState(habit?.atTime ?? "")

  async function save() {
    const trimmed = name.trim()
    const count = Number(target)
    if (!trimmed) {
      setNameInvalid(true)
      showErrorToast("Name the habit.")
      return
    }
    if (!Number.isInteger(count) || count < 1 || count > DAILY_LIMITS.habitTarget) {
      showErrorToast(`How many a day is a number from 1 to ${DAILY_LIMITS.habitTarget}.`)
      return
    }
    if (atTime && !TIME.test(atTime)) {
      showErrorToast("Pick a time like 09:00, or leave it empty.")
      return
    }
    const input = { name: trimmed, part: where, icon, target: count, days, atTime: atTime || null }
    const ok = await run(
      () => (habit ? changeHabit({ habitId: habit.id, ...input }) : addHabit(input)),
      habit ? undefined : `Added "${trimmed}".`
    )
    if (!ok) return
    await reload()
    onDone()
  }

  return (
    <div className="grid gap-4 rounded-md border bg-muted/40 p-3">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-name`}>Habit</Label>
          <Input
            id={`${prefix}-name`}
            value={name}
            maxLength={DAILY_LIMITS.habitName}
            aria-invalid={nameInvalid || undefined}
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
              setNameInvalid(false)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save()
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-part`}>Part of the day</Label>
          <Select value={where} onValueChange={(value) => setWhere(value as DayPart)}>
            <SelectTrigger id={`${prefix}-part`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_PARTS.map((option) => (
                <SelectItem key={option} value={option}>
                  {DAY_PART_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-target`}>How many a day</Label>
          <Input
            id={`${prefix}-target`}
            type="number"
            min={1}
            max={DAILY_LIMITS.habitTarget}
            className="w-24"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-time`}>At a time (optional)</Label>
          <Input id={`${prefix}-time`} type="time" className="w-36" value={atTime} onChange={(event) => setAtTime(event.target.value)} />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Days</legend>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
            const on = days.includes(day)
            return (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((d) => d !== day) : [...days, day])}
              >
                {WEEKDAY_SHORT[day]}
              </Button>
            )
          })}
        </div>
        <span className="text-xs text-muted-foreground">{days.length ? "Only on the days picked." : "None picked is every day."}</span>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Icon</legend>
        <div className="flex flex-wrap gap-1">
          {HABIT_ICONS.map((option) => (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={icon === option ? "default" : "outline"}
                  aria-pressed={icon === option}
                  aria-label={HABIT_ICON_LOOK[option].label}
                  onClick={() => setIcon(icon === option ? null : option)}
                >
                  <HabitIconGlyph icon={option} className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{HABIT_ICON_LOOK[option].label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {habit ? "Save changes" : "Create habit"}
        </Button>
      </div>
    </div>
  )
}
