import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  closestCenter,
  useDroppable,
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
import { ArchiveIcon, ArchiveRestoreIcon, ChevronDownIcon, ClockIcon, EllipsisIcon, GripVerticalIcon, PencilIcon, PlusIcon } from "lucide-react"

import { PickRow } from "@/components/project/pick-rows"
import { SaveLine } from "@/components/project/save-line"
import { ShellIconPicker } from "@/components/settings/shell-icon-picker"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  addHabit,
  addSampleRoutines,
  bringBackHabit,
  changeHabit,
  retireMyHabit,
  saveHabitOrder,
  saveMyHiddenSections,
  saveMyHours,
  saveMySectionOrder,
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
  WEEKDAY_SHORT,
  type DailySection,
  type DayHours,
  type DayPart,
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

function useReload() {
  const router = useRouter()
  return React.useCallback(() => router.invalidate({ filter: (match) => match.routeId === DASHBOARD_ROUTE_ID }), [router])
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
export function DailySectionsSetting({ daily }: { daily: DailyCard }) {
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
    // The grey group heading, as every list in these menus has (Tyler, 6 Nov 2026).
    <section aria-label="Card layout" className="grid grid-cols-[minmax(0,1fr)] gap-2 px-4 py-3">
      <div className="flex items-center gap-2 px-0.5">
        <h3 className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">Card layout</h3>
        <SaveLine state={state} className="empty:hidden" />
      </div>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void drop(event)}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {/* Light grey, as every settings list is (Tyler, 6 Nov 2026: "The project app settings white bg needs to be change to light gray too"). */}
          <ul className="divide-y overflow-hidden rounded-xl border bg-muted/50" aria-label="Card layout">
            {order.map((name) => (
              <SectionRow key={name} name={name} hidden={hidden.includes(name)} onToggle={() => void toggle(name)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  )
}

/** When a section can show on the card: the next meeting stays away on a day off. */
const SECTION_WHEN: Record<DailySection, string> = {
  meeting: "Work days",
  routine: "All day",
  tomorrow: "Night only",
}

/**
 * A section in Card layout: dragged by its handle, and a switch that shows or
 * hides it on the card (Tyler, 6 Nov 2026, drawing it with a switch where the
 * eye was). Hidden is still kept as the account's list of hidden sections.
 */
function SectionRow({ name, hidden, onToggle }: { name: DailySection; hidden: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: name })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  const switchId = `daily-section-${name}`
  return (
    <li ref={setNodeRef} style={style} className={cn("flex items-center gap-3 px-3 py-2.5", isDragging && "relative z-10 bg-muted shadow-md")}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Drag ${DAILY_SECTION_LABEL[name]} to change the order`}
        className={cn("flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:text-foreground", focusRingInset)}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
      <label htmlFor={switchId} className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm">{DAILY_SECTION_LABEL[name]}</span>
        <span className="text-xs text-muted-foreground">{SECTION_WHEN[name]}</span>
      </label>
      <Switch id={switchId} checked={!hidden} onCheckedChange={onToggle} aria-label={`Show ${DAILY_SECTION_LABEL[name]} on the card`} />
    </li>
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

/**
 * An employee's own hours, a row in My settings → General: when their
 * morning, afternoon and night start. Three times, so the row opens a box.
 */
export function DailyHoursRow({ hours }: { hours: DayHours }) {
  const [state, track] = useSaveLine()
  const { inputProps } = useHours(hours, track)
  return (
    <PickRow label="Your hours" value={DAY_PARTS.map((part) => clockLabel(hours[part])).join(" · ")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">When your morning, afternoon and night start.</p>
        <SaveLine state={state} className="empty:hidden" />
      </div>
      {DAY_PARTS.map((part) => (
        <div key={part} className="grid gap-2">
          <Label htmlFor={`daily-hours-${part}`}>{DAY_PART_LABEL[part]} starts</Label>
          <Input id={`daily-hours-${part}`} {...inputProps(part)} />
        </div>
      ))}
    </PickRow>
  )
}

// --- Habits ---------------------------------------------------------------------

/** Each part's habit ids in their order, as one string, so a new load replaces a drag's draft. */
function orderKeyOf(habits: DailyHabit[]) {
  return DAY_PARTS.map((part) => habits.filter((habit) => habit.part === part).map((habit) => habit.id).join(",")).join("|")
}

function readOrderKey(key: string): Record<DayPart, string[]> {
  const lists = key.split("|").map((ids) => (ids ? ids.split(",") : []))
  return { morning: lists[0] ?? [], afternoon: lists[1] ?? [], night: lists[2] ?? [] }
}

/** A part's own list, so a habit can be dropped on a part with none yet. */
const PART_DROP = "part:"

/**
 * Routine habits in My settings → Daily card (Tyler, 6 Nov 2026, from his
 * drawing): each part of the day with its starting hour on the right, its
 * habits in a bordered list, and "Add habit" as the list's last line. A habit
 * drags to a new place in its part or into another part; its ⋯ changes or
 * retires it. Retired habits fold at the foot.
 */
export function DailyHabitsSetting({ daily }: { daily: DailyCard }) {
  const reload = useReload()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const admin = daily.admin!
  const [adding, setAdding] = React.useState<DayPart | null>(null)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [state, track] = useSaveLine()
  const { inputProps } = useHours(daily.settings.hours, track)
  // The order shows at once on a drop and goes back if the save is refused.
  const [orderKey, setOrderKey] = useSyncedDraft(orderKeyOf(admin.habits))
  const order = readOrderKey(orderKey)
  const byId = new Map(admin.habits.map((habit) => [habit.id, habit]))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dndId = React.useId()

  async function act(work: () => Promise<unknown>) {
    if (await run(work)) await reload()
  }

  function partOf(id: string): DayPart | null {
    if (id.startsWith(PART_DROP)) return id.slice(PART_DROP.length) as DayPart
    return DAY_PARTS.find((part) => order[part].includes(id)) ?? null
  }

  async function drop(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || overId === activeId) return
    const from = partOf(activeId)
    const to = partOf(overId)
    const habit = byId.get(activeId)
    if (!from || !to || !habit) return
    const next = { ...order, [from]: order[from].filter((id) => id !== activeId) }
    if (from === to) {
      next[to] = arrayMove(order[to], order[to].indexOf(activeId), order[to].indexOf(overId))
    } else {
      if (order[to].length >= DAILY_LIMITS.habitsPerPart) {
        showErrorToast(`${DAY_PART_LABEL[to]} already has ${DAILY_LIMITS.habitsPerPart} habits.`)
        return
      }
      const at = overId.startsWith(PART_DROP) ? order[to].length : order[to].indexOf(overId)
      next[to] = [...order[to].slice(0, at), activeId, ...order[to].slice(at)]
    }
    const before = orderKey
    setOrderKey(DAY_PARTS.map((part) => next[part].join(",")).join("|"))
    const ok = await track(async () => {
      if (from !== to) {
        await changeHabit({
          habitId: habit.id,
          name: habit.name,
          part: to,
          icon: habit.icon,
          target: habit.target,
          days: habit.days,
          atTime: habit.atTime,
        })
      }
      await saveHabitOrder({ part: to, habitIds: next[to] })
    })
    if (ok) await reload()
    else setOrderKey(before)
  }

  return (
    // No title or line of its own (Tyler, 6 Nov 2026: ""Routine habits / Drag habits to
    // reorder ..." remove this"): the parts' own headings say what it is.
    <section aria-label="Routine habits" className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 py-3">
      <SaveLine state={state} className="-mb-2 justify-self-end empty:hidden" />
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
              onClick={() => void act(() => addSampleRoutines())}
            >
              Start from the samples
            </Button>
          </div>
        ) : null}
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void drop(event)}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            {DAY_PARTS.map((part) => (
              <PartList
                key={part}
                part={part}
                hours={inputProps(part)}
                habits={order[part].flatMap((id) => byId.get(id) ?? [])}
                dragDisabled={busy}
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
          </div>
        </DndContext>
        {admin.retired.length ? (
          <RetiredHabits retired={admin.retired} busy={busy} onBringBack={(habit) => void act(() => bringBackHabit(habit.id))} />
        ) : null}
      </HabitSave.Provider>
    </section>
  )
}

/** Retired habits at the foot of Routine habits, folded until opened; each can come back. */
function RetiredHabits({
  retired,
  busy,
  onBringBack,
}: {
  retired: NonNullable<DailyCard["admin"]>["retired"]
  busy: boolean
  onBringBack: (habit: { id: string; name: string }) => void
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard("project-my-settings-retired"), false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-1">
      <CollapsibleTrigger asChild>
        <button type="button" className={cn("flex w-full items-center gap-2 rounded-md text-left text-sm font-medium", focusRingInset)}>
          <span>Retired habits</span>
          <span className="text-muted-foreground tabular-nums">{retired.length}</span>
          <ChevronDownIcon className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent data-collapse-key={noFlashKey}>
        <ul className="grid gap-1 pt-2">
          {retired.map((habit) => (
            <li key={habit.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {habit.name} · {DAY_PART_LABEL[habit.part]}
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onBringBack(habit)}>
                <ArchiveRestoreIcon className="size-4" />
                Bring back
              </Button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * One part of the day: its name, and its starting hour on the right with a
 * clock (Tyler, 31 Oct 2026: "put the hours selection beside the label"), then
 * its habits in one bordered list ending in Add habit. An empty part's list is
 * only "Add afternoon habit", and a habit dragged onto it lands there.
 */
function PartList({
  part,
  hours,
  habits,
  dragDisabled,
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
  dragDisabled: boolean
  editing: string | null
  onEdit: (habitId: string | null) => void
  adding: boolean
  onAdd: (on: boolean) => void
  onAdded: (habitId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${PART_DROP}${part}` })
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {/* The grey group heading every list uses, and its hour right beside it (Tyler, 6 Nov
          2026: "the label is not following standard of gray shade", then "Move the time
          beside the label"). */}
      <div className="flex items-center gap-1.5 px-0.5 text-sm font-medium text-muted-foreground">
        <span>{DAY_PART_LABEL[part]}</span>
        <ClockIcon className="ml-1 size-3.5 shrink-0" aria-hidden />
        <Input
          aria-label={`${DAY_PART_LABEL[part]} starts`}
          className="h-7 w-[5.5rem] rounded-md border-0 bg-transparent px-1 text-sm font-normal text-muted-foreground shadow-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-0 dark:bg-transparent [&::-webkit-calendar-picker-indicator]:hidden"
          {...hours}
        />
      </div>
      <SortableContext items={habits.map((habit) => habit.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          aria-label={`${DAY_PART_LABEL[part]} habits`}
          className={cn("divide-y overflow-hidden rounded-xl border bg-muted/50", isOver && "ring-2 ring-ring/40")}
        >
          {habits.map((habit) => (
            <HabitLine
              key={habit.id}
              habit={habit}
              dragDisabled={dragDisabled}
              editing={editing === habit.id}
              onEdit={(on) => onEdit(on ? habit.id : null)}
            />
          ))}
          {habits.length < DAILY_LIMITS.habitsPerPart ? (
            <li>
              {adding ? (
                <NewHabit part={part} onAdded={onAdded} onCancel={() => onAdd(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => onAdd(true)}
                  className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground", focusRingInset)}
                >
                  {/* Under the icons above it, so the words line up with the names. */}
                  <span className="flex w-[4.5rem] shrink-0 justify-end pr-2.5">
                    <PlusIcon className="size-4" aria-hidden />
                  </span>
                  {habits.length ? "Add habit" : `Add ${part} habit`}
                </button>
              )}
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </div>
  )
}

/**
 * How many a day and when, after a habit's name. Its days are left out, set in
 * its own form (Tyler, 6 Nov 2026: "Remove these dates").
 */
function habitSummary(habit: Pick<DailyHabit, "target" | "atTime">) {
  return [habit.target > 1 ? `${habit.target}× a day` : null, habit.atTime ? clockLabel(habit.atTime) : null]
    .filter(Boolean)
    .join(" · ")
}

/**
 * A habit's line: its handle, its icon on a grey tile (pressing it opens the
 * icon picker, Tyler, 31 Oct 2026), its name with how many a day, and a ⋯ to
 * change or retire it. Its form opens under it.
 */
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
  const summary = habitSummary(habit)
  return (
    <li ref={setNodeRef} style={style} className={cn("grid gap-3 px-3 py-2.5", isDragging && "relative z-10 bg-muted shadow-md")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          disabled={dragDisabled || editing}
          aria-label={`Drag ${habit.name} to change the order or part of the day`}
          className={cn(
            "flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:text-foreground disabled:cursor-default disabled:opacity-50",
            focusRingInset
          )}
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
        {/* The shell's picker, drawn as a grey tile from here so its own file stays as it is. */}
        <span className="shrink-0 [&>button]:size-9 [&>button]:rounded-lg [&>button]:bg-background [&>button]:hover:bg-background/70">
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
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {habit.name}
          {summary ? <span className="ml-2 text-xs text-muted-foreground">{summary}</span> : null}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`${habit.name} options`} className="text-muted-foreground">
              <EllipsisIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(!editing)}>
              <PencilIcon className="size-4" />
              {editing ? "Close the form" : "Change"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() =>
                void run(() => retireMyHabit(habit.id)).then((ok) => {
                  if (ok) void reload()
                })
              }
            >
              <ArchiveIcon className="size-4" />
              Retire, keeping its ticks
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {editing ? <HabitEditor habit={habit} /> : null}
    </li>
  )
}

/**
 * A new habit, typed in the list's last line: its name and Add, the one button
 * here, since a habit has to exist before it can save itself. It is added with
 * no icon, once a day, every day, and its form opens for the rest. Escape
 * puts "Add habit" back.
 */
function NewHabit({ part, onAdded, onCancel }: { part: DayPart; onAdded: (habitId: string) => void; onCancel: () => void }) {
  const reload = useReload()
  const track = React.useContext(HabitSave)
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
    // Escape here closes this box only, not My settings around it (`data-own-escape`).
    <form data-own-escape="" className="flex items-center gap-2 px-3 py-2" onSubmit={(event) => void add(event)}>
      <Input
        aria-label={`New ${part} habit`}
        placeholder={`New ${part} habit`}
        value={name}
        maxLength={DAILY_LIMITS.habitName}
        aria-invalid={invalid || undefined}
        autoFocus
        className="h-8 min-w-0 flex-1"
        onChange={(event) => {
          setName(event.target.value)
          setInvalid(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
        }}
      />
      <Button type="submit" size="sm" disabled={busy}>
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
      {/* The name, then part of the day and time side by side (Tyler, 31 Oct 2026: "put
          the optional time to the top row"), then how many and the days side by side
          ("move the days picker where it was"). Since 6 Nov 2026 it sits in My settings,
          too narrow for all three on one row, so the name has a row of its own. */}
      <div className="grid grid-cols-2 items-start gap-4">
        <div className="col-span-2 grid gap-2">
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
            value={atTime}
            onChange={(event) => setAtTime(event.target.value)}
            onBlur={saveTime}
          />
        </div>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
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
