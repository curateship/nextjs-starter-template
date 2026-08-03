"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

import { focusRingInset } from "@/lib/focus-ring"
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
  column?: "main" | "meta" | "mutedMeta" | "preview" | "select"
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

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-0 transition-colors has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        // Only some tables make their rows focusable, but where they do the
        // row has to show it. Inside, because a wide table scrolls and a `<tr>`
        // cannot paint a ring — see `focusRingInset`.
        focusRingInset,
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
        column === "main" && "min-w-[320px]",
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
