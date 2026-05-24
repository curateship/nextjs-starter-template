"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type TableHeadProps = React.ComponentProps<"th"> & {
  column?: "main" | "meta" | "preview" | "select"
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
        "overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
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

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-0 transition-colors has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
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
  TableRow,
  TableCell,
  TableCaption,
}
