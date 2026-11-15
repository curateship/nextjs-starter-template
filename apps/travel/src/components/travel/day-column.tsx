import * as React from "react"
import { useDroppable } from "@dnd-kit/core"
import { useSortable } from "@dnd-kit/sortable"
import {
  ArrowLeftIcon,
  ChevronsLeftRightIcon,
  ChevronsRightLeftIcon,
  CopyIcon,
  EllipsisIcon,
  Loader2Icon,
  PlusIcon,
  RouteIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { useTrip } from "@/components/travel/trip-context"
import { Button } from "@/components/ui/button"
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
import { Meter } from "@/components/ui/meter"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { addTripDay, removeTripDay } from "@/lib/api/travel/days"
import { saveDayInfo } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { FULL_DAY_MINUTES, formatMinutes } from "@/lib/travel/board"
import { formatDayDate } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { MAX_TRIP_DAYS, type DayInfo } from "@/lib/travel/rules"
import { cn } from "@/lib/utils"

/** A day column's drag id is its key after this, so it never meets a card's or a drop area's. */
export const COLUMN_DRAG = "column-drag|"

const COLUMN_WIDTH = 256
const FOLDED_WIDTH = 40
export const COLUMN_GAP = 12

/**
 * One column of the board. A day's heading reads "Day 2 · Tue 4 Mar · Kyoto"
 * (task part 7), the date only on a dated trip, with the day's note under it.
 * The description is written in place. The heading drags the whole
 * day to another place (task part 10), and its menu adds a day after, copies
 * the day onto another (task part 11) or removes it. The arrows, or a
 * double-click on the heading, fold it to a thin strip (task part 12 and
 * "Misc"). Ideas has its "+", its eye and its saved places.
 */
export function DayColumn({
  id,
  day,
  date,
  info,
  isToday,
  folded,
  fullWidth = false,
  count,
  onFold,
  onCopyDay,
  onBestOrder,
  onFillDay,
  readOnly = false,
  planned = null,
  addButton,
  children,
}: {
  /** The column's drop id: "ideas" or "day-3". */
  id: string
  day: number | null
  date: string | null
  info: DayInfo | null
  isToday: boolean
  folded: boolean
  /** On a phone the one day shown takes the whole width (task part 46). */
  fullWidth?: boolean
  count: number
  onFold: () => void
  onCopyDay: (to: number) => void
  /** Puts the day's untimed cards in the quickest order to get round (Travel features part 5). */
  onBestOrder: () => void
  /** Asks AI for sights and meals in the day's free time (More Travel features part 6). */
  onFillDay: () => void
  /** No signal: no menu, no moving the day, and its description shows but doesn't edit. */
  readOnly?: boolean
  /** Minutes the day's timed cards fill, for How full each day is (Travel features 3, part 8). Null on Ideas. */
  planned?: number | null
  addButton: React.ReactNode
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const sortable = useSortable({ id: day === null ? `${id}-fixed` : COLUMN_DRAG + id, disabled: day === null || readOnly })
  const headingId = `board-column-${id}`
  const label = day === null ? "Ideas" : `Day ${day}`

  if (folded) {
    return (
      <section
        ref={(node) => {
          setNodeRef(node)
          sortable.setNodeRef(node)
        }}
        aria-labelledby={headingId}
        data-day-column={id}
        data-folded=""
        style={{ width: FOLDED_WIDTH }}
        className={cn(
          "flex min-h-56 shrink-0 flex-col items-center gap-2 rounded-lg border bg-muted/40 py-2",
          isOver && "ring-2 ring-ring",
          isToday && "border-foreground"
        )}
      >
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Unfold ${label}`} onClick={onFold}>
          <ChevronsLeftRightIcon className="size-4" />
        </Button>
        <h3 id={headingId} className="text-sm font-medium whitespace-nowrap [writing-mode:vertical-rl]">
          {label}
          {date ? <span className="font-normal text-muted-foreground"> · {formatDayDate(date)}</span> : null}
        </h3>
      </section>
    )
  }

  return (
    <section
      ref={(node) => {
        setNodeRef(node)
        sortable.setNodeRef(node)
      }}
      aria-labelledby={headingId}
      data-day-column={id}
      data-today={isToday ? "" : undefined}
      style={{
        width: fullWidth ? "100%" : COLUMN_WIDTH,
        ...(sortable.transform
          ? { transform: `translate3d(${sortable.transform.x}px, 0, 0)`, transition: sortable.transition }
          : {}),
      }}
      className={cn(
        "group/column flex min-h-56 shrink-0 flex-col gap-2 rounded-lg border bg-muted/40 p-2",
        isOver && "ring-2 ring-ring",
        isToday && "border-foreground bg-card ring-1 ring-foreground",
        // The column being moved floats over the others as they make room.
        sortable.isDragging && "relative z-10 shadow-lg"
      )}
    >
      <div
        // 4px more under the heading than between cards, so the day's name and description read as a heading
        // (Tyler, 3 Nov 2026: "add some spacing here").
        className={cn("mb-1 flex min-h-7 items-start gap-1", day !== null && !readOnly && "cursor-grab active:cursor-grabbing")}
        // The heading is the handle; its buttons still click, since a drag starts only after 8px.
        {...(day !== null && !readOnly ? sortable.listeners : {})}
        // A double-click on the heading folds the day (task "Misc").
        onDoubleClick={day !== null ? onFold : undefined}
        aria-roledescription={day !== null ? "movable day" : undefined}
      >
        <div className="grid min-w-0 flex-1 gap-0.5">
          {day === null ? (
            <h3 id={headingId} className="flex items-center gap-2 px-1 pt-1 text-sm font-medium">
              Ideas
            </h3>
          ) : (
            <DayHeading
              headingId={headingId}
              day={day}
              date={date}
              info={info ?? { note: "" }}
              isToday={isToday}
              readOnly={readOnly}
            />
          )}
        </div>
        {day !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Fold ${label}`}
            className="opacity-0 group-hover/column:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={onFold}
          >
            <ChevronsRightLeftIcon className="size-4" />
          </Button>
        ) : null}
        {addButton}
        {day !== null && !readOnly ? <DayMenu day={day} count={count} onCopyDay={onCopyDay} onBestOrder={onBestOrder} onFillDay={onFillDay} /> : null}
      </div>
      {day !== null && planned !== null ? <DayFullness label={label} minutes={planned} /> : null}
      {children}
    </section>
  )
}

/**
 * How full the day is (Travel features 3, part 8; Tyler, 5 Nov 2026: "12
 * hours, warn past it"): a thin bar of the timed cards' hours against 12,
 * in the warning colour past 12. The hours show on hover.
 */
function DayFullness({ label, minutes }: { label: string; minutes: number }) {
  const over = minutes > FULL_DAY_MINUTES
  const text = minutes ? `${formatMinutes(minutes)} of 12h planned${over ? ", more than 12 hours" : ""}` : "Nothing timed yet"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="-mt-1 px-1 py-1" tabIndex={0} aria-label={`${label}: ${text}`}>
          <Meter value={minutes} max={FULL_DAY_MINUTES} size="sm" tone={over ? "warning" : "muted"} label={`${label} planned`} valueText={text} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * "Day 2 · Thu 3 Dec", then the day's description, written in place (task "Misc": "Remove clicking the
 * title dropdown instead add inline discription there"); each saves when it's
 * left or on Enter, and Escape puts it back.
 */
function DayHeading({
  headingId,
  day,
  date,
  info,
  isToday,
  readOnly,
}: {
  headingId: string
  day: number
  date: string | null
  info: DayInfo
  isToday: boolean
  readOnly: boolean
}) {
  const { page, refresh } = useTrip()
  const [run] = useAsyncAction(getTravelErrorMessage)
  const save = (patch: Partial<DayInfo>) =>
    run(async () => {
      await saveDayInfo({ tripId: page.trip.id, day, note: info.note, ...patch })
      await refresh()
    })

  return (
    <div className="grid min-w-0 gap-0.5 px-1 pt-1">
      {/* "Day 3 · Tue 19 Jan": the date beside the day's name, in place of the count and the old city line
          (Tyler, 3 Nov 2026: "Move the date here so it'll look like Day 3 - Tue 19 Jan", "Remove this text"). */}
      <h3 id={headingId} className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
        <span className="shrink-0">Day {day}</span>
        {/* A size under the day's name (Tyler, 3 Nov 2026: "Reduce the date font size a bit"). */}
        {date ? <span className="truncate text-xs font-normal text-muted-foreground">· {formatDayDate(date)}</span> : null}
        {isToday ? <span className="shrink-0 text-xs font-medium">· Today</span> : null}
      </h3>
      {readOnly ? (
        info.note ? <p className="line-clamp-2 text-xs break-words text-muted-foreground">{info.note}</p> : null
      ) : <InlineText
        label={`Day ${day}'s description`}
        value={info.note}
        placeholder="Add a description"
        maxLength={200}
        multiline
        onSave={(note) => save({ note })}
      />}
    </div>
  )
}

/**
 * A short piece of text written in place: shown as text, and a box to type in
 * once clicked. An empty one shows its placeholder only while the column is
 * pointed at, so empty days stay quiet.
 */
function InlineText({
  label,
  value,
  placeholder,
  maxLength,
  multiline = false,
  onSave,
}: {
  label: string
  value: string
  placeholder: string
  maxLength: number
  multiline?: boolean
  onSave: (next: string) => Promise<boolean>
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)

  async function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) await onSave(next)
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        // The column's heading drags the day; typing here mustn't start a drag.
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            void commit()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            setDraft(value)
            setEditing(false)
          }
        }}
        className="w-full min-w-0 rounded-sm border-0 bg-transparent p-0 text-xs text-foreground outline-none ring-1 ring-ring/60"
      />
    )
  }
  return (
    <button
      type="button"
      aria-label={value ? `${label}: ${value}. Press to change it.` : `${label}: ${placeholder}`}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={cn(
        "min-w-0 rounded-sm text-left text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        multiline ? "line-clamp-2 break-words" : "truncate",
        !value && "opacity-0 group-hover/column:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      )}
    >
      {value || placeholder}
    </button>
  )
}

/** A day's own menu: add a day after it, fill it with AI, put it in its best order, copy it onto another day, remove it. */
function DayMenu({
  day,
  count,
  onCopyDay,
  onBestOrder,
  onFillDay,
}: {
  day: number
  count: number
  onCopyDay: (to: number) => void
  onBestOrder: () => void
  onFillDay: () => void
}) {
  const { page, refresh } = useTrip()
  const { trip } = page
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const [menuPage, setMenuPage] = React.useState<"main" | "copy">("main")
  const [removing, setRemoving] = React.useState(false)

  async function addAfter() {
    await run(async () => {
      await addTripDay(trip.id, day)
      await refresh()
    })
  }

  async function remove(activities: "bin" | "ideas") {
    const ok = await run(async () => {
      await removeTripDay(trip.id, day, activities)
      await refresh()
    })
    if (ok) setRemoving(false)
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => (open ? setMenuPage("main") : undefined)}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for Day ${day}`} disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <EllipsisIcon className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-56 overflow-y-auto">
          {menuPage === "copy" ? (
            <>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setMenuPage("main")
                }}
              >
                <ArrowLeftIcon className="size-4" />
                Copy day to
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {Array.from({ length: trip.days }, (_, index) => index + 1)
                .filter((other) => other !== day)
                .map((other) => (
                  <DropdownMenuItem key={other} onSelect={() => onCopyDay(other)}>
                    {dayLabel(other, trip.startDate)}
                  </DropdownMenuItem>
                ))}
            </>
          ) : (
            <>
              <DropdownMenuItem disabled={trip.days >= MAX_TRIP_DAYS} onSelect={() => void addAfter()}>
                <PlusIcon className="size-4" />
                Add a day after
              </DropdownMenuItem>
              {/* More Travel features part 6: "Timed, in the gaps". Without an AI key the window says so. */}
              <DropdownMenuItem onSelect={onFillDay}>
                <SparklesIcon className="size-4" />
                Fill this day
              </DropdownMenuItem>
              {/* Tyler, 3 Nov 2026: "From the hotel". Without a Google key it says so when pressed. */}
              <DropdownMenuItem disabled={count < 2} onSelect={onBestOrder}>
                <RouteIcon className="size-4" />
                Best order
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={count === 0 || trip.days < 2}
                onSelect={(event) => {
                  event.preventDefault()
                  setMenuPage("copy")
                }}
              >
                <CopyIcon className="size-4" />
                Copy day to
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={trip.days < 2}
                onSelect={() => (count === 0 ? void remove("ideas") : setRemoving(true))}
              >
                <Trash2Icon className="size-4" />
                Remove this day
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Day {day}?</DialogTitle>
            <DialogDescription>
              Day {day} has {count === 1 ? "1 activity" : `${count} activities`}. Later days move back by one
              {trip.startDate ? ", and the trip ends a day sooner" : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              Send them to Ideas to keep them for another day, or delete them to the trip's bin.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoving(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove("bin")}>
              Delete them
            </Button>
            <Button type="button" disabled={busy} onClick={() => void remove("ideas")}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Send to Ideas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
