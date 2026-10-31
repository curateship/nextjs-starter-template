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
import { ArchiveIcon, ArchiveRestoreIcon, ChevronDown, EyeIcon, EyeOffIcon, GripVerticalIcon, PlusIcon, SettingsIcon } from "lucide-react"

import { IntentionBox } from "@/components/project/daily-journal"
import { SaveLine } from "@/components/project/save-line"
import { ShellIconPicker } from "@/components/settings/shell-icon-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
  saveMyHiddenSections,
  saveMyHours,
  saveMyOwnWords,
  saveMySectionOrder,
  saveMyReminders,
  saveMySky,
  type DailyCard,
  type DailyHabit,
} from "@/lib/api/project/daily-card"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import {
  DAILY_LIMITS,
  DAILY_SECTION_LABEL,
  DAY_PART_LABEL,
  DAY_PARTS,
  hoursInOrder,
  SKY_KINDS,
  SKY_LABEL,
  WEEKDAY_SHORT,
  type DailySection,
  type DayHours,
  type DayPart,
  type SkyKind,
} from "@/lib/project/daily-card"
import { clockLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

const DASHBOARD_ROUTE_ID = "/_authenticated/dashboard"

/** The Habits card's save sign, which every habit change reports to. */
const HabitSave = React.createContext<(work: () => Promise<unknown>) => Promise<boolean>>(async () => false)
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
              ? "Your habits and hours, sky, reminders and words. Only you see your habits and journal."
              : "When your morning, afternoon and night start."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {daily.admin ? <TodayCard daily={daily} /> : null}
          {daily.admin ? <SectionsCard daily={daily} /> : null}
          {/* The site admin sets these beside each part in Habits instead (Tyler, 31 Oct
              2026: "put the hours selection beside the label"). */}
          {daily.admin ? null : <HoursCard hours={daily.settings.hours} />}
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

/**
 * One card in this window, folding to its title: press the title, or the
 * arrow that shows while it is pointed at, and this browser remembers it
 * (Tyler, 30 Oct 2026: "add collasiple to cards in modal too").
 */
function FoldCard({
  id,
  title,
  action,
  contentClassName,
  children,
}: {
  id: string
  title: React.ReactNode
  action?: React.ReactNode
  contentClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard(`project-daily-window-${id}`))
  return (
    // Around the card, never merged onto it: merged, the folding part's own name
    // replaced the card's, and the window's card border and colour stopped applying
    // (Tyler, 30 Oct 2026: "why did you change the borders in modal cards").
    <Collapsible open={open} onOpenChange={setOpen} className="group/fold">
      <Card size="sm">
        <CardHeader className="flex items-center gap-2">
          <CardTitle className="min-w-0 flex-1">
            <CollapsibleTrigger asChild>
              <button type="button" className={cn("flex w-full cursor-pointer items-center rounded-md text-left select-none", focusRingInset)}>
                {title}
              </button>
            </CollapsibleTrigger>
          </CardTitle>
          {action}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity group-hover/fold:opacity-100 group-has-[:focus-visible]/fold:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/fold:-rotate-90" />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent data-collapse-key={noFlashKey}>
          <CardContent className={contentClassName}>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

/**
 * The Daily card's sections, dragged into the order the panel shows them in,
 * kept in the site admin's account (Tyler, 30 Oct 2026: "whats the point of
 * dragging the cards in the modal if its not reflected in the panel?"; he
 * picked the account over this browser, and the window's own cards back in a
 * fixed order). The eye hides a section from the card and brings it back
 * (Tyler, 31 Oct 2026: "Add an eye icon to the sections ... for me to hide or
 * unhide a section"), also kept in the account.
 */
function SectionsCard({ daily }: { daily: DailyCard }) {
  const reload = useReload()
  const [order, setOrder] = useSyncedDraft(daily.settings.sections)
  const [hidden, setHidden] = useSyncedDraft(daily.settings.hidden)
  const [state, track] = useSaveLine()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dndId = React.useId()
  async function drop(event: DragEndEvent) {
    const overId = event.over?.id
    if (overId === undefined || overId === event.active.id) return
    const before = order
    const next = arrayMove(order, order.indexOf(event.active.id as DailySection), order.indexOf(overId as DailySection))
    setOrder(next)
    if (await track(() => saveMySectionOrder({ order: next }))) await reload()
    else setOrder(before)
  }
  async function toggle(name: DailySection) {
    const before = hidden
    const next = hidden.includes(name) ? hidden.filter((other) => other !== name) : [...hidden, name]
    setHidden(next)
    if (await track(() => saveMyHiddenSections({ hidden: next }))) await reload()
    else setHidden(before)
  }
  return (
    <FoldCard
      id="sections"
      title="Sections"
      contentClassName="grid gap-2"
      action={<SaveLine state={state} />}
    >
      <p className="text-sm text-muted-foreground">Drag to set the order they show in on the card, and use the eye to hide one. Some show only at one part of the day.</p>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void drop(event)}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="grid gap-1.5" aria-label="Sections">
            {order.map((name) => (
              <SectionRow key={name} name={name} hidden={hidden.includes(name)} onToggle={() => void toggle(name)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </FoldCard>
  )
}

function SectionRow({ name, hidden, onToggle }: { name: DailySection; hidden: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: name })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  return (
    <li ref={setNodeRef} style={style} className={cn("flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm", isDragging && "z-10 shadow-md")}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Drag ${DAILY_SECTION_LABEL[name]} to change the order`}
        className={cn("flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground", focusRingInset)}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
      <span className={cn("min-w-0 flex-1 truncate", hidden && "text-muted-foreground line-through")}>{DAILY_SECTION_LABEL[name]}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={hidden}
        aria-label={`${hidden ? "Show" : "Hide"} ${DAILY_SECTION_LABEL[name]} on the card`}
        className={cn("flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground", focusRingInset)}
      >
        {hidden ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
      </button>
    </li>
  )
}

/**
 * Today's intention, open to change at any time of day here, while the card
 * itself offers the box in the morning only (Tyler, 30 Oct 2026: "It should
 * be edible in the modal", of the "Today I want to..." box).
 */
function TodayCard({ daily }: { daily: DailyCard }) {
  return (
    <FoldCard
      id="today"
      title="Today"
    >
      <IntentionBox day={daily.cardDay} label="Today I want to..." value={daily.admin?.today.intention ?? ""} />
    </FoldCard>
  )
}

/**
 * When morning, afternoon and night start, each saved on leaving its box. The
 * employee's Your hours card and the site admin's Habits card both use it.
 */
function useHours(hours: DayHours, track: (work: () => Promise<unknown>) => Promise<boolean>) {
  const reload = useReload()
  const [draft, setDraft] = useSyncedDraft(hours)
  const [invalid, setInvalid] = React.useState<DayPart | null>(null)
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
  return {
    inputProps: (part: DayPart) => ({
      type: "time",
      value: draft[part],
      "aria-invalid": invalid === part || undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setDraft({ ...draft, [part]: event.target.value })
        setInvalid(null)
      },
      onBlur: () => void commit(part),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") event.currentTarget.blur()
      },
    }),
  }
}

function HoursCard({ hours }: { hours: DayHours }) {
  const [state, track] = useSaveLine()
  const { inputProps } = useHours(hours, track)
  return (
    <FoldCard
      id="hours"
      title="Your hours"
      contentClassName="grid gap-4 sm:grid-cols-3"
      action={<SaveLine state={state} />}
    >
      {DAY_PARTS.map((part) => (
        <div key={part} className="grid gap-2">
          <Label htmlFor={`daily-hours-${part}`}>{DAY_PART_LABEL[part]} starts</Label>
          <Input id={`daily-hours-${part}`} {...inputProps(part)} />
        </div>
      ))}
    </FoldCard>
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
    <FoldCard
      id="sky"
      title="Sky"
      contentClassName="grid gap-4"
      action={<SaveLine state={state} />}
    >
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
    </FoldCard>
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
    <FoldCard
      id="reminders"
      title="Reminders"
      contentClassName="grid gap-4"
      action={<SaveLine state={state} />}
    >
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
    </FoldCard>
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
    <FoldCard
      id={`words-${kind}`}
      title={kind === "lines" ? "Your own lines" : "Your own night questions"}
      contentClassName="grid gap-2"
      action={<SaveLine state={state} />}
    >
      <Label htmlFor={id}>
        {kind === "lines"
          ? "One per line. Each morning shows one of them."
          : "One per line. Each night asks one of them."}
      </Label>
      <Textarea id={id} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => void save()} />
    </FoldCard>
  )
}

// --- Habits ---------------------------------------------------------------------

function HabitsCard({ daily }: { daily: DailyCard }) {
  const reload = useReload()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const admin = daily.admin!
  const [adding, setAdding] = React.useState<DayPart | null>(null)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [state, track] = useSaveLine()
  const { inputProps } = useHours(daily.settings.hours, track)

  async function act(work: () => Promise<unknown>, done?: string) {
    if (await run(work, done)) await reload()
  }

  return (
    <FoldCard
      id="habits"
      title="Habits"
      contentClassName="grid gap-4"
      action={<SaveLine state={state} />}
    >
      <HabitSave.Provider value={track}>
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
            hours={inputProps(part)}
            habits={admin.habits.filter((habit) => habit.part === part)}
            editing={editing}
            // One habit form open at a time.
            onEdit={(id) => {
              setEditing(id)
              if (id) setAdding(null)
            }}
            adding={adding === part}
            onAdd={(on) => {
              setAdding(on ? part : null)
              if (on) setEditing(null)
            }}
            // A new habit opens its form, so the rest of it can be set.
            onAdded={(id) => {
              setAdding(null)
              setEditing(id)
            }}
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
      </HabitSave.Provider>
    </FoldCard>
  )
}

function RoutineList({
  part,
  hours,
  habits,
  editing,
  onEdit,
  adding,
  onAdd,
  onAdded,
}: {
  part: DayPart
  /** The box for when this part starts, the same hour as Your hours. */
  hours: React.ComponentProps<typeof Input>
  habits: DailyHabit[]
  editing: string | null
  onEdit: (habitId: string | null) => void
  adding: boolean
  onAdd: (on: boolean) => void
  onAdded: (habitId: string) => void
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
        <span className="text-sm font-medium">{DAY_PART_LABEL[part]}</span>
        {/* When this part starts, shown beside its name on the card (Tyler, 31 Oct 2026:
            "put the hours selection beside the label"). */}
        <Input aria-label={`${DAY_PART_LABEL[part]} starts`} className="h-8 w-32" {...hours} />
        <span className="flex-1" />
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
      {adding ? <NewHabit part={part} onAdded={onAdded} /> : null}
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
  const track = React.useContext(HabitSave)
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
        {/* Pressing the icon opens the shell's icon picker and saves the pick at once
            (Tyler, 31 Oct 2026: "clicking the icon here should open up the icon picker"). */}
        <ShellIconPicker
          compact
          ghost
          allowEmpty
          value={habit.icon ?? undefined}
          onValueChange={(icon) =>
            void track(() =>
              changeHabit({
                habitId: habit.id,
                name: habit.name,
                part: habit.part,
                icon: icon ?? null,
                target: habit.target,
                days: habit.days,
                atTime: habit.atTime,
              })
            ).then((ok) => {
              if (ok) void reload()
            })
          }
        />
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
      {editing ? <HabitEditor habit={habit} /> : null}
    </li>
  )
}

/**
 * A new habit: its name and Add, the one button the window keeps, since a
 * habit has to exist before it can save itself. It is added with no icon,
 * once a day, every day, and its form opens for the rest.
 */
function NewHabit({ part, onAdded }: { part: DayPart; onAdded: (habitId: string) => void }) {
  const reload = useReload()
  const track = React.useContext(HabitSave)
  const prefix = React.useId()
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setInvalid(true)
      showErrorToast("Name the habit.")
      return
    }
    setBusy(true)
    let id = ""
    const ok = await track(async () => {
      id = (await addHabit({ name: trimmed, part, icon: null, target: 1, days: [], atTime: null })).id
    })
    setBusy(false)
    if (!ok) return
    await reload()
    onAdded(id)
  }

  return (
    <form className="flex items-end gap-2 rounded-md border bg-muted/40 p-3" onSubmit={(event) => void add(event)}>
      <div className="grid min-w-0 flex-1 gap-2">
        <Label htmlFor={`${prefix}-name`}>New {part} habit</Label>
        <Input
          id={`${prefix}-name`}
          value={name}
          maxLength={DAILY_LIMITS.habitName}
          aria-invalid={invalid || undefined}
          autoFocus
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
      <Button type="submit" disabled={busy}>
        <PlusIcon className="size-4" />
        Add
      </Button>
    </form>
  )
}

/**
 * A habit's name, part of the day, time, how many a day and which days. Each
 * saves itself like the rest of the window, so it has no Save or Cancel
 * (Tyler, 31 Oct 2026: "the save changes and then done makes no sense. its
 * not following modal standard"): a pick at once, the name and the count
 * when their box is left or Enter is pressed, the time when its box is left.
 * Its icon is picked on its row; none picked is every day.
 */
function HabitEditor({ habit }: { habit: DailyHabit }) {
  const reload = useReload()
  const track = React.useContext(HabitSave)
  const prefix = React.useId()
  const [name, setName] = React.useState(habit.name)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [where, setWhere] = React.useState<DayPart>(habit.part)
  const [target, setTarget] = React.useState(String(habit.target))
  const [targetInvalid, setTargetInvalid] = React.useState(false)
  const [days, setDays] = React.useState<number[]>(habit.days)
  const [atTime, setAtTime] = React.useState(habit.atTime ?? "")
  // What this form has sent so far, so a second change made before the first
  // comes back builds on it instead of putting the first back.
  const sent = React.useRef({ name: habit.name, part: habit.part, target: habit.target, days: habit.days, atTime: habit.atTime })

  /**
   * The habit with this change, saved; the change goes back if refused. The
   * icon comes from the row, where it is picked.
   */
  async function save(change: Partial<typeof sent.current>, undo: () => void) {
    const before = sent.current
    sent.current = { ...before, ...change }
    if (await track(() => changeHabit({ habitId: habit.id, icon: habit.icon, ...sent.current }))) {
      await reload()
      return
    }
    sent.current = before
    undo()
  }

  function saveName() {
    const trimmed = name.trim()
    if (trimmed === sent.current.name) return
    if (!trimmed) {
      setNameInvalid(true)
      showErrorToast("Name the habit.")
      return
    }
    void save({ name: trimmed }, () => setName(sent.current.name))
  }

  function saveTarget() {
    const count = Number(target)
    if (count === sent.current.target) return
    if (!Number.isInteger(count) || count < 1 || count > DAILY_LIMITS.habitTarget) {
      setTargetInvalid(true)
      showErrorToast(`How many a day is a number from 1 to ${DAILY_LIMITS.habitTarget}.`)
      return
    }
    void save({ target: count }, () => setTarget(String(sent.current.target)))
  }

  function saveTime() {
    if ((atTime || null) === sent.current.atTime) return
    if (atTime && !TIME.test(atTime)) {
      showErrorToast("Pick a time like 09:00, or leave it empty.")
      return
    }
    void save({ atTime: atTime || null }, () => setAtTime(sent.current.atTime ?? ""))
  }

  return (
    <div className="grid gap-4 rounded-md border bg-muted/40 p-3">
      {/* The name, part of the day and time on top (Tyler, 31 Oct 2026: "put the
          optional time to the top row"), then how many and the days side by side
          ("move the days picker where it was"). */}
      <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-name`}>Habit</Label>
          <Input
            id={`${prefix}-name`}
            value={name}
            maxLength={DAILY_LIMITS.habitName}
            aria-invalid={nameInvalid || undefined}
            onChange={(event) => {
              setName(event.target.value)
              setNameInvalid(false)
            }}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveName()
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-part`}>Part of the day</Label>
          <Select
            value={where}
            onValueChange={(value) => {
              const next = value as DayPart
              setWhere(next)
              void save({ part: next }, () => setWhere(sent.current.part))
            }}
          >
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
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-time`}>At a time (optional)</Label>
          <Input
            id={`${prefix}-time`}
            type="time"
            className="w-32"
            value={atTime}
            onChange={(event) => setAtTime(event.target.value)}
            onBlur={saveTime}
          />
        </div>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-target`}>How many a day</Label>
          <Input
            id={`${prefix}-target`}
            type="number"
            min={1}
            max={DAILY_LIMITS.habitTarget}
            className="w-24"
            value={target}
            aria-invalid={targetInvalid || undefined}
            onChange={(event) => {
              setTarget(event.target.value)
              setTargetInvalid(false)
            }}
            onBlur={saveTarget}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveTarget()
            }}
          />
        </div>
        {/* A label like the others, not a legend, so it lines up with them
            (Tyler, 31 Oct 2026: "this is not aligned"). */}
        <div role="group" aria-labelledby={`${prefix}-days`} className="grid min-w-0 gap-2">
          <Label id={`${prefix}-days`}>Days</Label>
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
                  onClick={() => {
                    const next = on ? days.filter((d) => d !== day) : [...days, day]
                    setDays(next)
                    void save({ days: next }, () => setDays(sent.current.days))
                  }}
                >
                  {WEEKDAY_SHORT[day]}
                </Button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
