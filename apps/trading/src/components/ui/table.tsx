"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Pins a `<TableHeader>` to the top of a scroll container with a light-gray
 * fill. Pair with {@link STICKY_SCROLL_OVERRIDES} on the enclosing ScrollArea.
 */
export const STICKY_TABLE_HEADER =
  "sticky top-0 z-20 bg-[#fcfcfc] dark:bg-muted [&_tr]:border-b [&_th]:bg-[#fcfcfc] dark:[&_th]:bg-muted"

/**
 * ScrollArea class overrides that let a sticky `<TableHeader>` pin to the
 * scroll viewport: neutralize Radix's `display:table` content wrapper and the
 * Table's own `overflow-x` container so neither intercepts the sticky context.
 */
export const STICKY_SCROLL_OVERRIDES =
  "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=table-container]]:overflow-visible"

type TableHeadProps = React.ComponentProps<"th"> & {
  column?: "main" | "meta" | "preview" | "select"
}

type TableSortDirection = "asc" | "desc"

type TableSortButtonProps = React.ComponentProps<"button"> & {
  active: boolean
  direction: TableSortDirection
}

type TableCellProps = React.ComponentProps<"td"> & {
  column?: "main" | "meta" | "mutedMeta" | "preview" | "select"
}

type TableStatusIndicatorProps = {
  tone: "error" | "success"
  children: React.ReactNode
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
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
        "min-w-0 max-w-full overflow-hidden rounded-xl border border-foreground/5 bg-card text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

function TableStatusIndicator({
  tone,
  children,
}: TableStatusIndicatorProps) {
  return (
    <span
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-2 py-1 text-xs",
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )}
    >
      {children}
    </span>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b-0 [&_tr]:bg-muted/50",
        className
      )}
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

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, onClick, ...props }: React.ComponentProps<"tr">) {
  // A row that handles clicks is interactive: it gets a pointer cursor and
  // marks itself as a hover group so its main-cell title can underline.
  const interactive = onClick != null
  return (
    <tr
      data-slot="table-row"
      onClick={onClick}
      className={cn(
        "border-0 transition-colors has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        interactive && "group/row cursor-pointer",
        className
      )}
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
          "w-full min-w-[320px] text-left text-xs font-medium text-muted-foreground sm:text-sm",
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
        "flex h-8 cursor-pointer items-center gap-2 px-0 text-xs font-medium text-inherit outline-none transition-colors hover:text-foreground sm:text-sm",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      <span className="flex size-3.5 items-center justify-center">
        {!active ? (
          <ChevronsUpDownIcon className="size-3 opacity-50" />
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
        // In an interactive row the title underlines on hover. It sits on the
        // `font-medium` title element itself (not the cell) so muted subtitles
        // are left alone — an ancestor's underline can't be undone by children.
        column === "main" &&
          "min-w-[320px] underline-offset-2 group-hover/row:[&_.font-medium]:underline",
        column === "meta" && "whitespace-nowrap text-left",
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

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableSurface,
  TableStatusIndicator,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableSortButton,
  TableRow,
  TableCell,
  TableCaption,
}
export type { TableSortDirection }
