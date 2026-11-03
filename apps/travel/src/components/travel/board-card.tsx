import * as React from "react"
import { createPortal } from "react-dom"
import { useSortable } from "@dnd-kit/sortable"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckIcon,
  CircleCheckIcon,
  CopyIcon,
  PanelRightOpenIcon,
  Trash2Icon,
} from "lucide-react"

import { CARD_CLASS } from "@/components/travel/activity-card"
import type { BoardActions } from "@/components/travel/board-actions"
import { dayLabel } from "@/components/travel/new-activity"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Activity } from "@/lib/api/travel/trips"
import { cn } from "@/lib/utils"

/** A point on the page for a menu to open from, in the page's body so no scroller shifts it off the mouse. */
const PointAnchor = React.forwardRef<HTMLSpanElement, { x: number; y: number }>(function PointAnchor(
  { x, y, ...props },
  ref
) {
  return createPortal(
    <span ref={ref} aria-hidden {...props} className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />,
    document.body
  )
})

/**
 * The right-click menu on a card (task part 15), copied from Project's
 * `task-right-click.tsx`: Open, Duplicate, Move to day, Mark done and Delete. On a phone a long press opens it too, which is how a card moves
 * between days there (task part 46).
 */
export function CardMenu({
  at,
  activity,
  days,
  startDate,
  actions,
  onOpen,
  onClose,
}: {
  at: { x: number; y: number }
  activity: Activity
  days: number
  startDate: string | null
  actions: BoardActions
  onOpen: () => void
  onClose: () => void
}) {
  // "Move to day" steps into a list of days in the same menu, with a way back.
  const [page, setPage] = React.useState<"main" | "days">("main")
  return (
    // Not modal, so a right-click on another card moves the menu there in one go.
    <DropdownMenu open onOpenChange={(open) => (open ? undefined : onClose())} modal={false}>
      <DropdownMenuTrigger asChild>
        <PointAnchor x={at.x} y={at.y} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-96 w-52 overflow-y-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {page === "days" ? (
          <>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setPage("main")
              }}
            >
              <ArrowLeftIcon className="size-4" />
              Move to day
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={activity.day === null} onSelect={() => void actions.moveTo(activity, null)}>
              Ideas
            </DropdownMenuItem>
            {Array.from({ length: days }, (_, index) => index + 1).map((day) => (
              <DropdownMenuItem
                key={day}
                disabled={activity.day === day}
                onSelect={() => void actions.moveTo(activity, day)}
              >
                {dayLabel(day, startDate)}
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          <>
            <DropdownMenuLabel className="truncate">{activity.title}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onOpen}>
              <PanelRightOpenIcon className="size-4" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void actions.duplicate(activity)}>
              <CopyIcon className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setPage("days")
              }}
            >
              <CalendarDaysIcon className="size-4" />
              Move to day
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void actions.setField(activity, { done: !activity.done })}>
              <CircleCheckIcon className="size-4" />
              {activity.done ? "Mark not done" : "Mark done"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void actions.remove([activity.id])}>
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** How long a finger rests on a card before its menu opens, on a phone. */
const LONG_PRESS_MS = 550

/**
 * One card on the board: drags by itself, opens on a click, opens its menu on
 * a right-click or a long press, and carries the Done tick (task part 6) and,
 * while Mass select is on, a tick box (task part 14).
 */
export function BoardCard({
  activity,
  open,
  selecting,
  selected,
  onToggleSelected,
  onOpen,
  onMenu,
  onDone,
  children,
}: {
  activity: Activity
  /** Open in the right panel: outlined in the text colour. */
  open: boolean
  selecting: boolean
  selected: boolean
  onToggleSelected: () => void
  onOpen: () => void
  onMenu: (at: { x: number; y: number }) => void
  onDone: () => void
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: activity.id })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
    : undefined
  const pressRef = React.useRef<number | null>(null)
  const pressed = React.useRef(false)
  const cancelPress = () => {
    if (pressRef.current !== null) window.clearTimeout(pressRef.current)
    pressRef.current = null
  }

  return (
    // The card stays in its column as a faint placeholder while its copy follows the pointer.
    <li
      ref={setNodeRef}
      style={style}
      data-activity-id={activity.id}
      className={cn("group/card relative", isDragging && "opacity-40")}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu({ x: event.clientX, y: event.clientY })
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0]
        pressed.current = false
        cancelPress()
        pressRef.current = window.setTimeout(() => {
          pressed.current = true
          onMenu({ x: touch.clientX, y: touch.clientY })
        }, LONG_PRESS_MS)
      }}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
    >
      <button
        type="button"
        onClick={() => {
          // A long press opened the menu; the finger lifting isn't a click.
          if (pressed.current) {
            pressed.current = false
            return
          }
          onOpen()
        }}
        {...listeners}
        {...attributes}
        role="button"
        aria-roledescription="draggable activity"
        aria-current={open || undefined}
        className={cn(
          CARD_CLASS,
          // A card opens on a click, so it shows a pointer rather than the board's hand.
          "cursor-pointer overflow-hidden hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          selecting && "pl-8",
          open && "border-foreground ring-1 ring-foreground",
          selected && "bg-accent/60"
        )}
      >
        {children}
      </button>
      {selecting ? (
        // Beside the card's button rather than in it: a button can't hold another.
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          aria-label={`Select ${activity.title}`}
          className="absolute top-3 left-2.5 bg-card"
        />
      ) : null}
      <button
        type="button"
        onClick={onDone}
        aria-label={activity.done ? `Mark ${activity.title} not done` : `Mark ${activity.title} done`}
        aria-pressed={activity.done}
        className={cn(
          "absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground transition-opacity hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          activity.done
            ? "border-green-600 bg-green-600 text-white opacity-100 hover:text-white"
            : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          activity.photoUrl && !activity.done && "bg-card/90"
        )}
      >
        <CheckIcon className="size-3.5" aria-hidden />
      </button>
    </li>
  )
}
