import * as React from "react"
import { ChevronDownIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
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
import { cn } from "@/lib/utils"

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
  children: React.ReactNode
}) {
  const colSpan = columns.length + (select ? 2 : 1)
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <Table
        containerClassName="overflow-visible"
        className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3 [&_[data-column=select]]:w-8 [&_[data-column=select]]:min-w-8 [&_[data-column=select]+*]:pl-2"
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
            <TableHead column="meta">
              <span className="sr-only">Actions</span>
            </TableHead>
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
            <CrmTableSpan.Provider value={colSpan}>{children}</CrmTableSpan.Provider>
          )}
        </TableBody>
      </Table>
      {after ? <div className="grid justify-items-center p-2">{after}</div> : null}
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

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
  children,
}: {
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
  return (
    <TableRow
      // Drawn exactly as Project's rows are: no line between rows, no shade
      // or bar on the open one (Tyler, 7 Nov 2026: "THe one you made is
      // inconsistence and a bit off"). The open one says so to a screen reader.
      aria-current={open ? "true" : undefined}
      className={cn("group [&>td]:py-1", tick?.ticked && "bg-muted/40")}
      rowAction={tick?.shown && !tick.none ? tick.onToggle : onOpen}
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
      {children}
      <TableCell column="actions">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Open ${label}`} onClick={onOpen}>
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
    </TableRow>
  )
}

/** The main cell: an optional dot or mark, the name, then its small badges, one line. */
export function MainCell({
  lead,
  name,
  strong = false,
  children,
}: {
  lead?: React.ReactNode
  name: string
  /** Unread: full weight. */
  strong?: boolean
  children?: React.ReactNode
}) {
  return (
    <TableCell column="main" className="min-w-40">
      <span className="flex min-w-0 items-center gap-2">
        {lead}
        <span className={cn("truncate", strong ? "font-semibold" : "font-medium")}>{name}</span>
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
