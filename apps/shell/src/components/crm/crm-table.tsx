import * as React from "react"
import { ChevronDownIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableGroupRow,
  TableHead,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import { initialsFor } from "@/lib/crm/inbox-time"
import { pressSlideClassName } from "@/lib/layout/press-motion"
import { cn } from "@/lib/utils"

/** Whether the table showing has its end column of open buttons. */
const CrmTableActions = React.createContext(true)

/**
 * The CRM's lists as tables, laid out the way Project's middle panel lays out
 * its tasks (Tyler, 7 Nov 2026: "look at the design patter of project middle
 * panel especially how the table are laid out";
 * `apps/project/src/components/project/task-list.tsx`):
 *
 * - **Column headings** straight under the header, the first 16px in where
 *   the tabs' first word starts and the last 12px in, so the table lines up
 *   with the header above it.
 * - **Group headings** across the table, the label and a muted count, that
 *   fold the rows under them when pressed.
 * - **One line per row**, a little tighter than the shell's: the main cell
 *   holds a dot and the name with its small badges, and each other fact is a
 *   chip in its own column. Columns drop out as the panel narrows.
 * - **Actions** last: the open button, then a bin on a row that can be
 *   deleted, as Project's rows have (Tyler, 7 Nov 2026: "missing a trashcan
 *   icon").
 * - **Mass select** adds a tick column only as wide as the box.
 */
export function CrmTable<Column extends string>({
  columns,
  sort,
  direction,
  onSort,
  select,
  empty,
  after,
  actions = true,
  children,
}: {
  columns: TableHeaderColumn<Column>[]
  sort: Column
  direction: TableSortDirection
  onSort: (column: Column) => void
  /** Mass select's tick-all box, while it is on. */
  select?: {
    noun: string
    checked: boolean | "indeterminate"
    disabled?: boolean
    onToggle: () => void
  } | null
  /** Drawn in place of the rows when there are none. */
  empty?: React.ReactNode
  /** Under the table, inside the scroller: Load more. */
  after?: React.ReactNode
  /**
   * The column at the end with each row's open button (and bin). Off where a
   * row only opens and the cog says nothing a press does not (Tyler, 9 Nov
   * 2026, of System emails: "remove the action col").
   */
  actions?: boolean
  children: React.ReactNode
}) {
  const colSpan = columns.length + (select ? 1 : 0) + (actions ? 1 : 0)
  const [pressed, setPressed] = React.useState<object | null>(null)
  // The one record waiting to open: a new press cancels it, and so does the
  // table going away (found by the audit, 8 Nov 2026).
  const pending = React.useRef<number[]>([])
  const cancel = React.useCallback(() => {
    pending.current.forEach((timer) => window.clearTimeout(timer))
    pending.current = []
  }, [])
  React.useEffect(() => cancel, [cancel])
  const schedule = React.useCallback(
    (timers: number[]) => {
      cancel()
      pending.current = timers
    },
    [cancel]
  )
  const presses = React.useMemo(() => ({ pressed, setPressed, schedule, cancel }), [pressed, schedule, cancel])
  return (
    <RowPress.Provider value={presses}>
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <Table
        containerClassName="overflow-visible"
        className={`[&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3 [&_[data-column=select]]:w-8 [&_[data-column=select]]:min-w-8 [&_[data-column=select]+*]:pl-2 ${GROUP_EDGES}`}
      >
        <SortableTableHeader
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={onSort}
          leading={
            select ? (
              <SelectAllTableHead
                noun={select.noun}
                disabled={select.disabled}
                checked={select.checked}
                onCheckedChange={select.onToggle}
              />
            ) : null
          }
          trailing={
            actions ? (
              <TableHead column="meta">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null
          }
        />
        <TableBody>
          {empty ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            <CrmTableSpan.Provider value={colSpan}>
              <CrmTableActions.Provider value={actions}>{children}</CrmTableActions.Provider>
            </CrmTableSpan.Provider>
          )}
        </TableBody>
      </Table>
      {after ? <div className="grid justify-items-center p-2">{after}</div> : null}
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
    </RowPress.Provider>
  )
}

/**
 * Room at a group's edges (Tyler, 9 Nov 2026: "Add some spacing for the top
 * item and add a bit bigger spacing for bottom item"). The first row under a
 * group heading gets 8px above it in place of 4px, and a group's last row
 * gets 12px below it, before the next heading or the table's end. Rows in
 * the middle keep their 4px. A folded group, with one heading straight under
 * another, an ungrouped table and the empty line change nothing.
 */
const GROUP_EDGES = [
  "[&_[data-slot=table-group-row]+tr:not([data-slot=table-group-row])>td]:pt-2",
  "[&_tr:not([data-slot=table-group-row]):has(+[data-slot=table-group-row])>td]:pb-3",
  "[&_[data-slot=table-group-row]~tr:not([data-slot=table-group-row]):last-child>td]:pb-3",
].join(" ")

/** How many columns a group heading spans, handed down from the table. */
const CrmTableSpan = React.createContext(1)

/**
 * A group heading across the table: its label and a muted count, folding the
 * rows under it when pressed, as Project's headings do.
 */
export function CrmGroupRow({
  label,
  count,
  folded,
  onToggle,
}: {
  label: string
  count: number
  folded: boolean
  onToggle: () => void
}) {
  const colSpan = React.useContext(CrmTableSpan)
  return (
    <TableGroupRow
      colSpan={colSpan}
      inset="1rem"
      label={label}
      className="cursor-pointer select-none"
      onClick={onToggle}
    >
      <span className="text-muted-foreground">{count}</span>
      {/* Project's fold button (`task-list-heading.tsx`): faint until the
          heading is pointed at, always there on a phone. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={folded ? `Open ${label}` : `Fold ${label}`}
        aria-expanded={!folded}
        className="opacity-0 group-hover/table-group:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
      >
        <ChevronDownIcon className={cn("size-3.5 transition-transform", folded && "-rotate-90")} />
      </Button>
    </TableGroupRow>
  )
}

/** Whether the row drawing a cell is the one open on the right, for `OpenBar`. */
const RowOpen = React.createContext(false)

/**
 * The row pressed, shown open at once while the record waits to open, held
 * by the table so every other row's bar can shrink at the same moment.
 */
const RowPress = React.createContext<{
  pressed: object | null
  setPressed: React.Dispatch<React.SetStateAction<object | null>>
  /** Keeps the timers of the press waiting to open its record, cancelling any before. */
  schedule: (timers: number[]) => void
  cancel: () => void
} | null>(null)

/** How long a row's bar takes to grow; the record opens after it. */
const BAR_MS = 220

/**
 * The small dark bar before an open row's name, grown in as Admin's
 * Dashboards block does (Tyler, 8 Nov 2026: "For the table like the users. I
 * want to add the pill sliding in ui to the table items"). Every row has one,
 * with no width until its row opens: then its width grows over 220ms on
 * cubic-bezier(0.2, 0.8, 0.2, 1), sliding the name over, while the last
 * row's shrinks away. Closed, its margin cancels the cell's 8px gap, so the
 * name sits where it always did. It slides only when a press finds it on
 * screen; one drawn after, as on a refresh, snaps open (`press-motion.ts`).
 * `flex: none`, so it never shrinks. Put it first in a main cell's row of
 * parts; `MainCell` does.
 */
export function OpenBar() {
  const open = React.useContext(RowOpen)
  return (
    <span
      aria-hidden
      data-open-bar=""
      className={cn(
        "h-1.5 flex-none rounded-full bg-foreground",
        pressSlideClassName,
        open ? "mr-0 w-3" : "-mr-2 w-0"
      )}
    />
  )
}

/**
 * One row. Pressing it opens the record on the right. A right-click opens the row's own menu at the
 * pointer, unless words are selected, when the browser's own menu stays for
 * Copy. With Mass select on, a tick box comes first and pressing the row
 * ticks it.
 */
export function CrmTableRow({
  open,
  label,
  tick,
  onOpen,
  onDelete,
  onRightClick,
  cog,
  children,
}: {
  /**
   * What the cog does in place of opening the row, and what it is called:
   * a Pages row's cog opens its page in the builder (Tyler, 9 Nov 2026: "in
   * pages table clicking on the cog should go to the editor").
   */
  cog?: { label: string; onPress: () => void }
  /** A bin after the open button, as Project's rows have; the caller asks first. */
  onDelete?: () => void
  open: boolean
  /** What the row is, for its open button and tick box: "Jane Okafor". */
  label: string
  /** `none`: the row keeps the tick column's place but has no box, as a lead does. */
  tick?: { shown: boolean; ticked: boolean; onToggle: () => void; none?: boolean } | null
  onOpen: () => void
  onRightClick?: (x: number, y: number) => void
  children: React.ReactNode
}) {
  // Pressed, a row shows open at once and the record opens after the bar
  // has grown (Tyler, 8 Nov 2026: "the pill sliding in ui to the table
  // items"). Opening a record redraws the right panel, which kept the
  // browser busy for about 170ms and froze a bar growing at the same time.
  // With less motion asked for, it opens at once.
  const presses = React.useContext(RowPress)
  const withActions = React.useContext(CrmTableActions)
  // This row's own mark, made once, which the table holds while it is pressed.
  const [token] = React.useState(() => ({}))
  const shownOpen = presses?.pressed ? presses.pressed === token : open
  const setPressed = presses?.setPressed
  React.useEffect(() => {
    if (open && presses?.pressed === token) setPressed?.(null)
  }, [open, presses?.pressed, setPressed, token])
  const press = () => {
    if (!presses || !setPressed || open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Straight away: any other press waiting is dropped, and nothing is
      // left looking open that is not.
      presses?.cancel()
      setPressed?.(null)
      onOpen()
      return
    }
    const row = token
    setPressed(row)
    // Opens only if the page is still where it was pressed: Back or a link
    // taken meanwhile wins.
    const from = window.location.href
    presses.schedule([
      window.setTimeout(() => {
        if (window.location.href === from) onOpen()
      }, BAR_MS),
      // A record that never opens lets the address show the truth again.
      window.setTimeout(() => setPressed((current) => (current === row ? null : current)), BAR_MS + 2000),
    ])
  }
  return (
    <TableRow
      // Drawn as Project's rows are: no line between rows and no shade on the
      // open one (Tyler, 7 Nov 2026: "THe one you made is inconsistence and a
      // bit off"). The open one has `OpenBar` before its name (8 Nov 2026),
      // and says so to a screen reader.
      aria-current={open ? "true" : undefined}
      className={cn(
        "group [&>td]:py-1",
        // As tall as a row whose cog sets its height, so a table with no
        // cog column keeps the same spacing (Tyler, 9 Nov 2026: "the items
        // sit too close together").
        !withActions && "h-9",
        tick?.ticked && "bg-muted/40",
        // The name grey, black while pointed at and while open (Tyler,
        // 8 Nov 2026: "change the items to gray and if hover over it turns
        // black and when selected it stays black").
        "[&_[data-row-name]]:text-muted-foreground [&_[data-row-name]]:transition-colors hover:[&_[data-row-name]]:text-foreground",
        shownOpen && "[&_[data-row-name]]:text-foreground"
      )}
      rowAction={tick?.shown && !tick.none ? tick.onToggle : press}
      onContextMenu={(event) => {
        if (!onRightClick) return
        const selected = window.getSelection()
        if (selected && !selected.isCollapsed) return
        event.preventDefault()
        onRightClick(event.clientX, event.clientY)
      }}
    >
      {tick?.shown ? (
        <TableCell column="select">
          {tick.none ? null : (
            <Checkbox checked={tick.ticked} onCheckedChange={tick.onToggle} aria-label={`Tick ${label}`} />
          )}
        </TableCell>
      ) : null}
      <RowOpen.Provider value={shownOpen}>{children}</RowOpen.Provider>
      {withActions ? (
      <TableCell column="actions">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={cog?.label ?? `Open ${label}`}
          onClick={cog ? cog.onPress : press}
        >
          <SettingsIcon className="size-4" />
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${label}`}
            className="hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </Button>
        ) : null}
      </TableCell>
      ) : null}
    </TableRow>
  )
}

/** The main cell: an optional dot or mark, the name, then its small badges, one line. */
export function MainCell({
  lead,
  name,
  avatar,
  strong = false,
  children,
}: {
  lead?: React.ReactNode
  name: string
  /**
   * A person's row: their initials in a small round avatar between the dot
   * and the name (Tyler, 9 Nov 2026: "Users, inbox, subscribers and leads
   * should have its avatar beside it"), as the right panel's header draws it.
   */
  avatar?: { name: string | null | undefined; email: string }
  /** Unread: full weight. */
  strong?: boolean
  children?: React.ReactNode
}) {
  return (
    <TableCell column="main" className="min-w-40">
      <span className="flex min-w-0 items-center gap-2">
        <OpenBar />
        {lead}
        {avatar ? (
          <Avatar aria-hidden className="size-7">
            <AvatarFallback className="text-[0.5625rem] font-medium">{initialsFor(avatar.name, avatar.email)}</AvatarFallback>
          </Avatar>
        ) : null}
        <span data-row-name="" className={cn("truncate", strong ? "font-semibold" : "font-medium")}>
          {name}
        </span>
        {children}
      </span>
    </TableCell>
  )
}

/** A fact as a chip in its own column, the way Project's Status and Priority read. */
export function Chip({
  children,
  muted = false,
  className,
}: {
  children: React.ReactNode
  muted?: boolean
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("max-w-44", muted && "text-muted-foreground", className)}>
      <span className="truncate">{children}</span>
    </Badge>
  )
}

/**
 * The coloured dot every row starts with, Project's status dot: 10px, solid,
 * one colour per state. Never an icon in its place and never an empty ring.
 */
export function Dot({ className, label }: { className: string; label?: string }) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
    />
  )
}

/** Remembers which headings are folded while the screen is open. */
export function useFolds() {
  const [folded, setFolded] = React.useState<Set<string>>(() => new Set())
  return {
    folded: (key: string) => folded.has(key),
    toggle: (key: string) =>
      setFolded((current) => {
        const next = new Set(current)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
  }
}

/**
 * The dot colours, in Project's palette (amber to do, blue under way, green
 * done, red stuck, grey nothing to do), so a dot means the same on every tab.
 */
export const DOT = {
  unread: "bg-blue-500",
  read: "bg-muted-foreground/40",
  quiet: "bg-muted-foreground/40",
  stage: {
    new: "bg-amber-500",
    contacted: "bg-blue-500",
    quoted: "bg-violet-500",
    won: "bg-green-600",
    lost: "bg-muted-foreground/50",
  },
  broadcast: {
    draft: "bg-amber-500",
    scheduled: "bg-blue-500",
    sending: "bg-blue-500",
    paused: "bg-red-500",
    sent: "bg-green-600",
  },
} as const
