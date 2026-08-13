"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

type TableHeadProps = React.ComponentProps<"th"> & {
  column?: "main" | "meta" | "preview" | "select"
}

type TableSortDirection = "asc" | "desc"

type TableSortButtonProps = React.ComponentProps<"button"> & {
  active: boolean
  direction: TableSortDirection
}

type TableCellProps = React.ComponentProps<"td"> & {
  column?: "main" | "meta" | "mutedMeta" | "preview" | "select" | "actions"
}

type TableRowProps = React.ComponentProps<"tr"> & {
  /**
   * What clicking anywhere in the row does — always the same thing the row's
   * title already does, so the row is a bigger target for it and never a
   * second, different action.
   *
   * A row with one gets the pointer cursor and the grey hover tint; a row
   * without stays flat, so the tint always means something will happen.
   *
   * The row is deliberately not *tabbable*. Its title is already a link or a
   * button, so the keyboard reaches the same place without a second tab stop
   * on every row of every table.
   *
   * It is focusable by a click, though (`tabIndex={-1}`), and the handler
   * focuses it before running this. That is only so a window opened from a row
   * has something to give focus back to when it closes.
   */
  rowAction?: () => void
}

/**
 * Everything inside a row that owns its own click, so the row must not take it:
 * the controls themselves, plus the two columns that exist only to hold
 * controls.
 *
 * The columns are listed as well as the controls because a *disabled* button
 * carries `pointer-events-none` — the click misses the button entirely and
 * lands on the cell behind it, which would otherwise read as a click on the
 * row. Clicking a greyed-out Delete must never open the thing it refused to
 * delete. `[tabindex]` catches the wrappers built to be clicked in a disabled
 * control's place, such as `DisabledReason`.
 */
const rowInteractiveSelector = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "[tabindex]",
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  '[data-column="select"]',
  '[data-column="actions"]',
].join(", ")

function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & {
  /**
   * Classes for the box the table scrolls inside. A max-height belongs here
   * and nowhere else: this box is already the scroll container, so it is what
   * a sticky heading sticks to. Cap anything further out and the headings
   * scroll away with the rows.
   */
  containerClassName?: string
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm [&_tbody_tr:first-child_td]:pt-4 [&_tbody_tr:last-child_td]:pb-4 [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableSurface({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-surface"
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
        className
      )}
      {...props}
    />
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // The heading row's own top and bottom hairlines are drawn in `theme.css`
      // from the same variables the card's border uses, so a change in the
      // Styling settings moves both together.
      className={cn("[&_tr]:bg-muted/50", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, rowAction, onClick, ...props }: TableRowProps) {
  function handleClick(event: React.MouseEvent<HTMLTableRowElement>) {
    onClick?.(event)
    if (!rowAction || event.defaultPrevented) return
    // A held modifier means "open this somewhere else", which a row is not a
    // link and cannot do. Doing nothing beats doing the wrong thing.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!(event.target instanceof Element)) return
    // Whatever is under the pointer owns this click. Bounded to the row: the
    // table itself sits inside scrollers and wrappers that would match too.
    const owner = event.target.closest(rowInteractiveSelector)
    // The row itself never counts as something inside the row that owns the
    // click — it is the thing being clicked. It matches the selector only
    // because it carries `tabIndex={-1}` for the focus handover below.
    if (owner && owner !== event.currentTarget && event.currentTarget.contains(owner)) {
      return
    }
    // Dragging across a cell to copy some text is not a click on the row.
    const selection = window.getSelection()
    if (
      selection &&
      !selection.isCollapsed &&
      event.currentTarget.contains(selection.anchorNode)
    ) {
      return
    }
    // Take focus before doing anything. A row cannot be tabbed to — that is
    // deliberate, above — but clicking a `<tr>` moves focus nowhere at all, so
    // a window opened from here has nothing to hand focus back to when it
    // closes and it lands on the page instead. `tabIndex={-1}` below is what
    // makes this possible without adding a tab stop to every row of every
    // table. The ring is `focus-visible`, so a mouse click does not paint one.
    //
    // Without `preventScroll` this also scrolls the row into view, which in a
    // table scrolled sideways yanks it back to the left on every click. The row
    // was just clicked, so it is already where the reader can see it.
    event.currentTarget.focus({ preventScroll: true })
    rowAction()
  }

  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-0 transition-colors has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted data-[state=selected]:hover:bg-muted",
        rowAction && "cursor-pointer hover:bg-muted/50",
        // A focused row has to show it. Inside, because a wide table scrolls
        // and a `<tr>` cannot paint a ring — see `focusRingInset`. Only on
        // keyboard focus, so the click that focuses a row draws nothing.
        focusRingInset,
        className
      )}
      // Reachable by a click, never by Tab — see `handleClick`.
      tabIndex={rowAction ? -1 : undefined}
      onClick={rowAction || onClick ? handleClick : undefined}
      {...props}
    />
  )
}

function TableHead({ className, column, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      data-column={column}
      className={cn(
        "h-10 px-5 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        column === "main" &&
          "w-full min-w-80 text-left text-xs font-medium text-muted-foreground sm:text-sm",
        column === "meta" &&
          "w-px whitespace-nowrap text-left text-xs font-medium text-muted-foreground sm:text-sm",
        column === "preview" &&
          "hidden w-44 max-w-44 text-left text-xs font-medium text-muted-foreground sm:text-sm md:table-cell",
        column === "select" && "w-11 min-w-11",
        className
      )}
      {...props}
    />
  )
}

function TableSortButton({
  active,
  children,
  className,
  direction,
  ...props
}: TableSortButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "group/sort flex h-8 cursor-pointer items-center gap-2 px-0 text-xs font-medium text-inherit outline-none transition-colors hover:text-foreground sm:text-sm",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {/* The slot always reserves space so the label never shifts. The sorted
          column keeps its arrow; other columns reveal the chevron on hover. */}
      <span className="flex size-3.5 items-center justify-center">
        {!active ? (
          <ChevronsUpDownIcon className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-50 group-focus-visible/sort:opacity-50" />
        ) : direction === "asc" ? (
          <ArrowUpIcon className="size-3" />
        ) : (
          <ArrowDownIcon className="size-3" />
        )}
      </span>
    </button>
  )
}

function TableCell({ className, column, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      data-column={column}
      className={cn(
        "px-5 py-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        column === "main" && "min-w-80",
        // "actions" is "meta" that a clickable row keeps its hands off. It
        // looks identical; the difference is only who owns the click.
        (column === "meta" || column === "actions") &&
          "whitespace-nowrap text-left",
        column === "mutedMeta" &&
          "whitespace-nowrap text-left text-xs text-muted-foreground sm:text-sm",
        column === "preview" &&
          "hidden w-44 max-w-44 text-left text-xs text-muted-foreground sm:text-sm md:table-cell",
        column === "select" && "w-11 min-w-11",
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableSurface,
  TableHeader,
  TableBody,
  TableHead,
  TableSortButton,
  TableRow,
  TableCell,
}
export type { TableSortDirection }
